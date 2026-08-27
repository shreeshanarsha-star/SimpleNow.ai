import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

const STATUSES = ["new", "reviewed", "shortlisted", "shared", "interview", "selected", "rejected", "on_hold"];

// Status changes on the Candidate<->Job relationship (not the candidate
// itself, since the same person can be "shortlisted" for one role and
// "rejected" for another at the same time). Every change is logged to
// shortlist_status_history for the audit trail the spec asks for.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase, user;
  try {
    ({ supabase, user } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const status = body.status as string;
  if (!STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const { data: existing } = await supabase.from("shortlist_job_matches").select("status, candidate_id").eq("id", id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Match not found." }, { status: 404 });

  const { data: match, error } = await supabase
    .from("shortlist_job_matches")
    .update({ status })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const admin = createAdminClient();
  await admin.from("shortlist_status_history").insert({
    user_id: user.id,
    match_id: id,
    from_status: existing.status,
    to_status: status,
    changed_by: "user",
  });
  await admin.from("shortlist_activity_log").insert({
    user_id: user.id,
    entity_type: "candidate",
    entity_id: existing.candidate_id,
    action: "status_changed",
    detail: { match_id: id, from: existing.status, to: status },
  });

  return NextResponse.json({ match });
}

// Removes a candidate from one Job's match list without touching the
// candidate record itself -- the "remove from this job only" action
// (spec: candidate stays in the library, can still match other jobs).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase, user;
  try {
    ({ supabase, user } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;

  const { data: existing } = await supabase.from("shortlist_job_matches").select("id, candidate_id, job_id").eq("id", id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Match not found." }, { status: 404 });

  const { error } = await supabase.from("shortlist_job_matches").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const admin = createAdminClient();
  await admin.from("shortlist_activity_log").insert({
    user_id: user.id,
    entity_type: "candidate",
    entity_id: existing.candidate_id,
    action: "removed_from_job",
    detail: { job_id: existing.job_id },
  });

  return NextResponse.json({ ok: true });
}
