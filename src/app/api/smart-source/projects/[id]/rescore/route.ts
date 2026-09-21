import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";
import { hasScorableData, profileText, scoreProfilesAgainstJd, type ScorableCandidate } from "@/lib/smartSourceDrop";

const FEATURE_KEY = "Smart Source.ai";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_PER_CALL = 8;

type MemberRow = { id: string; smart_source_candidates: (ScorableCandidate & { id: string }) | null };

// Re-scoring a project against its current JD is driven in chunks by the
// browser (GET for the list of scorable members, then POST a few at a time)
// so a big project never has to fit inside a single request's time limit.
//
// Scores are written onto the project member row, not the shared candidate
// row, so the same candidate sitting in two projects keeps a separate score
// for each project's JD.

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase;
  try {
    ({ supabase } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;

  const { data: project, error: projectError } = await supabase
    .from("smart_source_projects")
    .select("id, jd_text, jd_file_name")
    .eq("id", id)
    .maybeSingle();
  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 });
  if (!project) return NextResponse.json({ error: "That project couldn't be found." }, { status: 404 });
  if (!project.jd_text) return NextResponse.json({ hasJd: false, memberIds: [], skipped: 0 });

  const { data: rows, error } = await supabase
    .from("smart_source_project_members")
    .select(
      "id, smart_source_candidates(id, name, designation, company, location, experience_years, qualification, skills, evaluation_summary, resume_text)"
    )
    .eq("project_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const members = (rows || []) as unknown as MemberRow[];
  const scorable = members.filter((m) => m.smart_source_candidates && hasScorableData(m.smart_source_candidates));

  return NextResponse.json({
    hasJd: true,
    memberIds: scorable.map((m) => m.id),
    skipped: members.length - scorable.length,
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase;
  try {
    ({ supabase } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const memberIds: string[] = Array.isArray(body?.memberIds)
    ? body.memberIds.filter((m: unknown): m is string => typeof m === "string").slice(0, MAX_PER_CALL)
    : [];
  if (!memberIds.length) return NextResponse.json({ error: "No candidates to score." }, { status: 400 });

  const { data: project, error: projectError } = await supabase
    .from("smart_source_projects")
    .select("id, jd_text")
    .eq("id", id)
    .maybeSingle();
  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 });
  if (!project) return NextResponse.json({ error: "That project couldn't be found." }, { status: 404 });
  if (!project.jd_text) return NextResponse.json({ error: "This project has no JD yet." }, { status: 400 });

  const { data: rows, error } = await supabase
    .from("smart_source_project_members")
    .select(
      "id, smart_source_candidates(id, name, designation, company, location, experience_years, qualification, skills, evaluation_summary, resume_text)"
    )
    .eq("project_id", id)
    .in("id", memberIds);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items = ((rows || []) as unknown as MemberRow[])
    .filter((m) => m.smart_source_candidates && hasScorableData(m.smart_source_candidates))
    .map((m) => ({ key: m.id, profile: profileText(m.smart_source_candidates as ScorableCandidate) }));

  let results;
  try {
    results = await scoreProfilesAgainstJd(project.jd_text, items);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Scoring failed." }, { status: 502 });
  }

  const scoredAt = new Date().toISOString();
  const updates = await Promise.all(
    results.map((r) =>
      supabase
        .from("smart_source_project_members")
        .update({
          jd_score: r.score,
          jd_summary: r.summary,
          jd_strengths: r.strengths,
          jd_gaps: r.gaps,
          jd_scored_at: scoredAt,
        })
        .eq("id", r.key)
        .eq("project_id", id)
    )
  );
  const written = updates.filter((u) => !u.error).length;

  return NextResponse.json({ scored: written, requested: memberIds.length });
}
