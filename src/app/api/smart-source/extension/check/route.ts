import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";

const FEATURE_KEY = "Smart Source.ai";

// Called by the Smart Source LinkedIn Chrome extension when its popup opens,
// before the recruiter picks a project — lets the popup say "Already in
// HHP-EU" up front instead of only discovering a duplicate after Add is
// clicked. profile_url is the only reliable, stable key we have for a
// LinkedIn profile across separate capture requests.
export async function GET(request: Request) {
  let supabase;
  try {
    ({ supabase } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }

  const profileUrl = new URL(request.url).searchParams.get("profile_url");
  if (!profileUrl) {
    return NextResponse.json({ error: "profile_url is required." }, { status: 400 });
  }

  const { data: candidates, error: candidatesError } = await supabase
    .from("smart_source_candidates")
    .select("id")
    .eq("profile_url", profileUrl);

  if (candidatesError) {
    return NextResponse.json({ error: candidatesError.message }, { status: 500 });
  }
  if (!candidates?.length) {
    return NextResponse.json({ projects: [] });
  }

  const { data: members, error: membersError } = await supabase
    .from("smart_source_project_members")
    .select("project_id, smart_source_projects(id, name)")
    .in(
      "candidate_id",
      candidates.map((c) => c.id)
    );

  if (membersError) {
    return NextResponse.json({ error: membersError.message }, { status: 500 });
  }

  const seen = new Set<string>();
  const projects: { id: string; name: string }[] = [];
  for (const m of members || []) {
    const project = Array.isArray(m.smart_source_projects) ? m.smart_source_projects[0] : m.smart_source_projects;
    if (project?.id && !seen.has(project.id)) {
      seen.add(project.id);
      projects.push({ id: project.id, name: project.name });
    }
  }

  return NextResponse.json({ projects });
}
