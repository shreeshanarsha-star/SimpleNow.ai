import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";

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
};

type CandidateResult = {
  profile_url: string;
  status: "added" | "duplicate" | "failed";
  error?: string;
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
      .select("id, name")
      .eq("id", targetProjectId)
      .maybeSingle();
    if (findError || !existingProject) {
      return NextResponse.json({ error: "That project couldn't be found." }, { status: 404 });
    }
    targetProjectName = existingProject.name;
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
        .select("id, smart_source_candidates!inner(profile_url)")
        .eq("project_id", targetProjectId)
        .eq("smart_source_candidates.profile_url", c.profile_url)
        .maybeSingle();

      if (existingLink) {
        results.push({ profile_url: c.profile_url, status: "duplicate" });
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
        })
        .select()
        .single();

      if (candError || !candidate) throw new Error(candError?.message || "Could not save this candidate.");

      const { error: memberError } = await supabase
        .from("smart_source_project_members")
        .insert({
          project_id: targetProjectId,
          candidate_id: candidate.id,
          added_by: user.id,
          comments: comment,
        });

      if (memberError) throw new Error(memberError.message);

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
