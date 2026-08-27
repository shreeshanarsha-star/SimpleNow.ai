import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase;
  try {
    ({ supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;
  const { data: job, error } = await supabase.from("shortlist_jobs").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  return NextResponse.json({ job });
}

const EDITABLE_FIELDS = [
  "title", "company", "job_ref", "department", "location", "work_mode",
  "experience_required", "min_experience_years", "qualification",
  "required_skills", "preferred_skills", "industry", "comp_min", "comp_max",
  "comp_currency", "notice_period_requirement", "other_requirements",
  "role_summary", "status",
];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase, user;
  try {
    ({ supabase, user } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of EDITABLE_FIELDS) {
    if (key in body) patch[key] = body[key];
  }
  if (patch.status && !["open", "on_hold", "closed"].includes(patch.status as string)) {
    delete patch.status;
  }

  const { data: job, error } = await supabase.from("shortlist_jobs").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const admin = createAdminClient();
  await admin.from("shortlist_activity_log").insert({
    user_id: user.id,
    entity_type: "job",
    entity_id: id,
    action: "manual_edit",
    detail: { fields: Object.keys(patch).filter((k) => k !== "updated_at") },
  });

  return NextResponse.json({ job });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase, user;
  try {
    ({ supabase, user } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;

  const { data: job } = await supabase.from("shortlist_jobs").select("id, jd_file_path, user_id").eq("id", id).maybeSingle();
  if (!job) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { error } = await supabase.from("shortlist_jobs").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (job.jd_file_path && job.user_id === user.id) {
    const admin = createAdminClient();
    await admin.storage.from("shortlist").remove([job.jd_file_path]).catch(() => null);
  }

  return NextResponse.json({ ok: true });
}
