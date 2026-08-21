import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";

export const maxDuration = 15;
const FEATURE_KEY = "Assessment.ai";

export async function POST(request: Request) {
  let user, supabase;
  try {
    ({ user, supabase } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }

  const body = await request.json().catch(() => null);
  const candidateName = typeof body?.candidateName === "string" ? body.candidateName.trim() : "";
  const candidateEmail = typeof body?.candidateEmail === "string" ? body.candidateEmail.trim() : "";

  if (!candidateName || !candidateEmail) {
    return NextResponse.json(
      { error: "Candidate name and email are required." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("assessment_assignments")
    .insert({
      created_by: user.id,
      candidate_name: candidateName,
      candidate_email: candidateEmail,
      assessment_type: "big_five",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ assignment: data }, { status: 201 });
}

// RLS scopes this to the caller's own assignments (or all, if admin).
export async function GET() {
  const { requireUser } = await import("@/lib/supabase/requireAdmin");
  let supabase;
  try {
    ({ supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }

  const { data, error } = await supabase
    .from("assessment_assignments")
    .select("*, assessment_responses(scores, completed_at)")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ assignments: data });
}
