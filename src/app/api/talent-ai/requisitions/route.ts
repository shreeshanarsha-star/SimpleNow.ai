import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildApprovalChain, logAudit, notifyUser } from "@/lib/talentRoles";

const FEATURE_KEY = "Talent.ai";
const REQ_TYPES = new Set(["new", "replacement", "perpetual"]);
const WORK_MODES = new Set(["remote", "hybrid", "onsite"]);

// RLS now grants read to everyone inside the Talent.ai workflow (creator,
// assigned recruiter, approvers, TA head, admin), not just the creator --
// see talent_requisitions_talent_read. Confidential requisitions are
// filtered back down here to only those actually entitled to see them.
export async function GET() {
  let supabase, user;
  try {
    ({ supabase, user } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }

  const { data: requisitions, error } = await supabase
    .from("talent_requisitions")
    .select("*, talent_candidates(id, stage)")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const confidentialIds = (requisitions || []).filter((r) => r.is_confidential).map((r) => r.id);
  let visible = new Set<string>();
  if (confidentialIds.length) {
    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("is_admin, org_role").eq("id", user.id).single();
    // Requisitions were already scoped to the caller's own org by RLS above,
    // so an org_admin bypass here can't leak another org's confidential reqs.
    if (profile?.is_admin || profile?.org_role === "org_admin") {
      visible = new Set(confidentialIds);
    } else {
      const [{ data: assigned }, { data: steps }, { data: roles }] = await Promise.all([
        admin.from("talent_requisition_assignment").select("requisition_id").eq("recruiter_id", user.id).in("requisition_id", confidentialIds),
        admin.from("talent_approval_steps").select("requisition_id, approver_role, approver_user_id").in("requisition_id", confidentialIds),
        admin.from("talent_user_roles").select("role").eq("user_id", user.id),
      ]);
      const myRoles = new Set((roles || []).map((r) => r.role));
      (assigned || []).forEach((a) => visible.add(a.requisition_id));
      (steps || []).forEach((s) => {
        if (s.approver_user_id === user.id || (s.approver_user_id === null && myRoles.has(s.approver_role))) {
          visible.add(s.requisition_id);
        }
      });
      if (myRoles.has("ta_head")) confidentialIds.forEach((id) => visible.add(id));
    }
  }

  const filtered = (requisitions || []).filter(
    (r) => !r.is_confidential || r.created_by === user.id || visible.has(r.id)
  );

  return NextResponse.json({ requisitions: filtered });
}

// Creating a requisition submits it immediately -- generates the two-step
// approval chain (reporting manager, then HR approver) and notifies the
// first approver. No separate draft/submit step, per the "AI should
// remove form filling" principle: one action, done.
export async function POST(req: Request) {
  let supabase, user, orgId;
  try {
    ({ supabase, user, orgId } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }

  const body = await req.json();
  const title = (body.title || "").trim();
  if (!title) {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }

  const saveAsDraft = !!body.saveAsDraft;
  const requisitionType = REQ_TYPES.has(body.requisitionType) ? body.requisitionType : "new";
  if (!saveAsDraft && requisitionType === "replacement" && !(body.replacementName || "").trim()) {
    return NextResponse.json(
      { error: "Replacement name is required for a replacement requisition." },
      { status: 400 }
    );
  }
  const workMode = WORK_MODES.has(body.workMode) ? body.workMode : null;

  const { data: requisition, error } = await supabase
    .from("talent_requisitions")
    .insert({
      title,
      department: body.department || null,
      location: body.location || null,
      employment_type: body.employmentType || "full-time",
      headcount: Number(body.headcount) || 1,
      status: saveAsDraft ? "draft" : "pending_approval",
      priority: body.priority || "medium",
      hiring_manager: body.hiringManager || null,
      description: body.description || null, // relabeled "Justification" in the UI
      created_by: user.id,
      org_id: orgId,
      requisition_type: requisitionType,
      replacement_name: requisitionType === "replacement" ? body.replacementName || null : null,
      replacement_employee_id:
        requisitionType === "replacement" ? body.replacementEmployeeId || null : null,
      is_confidential: !!body.isConfidential,
      is_internal_only: !!body.isInternalOnly,
      cost_center: body.costCenter || null,
      comments: body.comments || null,
      target_hire_date: body.targetHireDate || null,
      work_mode: workMode,
      comp_min: body.compMin === "" || body.compMin == null ? null : Number(body.compMin),
      comp_max: body.compMax === "" || body.compMax == null ? null : Number(body.compMax),
      job_level: body.jobLevel || null,
      jd_source_text: body.jdSourceText || null,
      jd_file_name: body.jdFileName || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const admin = createAdminClient();

  if (saveAsDraft) {
    await admin.from("talent_requisition_status_history").insert({
      requisition_id: requisition.id,
      from_status: null,
      to_status: "draft",
      changed_by: user.id,
      note: "Saved as draft",
    });
    await logAudit({
      entityType: "talent_requisitions",
      entityId: requisition.id,
      actorId: user.id,
      action: "drafted",
      detail: { title, requisitionType },
    });
    return NextResponse.json({ requisition });
  }

  const chain = await buildApprovalChain(admin, user.id);
  await admin.from("talent_approval_steps").insert(
    chain.map((step) => ({
      requisition_id: requisition.id,
      step_order: step.step_order,
      approver_role: step.approver_role,
      approver_user_id: step.approver_user_id,
    }))
  );
  await admin.from("talent_requisition_status_history").insert({
    requisition_id: requisition.id,
    from_status: null,
    to_status: "pending_approval",
    changed_by: user.id,
    note: "Submitted for approval",
  });

  const firstStep = chain[0];
  if (firstStep?.approver_user_id) {
    await notifyUser({
      userId: firstStep.approver_user_id,
      title: `Approval needed: "${requisition.title}"`,
      body: "A new requisition is waiting on your approval.",
      link: `/tools/talent-ai?requisition=${requisition.id}`,
    });
  }

  await logAudit({
    entityType: "talent_requisitions",
    entityId: requisition.id,
    actorId: user.id,
    action: "submitted",
    detail: { title, requisitionType },
  });

  return NextResponse.json({ requisition });
}
