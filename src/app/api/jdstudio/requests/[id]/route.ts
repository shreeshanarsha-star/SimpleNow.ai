import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let user, supabase;
  try {
    ({ user, supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const { data, error } = await supabase.from("jdstudio_requests").select("*").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ request: data });
}

const EDITABLE_FIELDS = [
  "recipient_name",
  "recipient_email",
  "department",
  "job_title",
  "questions_snapshot",
  "template",
  "approver_mode",
  "approver_email",
];

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let user, supabase;
  try {
    ({ user, supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const body = await request.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  for (const key of EDITABLE_FIELDS) {
    if (key in body) patch[key] = body[key];
  }
  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("jdstudio_requests")
    .update(patch)
    .eq("id", id)
    .eq("owner_id", user.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ request: data });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let user, supabase;
  try {
    ({ user, supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const { error } = await supabase.from("jdstudio_requests").delete().eq("id", id).eq("owner_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
