import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BIG_FIVE_QUESTIONS, scoreBigFive, type BigFiveAnswers } from "@/lib/assessments/bigFive";

export const maxDuration = 15;

// Public -- scoring happens server-side (never trust a client-computed
// score), then the SECURITY DEFINER function inserts the response and
// flips the assignment to completed atomically, rejecting a second
// submission against the same token.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = await createClient();

  const body = await request.json().catch(() => null);
  const answers = body?.answers as BigFiveAnswers | undefined;

  if (!answers || typeof answers !== "object") {
    return NextResponse.json({ error: "Answers are required." }, { status: 400 });
  }
  const missing = BIG_FIVE_QUESTIONS.filter((q) => typeof answers[q.id] !== "number");
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Answer all ${BIG_FIVE_QUESTIONS.length} items before submitting.` },
      { status: 400 }
    );
  }

  const scores = scoreBigFive(answers);

  const { data, error } = await supabase.rpc("submit_assessment_response", {
    p_token: token,
    p_answers: answers,
    p_scores: scores,
  });

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "Could not submit your responses." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
