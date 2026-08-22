import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";

const FEATURE_KEY = "Talent.ai";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase;
  try {
    ({ supabase } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;

  const { data: scorecards, error } = await supabase
    .from("talent_scorecards")
    .select("*")
    .eq("candidate_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ scorecards });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase, user;
  try {
    ({ supabase, user } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;
  const body = await req.json();

  const rating = body.rating === null || body.rating === undefined ? null : Number(body.rating);
  const recommendation = body.recommendation || null;
  if (!recommendation) {
    return NextResponse.json({ error: "A recommendation is required." }, { status: 400 });
  }

  const { data: scorecard, error } = await supabase
    .from("talent_scorecards")
    .insert({
      candidate_id: id,
      interviewer_id: user.id,
      rating,
      recommendation,
      feedback: body.feedback || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ scorecard });
}
