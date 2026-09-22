import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";
import { hasScorableData, profileText, scoreProfilesAgainstJd, type ScorableCandidate } from "@/lib/smartSourceDrop";

const FEATURE_KEY = "Smart Source.ai";

// Called by the Smart Source LinkedIn Chrome extension. Takes one or more
// scraped LinkedIn profiles and files each straight into a Smart Source
// project — no AI search involved. This is the one thing the existing
// Smart Source.ai flows don't cover: every other path into
// smart_source_candidates goes through /api/smart-source/search (an actual
// JD/describe/manual criteria search). Here the recruiter already knows
// exactly who they want; we just need a search_id to satisfy the schema, so
// each request gets one lightweight "extension" search row that all of its
// candidates hang off of.
type CandidateInput = {
  profile_url: string;
  name?: string | null;
  designation?: string | null;
  company?: string | null;
  location?: string | null;
  experience_years?: number | null;
  // Set by the popup from a prior GET /extension/contact-lookup call (run
  // when the profile was first detected) -- never looked up again here, so
  // capture stays a plain insert with no added external calls/latency.
  contact_email?: string | null;
  contact_phone?: string | null;
  contact_source_url?: string | null;
  // Never sourced from LinkedIn or the AI contact lookup -- always typed by
  // the recruiter into the extension's editable details form.
  compensation?: string | null;
  expected_ctc?: string | null;
  notice_period?: string | null;
};

// Every editable detail field the extension can send, keyed to its column
// on smart_source_candidates. Used to build a safe, non-destructive update
// when a captured profile turns out to already be in the target project --
// the extension always sends the full form on every Add click, so a value
// left blank there must never be allowed to blank out a value that's
// already saved (that's a silent data loss the recruiter didn't ask for).
// Only a non-empty incoming value is ever applied.
const DETAIL_FIELD_MAP: Record<string, keyof CandidateInput> = {
  name: "name",
  designation: "designation",
  company: "company",
  location: "location",
  public_email: "contact_email",
  public_phone: "contact_phone",
  compensation: "compensation",
  expected_ctc: "expected_ctc",
  notice_period: "notice_period",
};

function buildNonDestructiveCandidateUpdates(c: CandidateInput): Record<string, string | number> {
  const updates: Record<string, string | number> = {};
  for (const [column, inputKey] of Object.entries(DETAIL_FIELD_MAP)) {
    const value = c[inputKey];
    if (typeof value === "string" && value.trim()) {
      updates[column] = value.trim();
    }
  }
  if (typeof c.experience_years === "number" && c.experience_years >= 0 && c.experience_years < 70) {
    updates.experience_years = c.experience_years;
  }
  return updates;
}

type CandidateResult = {
  profile_url: string;
  status: "added" | "duplicate" | "failed";
  error?: string;
  // Set when this was a duplicate AND a note was typed -- the note still
  // gets saved (appended to whatever's already there) even though the
  // candidate itself wasn't re-added. Lets the popup say "note added" rather
  // than implying nothing happened.
  noteAdded?: boolean;
  // Set when this was a duplicate AND at least one non-empty detail field
  // (role, company, CTC, etc.) differed from -- or filled in a gap in --
  // the saved record, and was applied. Independent of noteAdded; a revisit
  // can update details, add a note, both, or neither.
  detailsUpdated?: boolean;
};

export async function POST(request: Request) {
  let user, supabase, orgId;
  try {
    ({ user, supabase, orgId } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }

  const body = await request.json().catch(() => null);
  const candidates: CandidateInput[] = Array.isArray(body?.candidates) ? body.candidates : [];
  const projectId = typeof body?.projectId === "string" && body.projectId ? body.projectId : null;
  const newProjectName = typeof body?.newProjectName === "string" ? body.newProjectName.trim() : "";
  // Optional note typed in the extension popup at capture time — applied to
  // every member row this request creates. Keeps recruiters from having to
  // open the web app just to leave a first comment.
  const comment = typeof body?.comment === "string" && body.comment.trim() ? body.comment.trim() : null;

  const validCandidates = candidates.filter((c) => typeof c?.profile_url === "string" && c.profile_url);
  if (!validCandidates.length) {
    return NextResponse.json({ error: "No LinkedIn profile to add." }, { status: 400 });
  }
  if (!projectId && !newProjectName) {
    return NextResponse.json({ error: "Choose a project or name a new one." }, { status: 400 });
  }

  // Resolve the target project — same create-if-new pattern as
  // /api/smart-source/add-to-project.
  let targetProjectId = projectId;
  let targetProjectName: string | null = null;
  // A brand-new project has no JD yet; an existing one might -- fetched here
  // so a freshly-added candidate can be scored against it immediately,
  // rather than sitting unscored until someone happens to re-drop the JD.
  let targetProjectJdText: string | null = null;
  if (!targetProjectId && newProjectName) {
    const { data: project, error: projectError } = await supabase
      .from("smart_source_projects")
      .insert({ name: newProjectName, created_by: user.id, org_id: orgId || null })
      .select()
      .single();
    if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 });
    targetProjectId = project.id;
    targetProjectName = project.name;
  } else {
    const { data: existingProject, error: findError } = await supabase
      .from("smart_source_projects")
      .select("id, name, jd_text")
      .eq("id", targetProjectId)
      .maybeSingle();
    if (findError || !existingProject) {
      return NextResponse.json({ error: "That project couldn't be found." }, { status: 404 });
    }
    targetProjectName = existingProject.name;
    targetProjectJdText = existingProject.jd_text || null;
  }

  // One stub search row per request — holds every candidate this call adds.
  const { data: search, error: searchError } = await supabase
    .from("smart_source_searches")
    .insert({
      org_id: orgId || null,
      created_by: user.id,
      input_mode: "manual",
      query_text: `LinkedIn extension capture — ${new Date().toISOString().slice(0, 10)}`,
      search_query: "",
      status: "completed",
    })
    .select()
    .single();

  if (searchError || !search) {
    return NextResponse.json({ error: searchError?.message || "Could not record this capture." }, { status: 500 });
  }

  const results: CandidateResult[] = [];

  for (const c of validCandidates) {
    try {
      // Already in this project? Skip rather than create a duplicate row —
      // checked by profile_url within the target project's own members.
      const { data: existingLink } = await supabase
        .from("smart_source_project_members")
        .select("id, candidate_id, smart_source_candidates!inner(profile_url)")
        .eq("project_id", targetProjectId)
        .eq("smart_source_candidates.profile_url", c.profile_url)
        .maybeSingle();

      if (existingLink) {
        // Apply any edited/filled-in details from the extension's form onto
        // the existing candidate record. Best-effort and additive-only (see
        // buildNonDestructiveCandidateUpdates) -- a failure here must not
        // block the note below or fail the whole request.
        let detailsUpdated = false;
        const candidateUpdates = buildNonDestructiveCandidateUpdates(c);
        if (Object.keys(candidateUpdates).length > 0) {
          const { error: detailsError } = await supabase
            .from("smart_source_candidates")
            .update(candidateUpdates)
            .eq("id", existingLink.candidate_id);
          if (!detailsError) detailsUpdated = true;
        }

        // Candidate's already here -- but if the recruiter typed a note this
        // time (e.g. revisiting the profile on LinkedIn later), save it
        // rather than silently dropping it. Appended with a timestamp so
        // earlier notes aren't overwritten.
        if (comment) {
          const { data: existingMember } = await supabase
            .from("smart_source_project_members")
            .select("comments")
            .eq("id", existingLink.id)
            .maybeSingle();
          const stamp = new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
          const appended = existingMember?.comments
            ? `${existingMember.comments}\n\n[${stamp}] ${comment}`
            : `[${stamp}] ${comment}`;
          const { error: noteError } = await supabase
            .from("smart_source_project_members")
            .update({ comments: appended, updated_at: new Date().toISOString() })
            .eq("id", existingLink.id);
          if (!noteError) {
            results.push({ profile_url: c.profile_url, status: "duplicate", noteAdded: true, detailsUpdated });
            continue;
          }
        }
        results.push({ profile_url: c.profile_url, status: "duplicate", detailsUpdated });
        continue;
      }

      const { data: candidate, error: candError } = await supabase
        .from("smart_source_candidates")
        .insert({
          search_id: search.id,
          org_id: orgId || null,
          name: c.name || null,
          designation: c.designation || null,
          company: c.company || null,
          location: c.location || null,
          experience_years: typeof c.experience_years === "number" ? c.experience_years : null,
          profile_url: c.profile_url,
          source: "linkedin",
          public_email: c.contact_email || null,
          public_phone: c.contact_phone || null,
          contact_source_url: c.contact_source_url || null,
          contact_checked_at: c.contact_email || c.contact_phone || c.contact_source_url ? new Date().toISOString() : null,
          compensation: c.compensation || null,
          expected_ctc: c.expected_ctc || null,
          notice_period: c.notice_period || null,
        })
        .select()
        .single();

      if (candError || !candidate) throw new Error(candError?.message || "Could not save this candidate.");

      const { data: member, error: memberError } = await supabase
        .from("smart_source_project_members")
        .insert({
          project_id: targetProjectId,
          candidate_id: candidate.id,
          added_by: user.id,
          comments: comment,
        })
        .select("id")
        .single();

      if (memberError || !member) throw new Error(memberError?.message || "Could not add this candidate.");

      // Best-effort: a scoring hiccup must not undo the add, so this never
      // throws past this block -- the candidate just stays unscored, same
      // fallback as the JD-drop box.
      if (targetProjectJdText) {
        try {
          const scorable: ScorableCandidate = {
            name: c.name || null,
            designation: c.designation || null,
            company: c.company || null,
            location: c.location || null,
            experience_years: typeof c.experience_years === "number" ? c.experience_years : null,
            qualification: null,
            skills: null,
            evaluation_summary: null,
            resume_text: null,
          };
          if (hasScorableData(scorable)) {
            const [result] = await scoreProfilesAgainstJd(targetProjectJdText, [
              { key: member.id, profile: profileText(scorable) },
            ]);
            if (result) {
              await supabase
                .from("smart_source_project_members")
                .update({
                  jd_score: result.score,
                  jd_summary: result.summary,
                  jd_strengths: result.strengths,
                  jd_gaps: result.gaps,
                  jd_scored_at: new Date().toISOString(),
                })
                .eq("id", member.id);
            }
          }
        } catch (err) {
          console.warn("Extension capture: scoring failed, candidate left unscored:", err);
        }
      }

      results.push({ profile_url: c.profile_url, status: "added" });
    } catch (err) {
      results.push({
        profile_url: c.profile_url,
        status: "failed",
        error: err instanceof Error ? err.message : "Failed.",
      });
    }
  }

  const anyFailed = results.some((r) => r.status === "failed");
  return NextResponse.json(
    { results, projectId: targetProjectId, projectName: targetProjectName },
    { status: anyFailed ? 207 : 200 }
  );
}
