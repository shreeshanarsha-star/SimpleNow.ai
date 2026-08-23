import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";
import { scoreCandidateFit } from "@/lib/talentAI";

export const maxDuration = 60;

const FEATURE_KEY = "Talent.ai";

// Backfills/refreshes the AI match score for every candidate on this
// requisition that has resume text but no score yet (or, with force=true,
// every candidate with resume text). Scoped to one requisition per call so
// it stays within the serverless time budget -- 30 candidates x ~1-2s per
// AI call is comfortably inside 60s, a whole org's pipeline would not be.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase;
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
    .select("id, title, description, jd_source_text")
    .eq("id", id)
    .single();
  if (reqError || !requisition) {
    return NextResponse.json({ error: reqError?.message || "Requisition not found." }, { status: 404 });
  }
  const jdText = (requisition.description || requisition.jd_source_text || "").trim();
  if (!jdText) {
    return NextResponse.json(
      { error: "This requisition has no job description text to score candidates against." },
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

  let scored = 0;
  let failed = 0;
  for (const c of candidates || []) {
    if (!c.resume_text) continue;
    try {
      const result = await scoreCandidateFit(c.resume_text, jdText);
      const { error: updateError } = await supabase
        .from("talent_candidates")
        .update({
          match_score: result.score,
          match_score_note: result.note || null,
          match_score_computed_at: new Date().toISOString(),
        })
        .eq("id", c.id);
      if (updateError) failed++;
      else scored++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ scored, failed, total: (candidates || []).length });
}
