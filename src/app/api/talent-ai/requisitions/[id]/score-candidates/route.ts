import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";
import { scoreCandidateFit, scoreCandidateAgainstCriteria, type EligibilityCriteria } from "@/lib/talentAI";

type SupabaseClient = Awaited<ReturnType<typeof requireFeatureAccess>>["supabase"];

export const maxDuration = 60;

const FEATURE_KEY = "Talent.ai";
const SCORE_CONCURRENCY = 4;

// Backfills/refreshes the AI match score for candidates on this requisition.
// force=false (default): only candidates with resume text and no score yet.
// force=true: every candidate with resume text -- used when eligibility
// criteria is saved/changed, since every existing score was computed
// against the old (or no) criteria and is now stale.
//
// Scored against structured eligibility_criteria when the requisition has
// one set (must-have/good-to-have skills weighted heavily -- see
// scoreCandidateAgainstCriteria), falling back to plain JD-text scoring
// otherwise. Runs a small worker pool instead of one-at-a-time so a
// requisition with dozens of candidates doesn't take a full serverless
// request per candidate in series.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase: SupabaseClient;
  try {
    ({ supabase } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const force = !!body?.force;

  const { data: requisition, error: reqError } = await supabase
    .from("talent_requisitions")
    .select("id, title, description, jd_source_text, eligibility_criteria")
    .eq("id", id)
    .single();
  if (reqError || !requisition) {
    return NextResponse.json({ error: reqError?.message || "Requisition not found." }, { status: 404 });
  }

  const criteria = requisition.eligibility_criteria as EligibilityCriteria | null;
  const hasCriteria = !!criteria && ((criteria.must_have_skills?.length || 0) > 0 || (criteria.good_to_have_skills?.length || 0) > 0);
  const jdText = (requisition.description || requisition.jd_source_text || "").trim();

  if (!hasCriteria && !jdText) {
    return NextResponse.json(
      { error: "This requisition has no eligibility criteria or job description to score candidates against." },
      { status: 400 }
    );
  }

  let query = supabase
    .from("talent_candidates")
    .select("id, resume_text, match_score")
    .eq("requisition_id", id)
    .not("resume_text", "is", null);
  if (!force) query = query.is("match_score", null);
  const { data: candidates, error: candError } = await query;
  if (candError) {
    return NextResponse.json({ error: candError.message }, { status: 500 });
  }

  const queue = (candidates || []).filter((c) => !!c.resume_text);
  let scored = 0;
  let failed = 0;
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < queue.length) {
      const c = queue[nextIndex++];
      try {
        const result = hasCriteria
          ? await scoreCandidateAgainstCriteria(criteria as EligibilityCriteria, c.resume_text as string)
          : await scoreCandidateFit(c.resume_text as string, jdText);
        const { error: updateError } = await supabase
          .from("talent_candidates")
          .update({
            match_score: result.score,
            match_score_note: result.note || null,
            match_score_computed_at: new Date().toISOString(),
            met_must_have_skills: "met_must_have_skills" in result ? result.met_must_have_skills : null,
            missing_must_have_skills: "missing_must_have_skills" in result ? result.missing_must_have_skills : null,
          })
          .eq("id", c.id);
        if (updateError) failed++;
        else scored++;
      } catch {
        failed++;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(SCORE_CONCURRENCY, queue.length) }, () => worker())
  );

  return NextResponse.json({ scored, failed, total: queue.length, scoredAgainst: hasCriteria ? "criteria" : "jd" });
}
