import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserRoles, logAudit, notifyUser } from "@/lib/talentRoles";

const FEATURE_KEY = "Talent.ai";
const DECISIONS = new Set(["approved", "rejected", "hold", "sent_back"]);

// My pending approval steps -- named-to-me, or pool steps for a role I hold
// (today: only the HR approver step is pool-based).
export async function GET() {
  let user;
  try {
    ({ user } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const admin = createAdminClient();
  const myRoles = await getUserRoles(admin, user.id);

  const { data: steps, error } = await admin
    .from("talent_approval_steps")
    .select("*, talent_requisitions(id, title, department, location, headcount, priority, requisition_type, cost_center, comp_min, comp_max, created_by, status, is_confidential)")
    .in("status", ["pending", "hold"])
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const mine = (steps || []).filter(
    (s) => s.approver_user_id === user.id || (s.approver_user_id === null && myRoles.includes(s.approver_role))
  );

  // Only surface steps that are actually next in line (earlier steps done).
  const actionable = [];
  for (const s of mine) {
    const { data: earlier } = await admin
      .from("talent_approval_steps")
      .select("id")
      .eq("requisition_id", s.requisition_id)
      .lt("step_order", s.step_order)
      .neq("status", "approved");
    if (!earlier || earlier.length === 0) actionable.push(s);
  }

  return NextResponse.json({ steps: actionable });
}

export async function POST(req: Request) {
  let user;
  try {
    ({ user } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const body = await req.json().catch(() => null);
  const stepId = typeof body?.stepId === "string" ? body.stepId : null;
  const decision = typeof body?.decision === "string" ? body.decision : null;
  const comment = typeof body?.comment === "string" ? body.comment.trim() || null : null;
  if (!stepId || !decision || !DECISIONS.has(decision)) {
    return NextResponse.json({ error: "stepId and a valid decision are required." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: step } = await admin.from("talent_approval_steps").select("*").eq("id", stepId).single();
  if (!step) return NextResponse.json({ error: "Approval step not found." }, { status: 404 });
  if (!["pending", "hold"].includes(step.status)) {
    return NextResponse.json({ error: "This step has already been decided." }, { status: 409 });
  }

  const myRoles = await getUserRoles(admin, user.id);
  const authorized =
    step.approver_user_id === user.id || (step.approver_user_id === null && myRoles.includes(step.approver_role));
  if (!authorized) {
    return NextResponse.json({ error: "You are not the approver for this step." }, { status: 403 });
  }

  await admin
    .from("talent_approval_steps")
    .update({ status: decision, comment, decided_by: user.id, decided_at: new Date().toISOString() })
    .eq("id", stepId);

  const { data: requisition } = await admin.from("talent_requisitions").select("*").eq("id", step.requisition_id).single();
  if (!requisition) return NextResponse.json({ error: "Requisition not found." }, { status: 404 });

  let newStatus = requisition.status;
  if (decision === "rejected") {
    newStatus = "rejected";
  } else if (decision === "sent_back") {
    newStatus = "sent_back";
  } else if (decision === "hold") {
    newStatus = "on_hold";
  } else if (decision === "approved") {
    const { data: remaining } = await admin
      .from("talent_approval_steps")
      .select("*")
      .eq("requisition_id", step.requisition_id)
      .gt("step_order", step.step_order)
      .order("step_order", { ascending: true });
    const next = (remaining || [])[0];
    if (next) {
      newStatus = "pending_approval";
      if (next.approver_user_id) {
        await notifyUser({
          userId: next.approver_user_id,
          title: `Approval needed: "${requisition.title}"`,
          link: `/tools/talent-ai?requisition=${requisition.id}`,
        });
      } else {
        const { data: pool } = await admin.from("talent_user_roles").select("user_id").eq("role", next.approver_role);
        for (const p of pool || []) {
          await notifyUser({
            userId: p.user_id,
            title: `Approval needed: "${requisition.title}"`,
            link: `/tools/talent-ai?requisition=${requisition.id}`,
          });
        }
      }
    } else {
      newStatus = "approved";
    }
  }

  if (newStatus !== requisition.status) {
    await admin.from("talent_requisitions").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", requisition.id);
    await admin.from("talent_requisition_status_history").insert({
      requisition_id: requisition.id,
      from_status: requisition.status,
      to_status: newStatus,
      changed_by: user.id,
      note: comment,
    });
  }

  if (requisition.created_by) {
    const labels: Record<string, string> = { approved: "approved", rejected: "rejected", hold: "put on hold", sent_back: "sent back for edits" };
    const label = labels[decision];
    await notifyUser({
      userId: requisition.created_by,
      title: `Requisition "${requisition.title}" was ${label}`,
      body: comment,
      link: `/tools/talent-ai?requisition=${requisition.id}`,
    });
  }

  await logAudit({
    entityType: "talent_requisitions",
    entityId: requisition.id,
    actorId: user.id,
    action: `approval_${decision}`,
    detail: { stepId, comment },
  });

  return NextResponse.json({ ok: true, requisitionStatus: newStatus });
}
