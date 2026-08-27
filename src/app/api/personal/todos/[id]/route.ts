import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase;
  try {
    ({ supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (typeof body.done === "boolean") {
    patch.done = body.done;
    // Stamp/clear completed_at alongside done so the Completed folder can
    // show when a task actually finished (and how long it took), without
    // trusting the client to send its own timestamp.
    patch.completed_at = body.done ? new Date().toISOString() : null;
  }
  if (typeof body.text === "string" && body.text.trim()) patch.text = body.text.trim();
  if (typeof body.position === "number") patch.position = body.position;
  // due_date: a YYYY-MM-DD string to set/change it, or null to clear it.
  if (body.due_date === null) {
    patch.due_date = null;
  } else if (typeof body.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.due_date)) {
    patch.due_date = body.due_date;
  }

  const { data: todo, error } = await supabase
    .from("personal_todos")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ todo });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase;
  try {
    ({ supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;
  const { error } = await supabase.from("personal_todos").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
