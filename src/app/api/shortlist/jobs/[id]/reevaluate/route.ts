import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { scoreCandidateAgainstJob } from "@/lib/shortlistAI";

// Recompute every candidate's match against this job -- used after the
// recruiter edits the JD/criteria, without re-uploading any CVs. Manual
// candidate edits are untouched (this only rewrites score/evaluation
// fields on shortlist_job_matches, never shortlist_candidates).
export const maxDuration = 90;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase, user;
  try {
    ({ supabase, user } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const { id: jobId } = await params;

  const { data: job, error: jobError } = await supabase.from("shortlist_jobs").select("*").eq("id", jobId).maybeSingle();
  if (jobError) return NextResponse.json({ error: jobError.message }, { status: 500 });
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  const { data: matches, error: matchError } = await supabase
    .from("shortlist_job_matches")
    .select("id, candidate_id, ai_eval_version, candidate:shortlist_candidates(*)")
    .eq("job_id", jobId);
  if (matchError) return NextResponse.json({ error: matchError.message }, { status: 500 });
  if (!matches?.length) return NextResponse.json({ reevaluated: 0 });

  const admin = createAdminClient();
  let succeeded = 0;
  let failed = 0;

  for (const m of matches) {
    const candidate = m.candidate as unknown as Record<string, unknown> | null;
    if (!candidate) continue;
    try {
      const evaluation = await scoreCandidateAgainstJob(
        job as unknown as Parameters<typeof scoreCandidateAgainstJob>[0],
        candidate as unknown as Parameters<typeof scoreCandidateAgainstJob>[1],
        (candidate.resume_text as string) || ""
      );
      await admin
        .from("shortlist_job_matches")
        .update({
          overall_score: evaluation.overall_score,
          score_breakdown: evaluation.score_breakdown,
          evaluation: evaluation.evaluation,
          strengths: evaluation.strengths,
          concerns: evaluation.concerns,
          missing_requirements: evaluation.missing_requirements,
          matching_skills: evaluation.matching_skills,
          ai_eval_version: (m.ai_eval_version || 1) + 1,
          evaluated_at: new Date().toISOString(),
        })
        .eq("id", m.id);
      succeeded++;
    } catch {
      failed++;
    }
  }

  await admin.from("shortlist_activity_log").insert({
    user_id: user.id,
    entity_type: "job",
    entity_id: jobId,
    action: "reevaluated",
    detail: { succeeded, failed },
  });

  return NextResponse.json({ reevaluated: succeeded, failed });
}
