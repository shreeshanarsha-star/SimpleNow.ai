import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";
import {
  MAX_UPLOAD_BYTES,
  analyzeDocument,
  extractText,
  isDuplicateCandidate,
  scoreProfilesAgainstJd,
  profileText,
  type ExistingIdentity,
} from "@/lib/smartSourceDrop";

const FEATURE_KEY = "Smart Source.ai";

export const runtime = "nodejs";
export const maxDuration = 60;

// New CVs land in the first stage of the pipeline.
const NEW_CV_STAGE = "CV Sourced";

// Per-project drop box, one file per request (the browser fans a multi-file
// drop out into several calls, which keeps each request under the platform's
// body-size and time limits and lets the UI show progress).
//
//  - A JD replaces the project's active JD (the old one is simply
//    overwritten). Only one JD is accepted per drop: the browser tags every
//    request in a drop with the same dropId and the update below only
//    succeeds for the first JD carrying that id, atomically. Re-scoring of
//    the project's candidates is driven by the browser afterwards, through
//    /rescore, so this call stays fast.
//  - A CV is parsed into a candidate and filed into the project at the
//    "CV Sourced" stage. Duplicates (same email/phone, or same name +
//    company/title) are skipped. If the project already has a JD the new
//    candidate is scored against it straight away.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let user, supabase, orgId;
  try {
    ({ user, supabase, orgId } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const { id: projectId } = await params;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const dropIdRaw = form?.get("dropId");
  const dropId = typeof dropIdRaw === "string" && /^[A-Za-z0-9-]{8,64}$/.test(dropIdRaw) ? dropIdRaw : null;

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ status: "failed", error: "No file received." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { status: "failed", fileName: file.name, error: "That file is too large (max 4MB)." },
      { status: 400 }
    );
  }

  const { data: project, error: projectError } = await supabase
    .from("smart_source_projects")
    .select("id, name, jd_text")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) return NextResponse.json({ status: "failed", error: projectError.message }, { status: 500 });
  if (!project) return NextResponse.json({ status: "failed", error: "That project couldn't be found." }, { status: 404 });

  const fail = (error: string, status = 200) =>
    NextResponse.json({ status: "failed", fileName: file.name, error }, { status });

  let text: string;
  try {
    text = await extractText(file);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Couldn't read that file.");
  }

  let analysis;
  try {
    analysis = await analyzeDocument(text);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Couldn't analyse that file.");
  }

  // ---- JD -------------------------------------------------------------
  if (analysis.kind === "jd") {
    if (!dropId) return fail("Missing drop reference. Refresh and try again.", 400);
    const replaced = !!project.jd_text;

    const { data: updated, error: updateError } = await supabase
      .from("smart_source_projects")
      .update({
        jd_text: text.slice(0, 40_000),
        jd_file_name: file.name,
        jd_updated_at: new Date().toISOString(),
        jd_drop_id: dropId,
      })
      .eq("id", projectId)
      .or(`jd_drop_id.is.null,jd_drop_id.neq.${dropId}`)
      .select("id");

    if (updateError) return fail(updateError.message, 500);
    if (!updated || updated.length === 0) {
      return NextResponse.json({
        status: "rejected",
        kind: "jd",
        fileName: file.name,
        error: "One JD at a time. Only the first JD in a drop is used.",
      });
    }
    return NextResponse.json({ status: "saved", kind: "jd", fileName: file.name, replaced });
  }

  // ---- CV -------------------------------------------------------------
  if (analysis.kind === "cv" && analysis.cv) {
    const cv = analysis.cv;
    if (!cv.name && !cv.email) {
      return fail("Couldn't find a candidate's name in this CV.");
    }

    const { data: memberRows, error: membersError } = await supabase
      .from("smart_source_project_members")
      .select("smart_source_candidates(name, company, designation, public_email, public_phone)")
      .eq("project_id", projectId);
    if (membersError) return fail(membersError.message, 500);

    const existing: ExistingIdentity[] = (memberRows || [])
      .map((r: { smart_source_candidates: unknown }) => r.smart_source_candidates as ExistingIdentity | null)
      .filter((c: ExistingIdentity | null): c is ExistingIdentity => !!c && typeof c === "object");

    if (isDuplicateCandidate(cv, existing)) {
      return NextResponse.json({ status: "duplicate", kind: "cv", fileName: file.name, name: cv.name });
    }

    // smart_source_candidates.search_id is required; CV uploads share one
    // stub "search" per project per day rather than one per file.
    const day = new Date().toISOString().slice(0, 10);
    const queryText = `CV upload - ${project.name} - ${day}`;
    let searchId: string | null = null;
    const { data: existingSearch } = await supabase
      .from("smart_source_searches")
      .select("id")
      .eq("created_by", user.id)
      .eq("query_text", queryText)
      .limit(1)
      .maybeSingle();
    if (existingSearch) {
      searchId = existingSearch.id;
    } else {
      const { data: search, error: searchError } = await supabase
        .from("smart_source_searches")
        .insert({
          org_id: orgId || null,
          created_by: user.id,
          input_mode: "manual",
          query_text: queryText,
          search_query: "",
          status: "completed",
        })
        .select("id")
        .single();
      if (searchError || !search) return fail(searchError?.message || "Could not record this upload.", 500);
      searchId = search.id;
    }

    const { data: candidate, error: candError } = await supabase
      .from("smart_source_candidates")
      .insert({
        search_id: searchId,
        org_id: orgId || null,
        name: cv.name,
        designation: cv.designation,
        company: cv.company,
        location: cv.location,
        experience_years: cv.experience_years,
        qualification: cv.qualification,
        skills: cv.skills.length ? cv.skills : null,
        compensation: cv.compensation,
        expected_ctc: cv.expected_ctc,
        notice_period: cv.notice_period,
        public_email: cv.email,
        public_phone: cv.phone,
        profile_url: null,
        source: "cv_upload",
        resume_text: text.slice(0, 30_000),
        cv_file_name: file.name,
      })
      .select("id")
      .single();
    if (candError || !candidate) return fail(candError?.message || "Could not save this candidate.", 500);

    const { data: member, error: memberError } = await supabase
      .from("smart_source_project_members")
      .insert({
        project_id: projectId,
        candidate_id: candidate.id,
        added_by: user.id,
        status: NEW_CV_STAGE,
      })
      .select("id")
      .single();
    if (memberError || !member) {
      // Don't leave an orphaned candidate row behind.
      await supabase.from("smart_source_candidates").delete().eq("id", candidate.id);
      return fail(memberError?.message || "Could not add this candidate to the project.", 500);
    }

    // Score against the project's JD if it has one. A scoring hiccup must
    // not undo the add -- the candidate just stays unscored and the next JD
    // drop (or re-score) picks them up.
    let score: number | null = null;
    if (project.jd_text) {
      try {
        const [result] = await scoreProfilesAgainstJd(project.jd_text, [
          {
            key: member.id,
            profile: profileText({
              name: cv.name,
              designation: cv.designation,
              company: cv.company,
              location: cv.location,
              experience_years: cv.experience_years,
              qualification: cv.qualification,
              skills: cv.skills,
              evaluation_summary: null,
              resume_text: text,
            }),
          },
        ]);
        if (result) {
          const { error: scoreError } = await supabase
            .from("smart_source_project_members")
            .update({
              jd_score: result.score,
              jd_summary: result.summary,
              jd_strengths: result.strengths,
              jd_gaps: result.gaps,
              jd_scored_at: new Date().toISOString(),
            })
            .eq("id", member.id);
          if (!scoreError) score = result.score;
        }
      } catch (err) {
        console.warn("CV drop: scoring failed, candidate left unscored:", err);
      }
    }

    return NextResponse.json({ status: "added", kind: "cv", fileName: file.name, name: cv.name, score });
  }

  return fail("This doesn't look like a JD or a CV.");
}
