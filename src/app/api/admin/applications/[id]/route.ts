import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/requireAdmin";

export const maxDuration = 15;

// PATCH { action: "approve" | "reject" | "publish" } — admin only, same
// lifecycle shape as /api/admin/job-postings/[id]. For an application,
// "approve" means shortlisted, "publish" means moved forward/hired — the
// admin decides what that means operationally; this just records the state.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let user, supabase;
  try {
    ({ user, supabase } = await requireAdminUser());
  } catch (res) {
    return res as Response;
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const action = body?.action;

  if (!["approve", "reject", "publish"].includes(action)) {
    return NextResponse.json(
      { error: "action must be 'approve', 'reject', or 'publish'." },
      { status: 400 }
    );
  }

  const update: Record<string, unknown> = {
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
  };
  if (action === "approve") {
    update.status = "approved";
    update.rejection_reason = null;
  } else if (action === "reject") {
    update.status = "rejected";
    update.rejection_reason =
      typeof body?.rejectionReason === "string" ? body.rejectionReason.trim() : null;
  } else if (action === "publish") {
    update.status = "published";
  }

  const { data, error } = await supabase
    .from("job_applications")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ application: data });
}

// GET returns a short-lived signed URL to the candidate's resume — admin
// only, since the resumes bucket is private (anon can insert but not read).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let supabase;
  try {
    ({ supabase } = await requireAdminUser());
  } catch (res) {
    return res as Response;
  }

  const { id } = await params;
  const { data: app, error: appError } = await supabase
    .from("job_applications")
    .select("resume_path")
    .eq("id", id)
    .single();

  if (appError || !app) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  const { data: signed, error: signError } = await supabase.storage
    .from("resumes")
    .createSignedUrl(app.resume_path, 300);

  if (signError || !signed) {
    return NextResponse.json(
      { error: signError?.message || "Could not create a resume link." },
      { status: 500 }
    );
  }

  return NextResponse.json({ url: signed.signedUrl });
}
