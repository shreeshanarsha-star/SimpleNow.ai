import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";

// Personal Tools: To-Do List. Same "personal, not feature-gated" pattern
// as Quick Notes.
export async function GET() {
  let supabase;
  try {
    ({ supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const { data: todos, error } = await supabase
    .from("personal_todos")
    .select("*")
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ todos });
}

export async function POST(req: Request) {
  let supabase, user;
  try {
    ({ supabase, user } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "Todo text is required." }, { status: 400 });

  const { data: existing } = await supabase
    .from("personal_todos")
    .select("position")
    .eq("user_id", user.id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = existing ? existing.position + 1 : 0;

  const { data: todo, error } = await supabase
    .from("personal_todos")
    .insert({ user_id: user.id, text, position: nextPosition })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ todo });
}
