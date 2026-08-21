import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BIG_FIVE_QUESTIONS, BIG_FIVE_SCALE, BIG_FIVE_STEM } from "@/lib/assessments/bigFive";

// Public -- looks up an assignment by its unguessable token via the
// SECURITY DEFINER function (no anon RLS policy exists on the table
// itself, so this is the only way in).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_assessment_by_token", { p_token: token });
  const assignment = Array.isArray(data) ? data[0] : data;

  if (error || !assignment) {
    return NextResponse.json({ error: "Assessment link not found." }, { status: 404 });
  }

  return NextResponse.json({
    assignment: { candidateName: assignment.candidate_name, status: assignment.status },
    questions: BIG_FIVE_QUESTIONS,
    scale: BIG_FIVE_SCALE,
    stem: BIG_FIVE_STEM,
  });
}
