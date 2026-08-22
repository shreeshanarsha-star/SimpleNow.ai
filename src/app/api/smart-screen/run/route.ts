import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";
import { screenCandidate, type Criteria } from "@/lib/smartScreen";

// Screening several CVs against one criteria set, sequentially, inside one
// request -- capped at 8 candidates per batch so this stays well inside
// Vercel's serverless ceiling even in the worst case (8 x ~25s would blow
// past a shorter cap; 90s covers real-world latency with room to spare).
export const maxDuration = 90;
const FEATURE_KEY = "Smart Screen.ai";
const MAX_CANDIDATES = 8;

export async function POST(request: Request) {
  let user, supabase, orgId;
  try {
({ user, supabase, orgId } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }

  const body = await request.json().catch(() => null);
  const roleTitle = typeof body?.roleTitle === "string" ? body.roleTitle.trim() : "";
  const criteria = body?.criteria as Criteria | undefined;
  const candidates = Array.isArray(body?.candidates) ? body.candidates : [];

  if (!roleTitle || !criteria) {
    return NextResponse.json({ error: "Structure the criteria first." }, { status: 400 });
  }
  const cleanCandidates = candidates
    .map((c: { name?: string; resumeText?: string }) => ({
      name: typeof c?.name === "string" ? c.name.trim() : "",
      resumeText: typeof c?.resumeText === "string" ? c.resumeText.trim() : "",
    }))
    .filter((c: { resumeText: string }) => c.resumeText.length > 0);

  if (cleanCandidates.length === 0) {
    return NextResponse.json({ error: "Add at least one candidate's resume text." }, { status: 400 });
  }
  if (cleanCandidates.length > MAX_CANDIDATES) {
    return NextResponse.json(
      { error: `Screen at most ${MAX_CANDIDATES} candidates per batch.` },
      { status: 400 }
    );
  }

  const { data: batch, error: batchError } = await supabase
    .from("smart_screen_batches")
    .insert({ created_by: user.id, role_title: roleTitle, criteria, status: "processing", org_id: orgId })
    .select()
    .single();

  if (batchError || !batch) {
    return NextResponse.json(
      { error: batchError?.message || "Could not create the batch." },
      { status: 500 }
    );
  }

  // Screen sequentially and record a per-candidate failure instead of
  // aborting the whole batch on one bad CV -- a partial result with a
  // visible error beats a silent empty batch.
  const results = [];
  let anyFailed = false;
  for (const candidate of cleanCandidates) {
    try {
      const scored = await screenCandidate(criteria, candidate.resumeText);
      const { data: row, error: insertError } = await supabase
        .from("smart_screen_candidates")
        .insert({
          batch_id: batch.id,
          candidate_name: candidate.name || scored.profile?.name || null,
          resume_text: candidate.resumeText,
          fit_score: scored.fit_score,
          met_skills: scored.met_skills,
          missing_skills: scored.missing_skills,
          justification: scored.justification,
          red_flags: scored.red_flags,
          achievement: scored.achievement,
          interview_questions: scored.interview_questions,
          next_action: scored.next_action,
          profile: scored.profile,
        })
        .select()
        .single();
      if (insertError) throw new Error(insertError.message);
      results.push(row);
    } catch (err) {
      anyFailed = true;
      results.push({
        batch_id: batch.id,
        candidate_name: candidate.name || null,
        resume_text: candidate.resumeText,
        error: err instanceof Error ? err.message : "Screening failed for this candidate.",
      });
    }
  }

  await supabase
    .from("smart_screen_batches")
    .update({ status: anyFailed ? "failed" : "completed" })
    .eq("id", batch.id);

  return NextResponse.json({ batch: { ...batch, status: anyFailed ? "failed" : "completed" }, results });
}
