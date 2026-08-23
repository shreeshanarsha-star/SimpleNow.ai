import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";

// Personal Tools: Quick Notes. Not feature-gated -- any signed-in user has
// their own notes, scoped by RLS (user_id = auth.uid()), independent of
// org/department.
export async function GET() {
  let supabase;
  try {
    ({ supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const { data: notes, error } = await supabase
    .from("personal_notes")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notes });
}

export async function POST(req: Request) {
  let supabase, user;
  try {
    ({ supabase, user } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const noteBody = typeof body.body === "string" ? body.body : "";

  const { data: note, error } = await supabase
    .from("personal_notes")
    .insert({ user_id: user.id, title: title || null, body: noteBody })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ note });
}
