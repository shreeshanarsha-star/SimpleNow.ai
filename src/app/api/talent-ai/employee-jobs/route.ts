import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit, notifyUser } from "@/lib/talentRoles";
import { getOrgContext } from "@/lib/org";

// Open to ANY authenticated user, not just Talent.ai-gated staff -- every
// employee can see published internal roles and refer someone.
export async function GET() {
  let supabase;
  try {
    ({ supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const { data: requisitions, error } = await supabase
    .from("talent_requisitions")
    .select("id, title, department, location, work_mode, employment_type, job_level, created_at")
    .eq("is_published", true)
    .eq("is_confidential", false)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ requisitions });
}

export async function POST(req: Request) {
  let user;
  try {
    ({ user } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const body = await req.json().catch(() => null);
  const requisitionId = typeof body?.requisitionId === "string" ? body.requisitionId : null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : null;
  const phone = typeof body?.phone === "string" ? body.phone.trim() : null;
  const note = typeof body?.note === "string" ? body.note.trim() : null;
  if (!requisitionId || !name) {
    return NextResponse.json({ error: "requisitionId and candidate name are required." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: requisition } = await admin
    .from("talent_requisitions")
    .select("id, title, is_published, is_confidential, created_by, org_id")
    .eq("id", requisitionId)
    .single();
  if (!requisition || !requisition.is_published || requisition.is_confidential) {
    return NextResponse.json({ error: "This role isn't open for referrals." }, { status: 403 });
  }
  // admin client bypasses RLS -- an employee can only refer into their own
  // organization's open roles, never another company's.
  const referrerCtx = await getOrgContext(admin, user.id);
  if (referrerCtx.orgId !== requisition.org_id) {
    return NextResponse.json({ error: "This role isn't open for referrals." }, { status: 403 });
  }

  const { data: candidate, error } = await admin
    .from("talent_candidates")
    .insert({
      requisition_id: requisitionId,
      name,
      email,
      phone,
      source: "referral",
      stage: "applied",
      referred_by: user.id,
      created_by: user.id,
      tags: [],
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("talent_stage_history").insert({
    candidate_id: candidate.id,
    from_stage: null,
    to_stage: "applied",
    changed_by: user.id,
    note: note || "Referred by employee",
  });

  const { data: assignment } = await admin.from("talent_requisition_assignment").select("recruiter_id").eq("requisition_id", requisitionId).maybeSingle();
  const notifyTarget = assignment?.recruiter_id || requisition.created_by;
  if (notifyTarget) {
    await notifyUser({ userId: notifyTarget, title: `New referral for "${requisition.title}"`, body: `${name} was referred by an employee.`, link: `/tools/talent-ai?requisition=${requisitionId}` });
  }
  await logAudit({ entityType: "talent_candidates", entityId: candidate.id, actorId: user.id, action: "referred" });

  return NextResponse.json({ candidate }, { status: 201 });
}
