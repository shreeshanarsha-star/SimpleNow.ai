import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";

// The "insert your own set of questions" requirement -- system default
// (7+5+5) plus any custom sets the owner has saved.
export async function GET() {
  let user, supabase;
  try {
    ({ user, supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const { data, error } = await supabase
    .from("jdstudio_question_sets")
    .select("*")
    .or(`is_system.eq.true,owner_id.eq.${user.id}`)
    .order("is_system", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ questionSets: data });
}

export async function POST(request: Request) {
  let user, supabase;
  try {
    ({ user, supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const questions = Array.isArray(body.questions) ? body.questions : [];
  if (!name || !questions.length) {
    return NextResponse.json({ error: "A name and at least one question are required." }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("jdstudio_question_sets")
    .insert({ owner_id: user.id, name, questions, is_system: false })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ questionSet: data }, { status: 201 });
}
