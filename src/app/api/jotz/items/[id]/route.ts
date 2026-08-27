import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { JOTZ_CATEGORIES } from "@/lib/jotzAI";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase;
  try {
    ({ supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;
  const { data: item, error } = await supabase.from("jotz_items").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!item) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ item });
}

// Lets the user correct a low-confidence (or simply wrong) AI category,
// edit extracted fields/title/tags, or mark a task done -- all without
// ever touching the original file.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase;
  try {
    ({ supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.category === "string" && (JOTZ_CATEGORIES as readonly string[]).includes(body.category)) {
    patch.category = body.category;
  }
  if (typeof body.title === "string") patch.title = body.title.trim() || "Untitled";
  if (body.extracted_data && typeof body.extracted_data === "object") patch.extracted_data = body.extracted_data;
  if (Array.isArray(body.tags)) patch.tags = body.tags.filter((t: unknown) => typeof t === "string").slice(0, 12);
  if (typeof body.task_done === "boolean") patch.task_done = body.task_done;

  const { data: item, error } = await supabase
    .from("jotz_items")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase, user;
  try {
    ({ supabase, user } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;

  const { data: item } = await supabase
    .from("jotz_items")
    .select("id, file_path, user_id")
    .eq("id", id)
    .maybeSingle();
  if (!item) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { error } = await supabase.from("jotz_items").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Best-effort file cleanup -- the DB row (the thing RLS/ownership
  // actually protects) is already gone either way, so a storage hiccup
  // here shouldn't surface as a failed delete to the user.
  if (item.file_path && item.user_id === user.id) {
    const admin = createAdminClient();
    await admin.storage.from("jotz").remove([item.file_path]).catch(() => null);
  }

  return NextResponse.json({ ok: true });
}
