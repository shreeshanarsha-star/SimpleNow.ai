import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";
import { summarizePipeline, structureEligibilityCriteria } from "@/lib/talentAI";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildApprovalChain, logAudit, notifyUser } from "@/lib/talentRoles";

const FEATURE_KEY = "Talent.ai";
const REQ_TYPES = new Set(["new", "replacement", "perpetual"]);
const WORK_MODES = new Set(["remote", "hybrid", "onsite"]);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase;
  try {
    ({ supabase } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;

  const { data: requisition, error } = await supabase
    .from("talent_requisitions")
    .select(
      "*, talent_candidates(*, talent_notes(*), talent_scorecards(*), talent_stage_history(created_at)), talent_approval_steps(*), talent_requisition_assignment(*)"
    )
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  // Role overview needs human names for the assigned recruiter and the
  // approval chain, but those tables only store user ids. One batched
  // profiles lookup (admin client -- a recruiter/HM has no RLS grant to
  // read another user's profile row directly) resolves all of them.
  type ApprovalStepRow = { approver_user_id: string | null; decided_by: string | null };
  type AssignmentRow = { recruiter_id: string | null };
  if (requisition) {
    const rawApprovalSteps = requisition.talent_approval_steps;
    const approvalSteps: ApprovalStepRow[] = Array.isArray(rawApprovalSteps) ? rawApprovalSteps : rawApprovalSteps ? [rawApprovalSteps] : [];
    // talent_requisition_assignment has a unique constraint on requisition_id
    // (one assignment per req), so Supabase embeds it as a single object (or
    // null) rather than an array -- unlike the genuinely to-many relations
    // above. Normalize both shapes so the loop below never chokes on a
    // non-iterable object.
    const rawAssignment = requisition.talent_requisition_assignment;
    const assignment: AssignmentRow[] = Array.isArray(rawAssignment) ? rawAssignment : rawAssignment ? [rawAssignment] : [];
    const personIds = new Set<string>();
    for (const step of approvalSteps) {
      if (step.approver_user_id) personIds.add(step.approver_user_id);
      if (step.decided_by) personIds.add(step.decided_by);
    }
    for (const a of assignment) {
      if (a.recruiter_id) personIds.add(a.recruiter_id);
    }
    let peopleById = new Map<string, { full_name: string | null; email: string | null }>();
    if (personIds.size > 0) {
      const admin = createAdminClient();
      const { data: people } = await admin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", Array.from(personIds));
      for (const p of people || []) {
        peopleById.set(p.id, { full_name: p.full_name, email: p.email });
      }
    }
    requisition.talent_approval_steps = approvalSteps.map((step) => ({
      ...step,
      approver_name: step.approver_user_id ? peopleById.get(step.approver_user_id)?.full_name || peopleById.get(step.approver_user_id)?.email || null : null,
      decided_by_name: step.decided_by ? peopleById.get(step.decided_by)?.full_name || peopleById.get(step.decided_by)?.email || null : null,
    }));
    const recruiterAssignment = assignment[0];
    requisition.assigned_recruiter = recruiterAssignment?.recruiter_id
      ? {
          id: recruiterAssignment.recruiter_id,
          name: peopleById.get(recruiterAssignment.recruiter_id)?.full_name || peopleById.get(recruiterAssignment.recruiter_id)?.email || "Recruiter",
        }
      : null;
  }

  // "Days in current stage" needs the most recent stage change, not just
  // updated_at (which also bumps on plain profile edits and would make a
  // stale candidate look fresh every time someone fixes a typo). Compute
  // it from the real stage-history audit trail instead of trusting a
  // single mutable timestamp.
  type StageHistoryRow = { created_at: string };
  type CandidateWithHistory = { id: string; created_at: string; talent_stage_history?: StageHistoryRow[] | null };
  if (requisition?.talent_candidates) {
    const candidateRows = requisition.talent_candidates as CandidateWithHistory[];

    // Linked Offer.ai records for candidates at the Offer stage -- see the
    // candidate detail route for why this needs the admin client (offers
    // RLS is keyed to Offer.ai feature access, not Talent.ai).
    const offerCandidateIds = candidateRows.map((c) => c.id);
    let offerByCandidateId = new Map<string, { id: string; status: string }>();
    if (offerCandidateIds.length > 0) {
      const admin = createAdminClient();
      const { data: linkedOffers } = await admin
        .from("offers")
        .select("id, status, talent_candidate_id, created_at")
        .in("talent_candidate_id", offerCandidateIds)
        .order("created_at", { ascending: false });
      // linkedOffers is already ordered most-recent-first; only keep the
      // first (i.e. latest) offer seen per candidate.
      for (const o of linkedOffers || []) {
        const cid = o.talent_candidate_id as string;
        if (!offerByCandidateId.has(cid)) {
          offerByCandidateId.set(cid, { id: o.id, status: o.status });
        }
      }
    }

    requisition.talent_candidates = candidateRows.map((c) => {
      const history = c.talent_stage_history || [];
      const latest = history.reduce<string | null>((max, h) => (!max || h.created_at > max ? h.created_at : max), null);
      return { ...c, stage_entered_at: latest || c.created_at, linked_offer: offerByCandidateId.get(c.id) || null };
    });
  }

  return NextResponse.json({ requisition });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase, user;
  try {
    ({ supabase, user } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;
  const body = await req.json();

  const { data: existing } = await supabase
    .from("talent_requisitions")
    .select("status, title, created_by")
    .eq("id", id)
    .single();

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of [
    "title",
    "department",
    "location",
    "status",
    "priority",
    "hiring_manager",
    "description", // relabeled "Justification" in the UI
    "replacement_name",
    "replacement_employee_id",
    "cost_center",
    "comments",
    "target_hire_date",
    "job_level",
  ]) {
    if (key in body) patch[key] = body[key];
  }
  if ("employmentType" in body) patch.employment_type = body.employmentType;
  if ("headcount" in body) patch.headcount = Number(body.headcount) || 1;
  if ("requisitionType" in body && REQ_TYPES.has(body.requisitionType)) {
    patch.requisition_type = body.requisitionType;
  }
  if ("workMode" in body) {
    patch.work_mode = WORK_MODES.has(body.workMode) ? body.workMode : null;
  }
  if ("isConfidential" in body) patch.is_confidential = !!body.isConfidential;
  if ("isInternalOnly" in body) patch.is_internal_only = !!body.isInternalOnly;
  if ("compMin" in body) {
    patch.comp_min = body.compMin === "" || body.compMin == null ? null : Number(body.compMin);
  }
  if ("compMax" in body) {
    patch.comp_max = body.compMax === "" || body.compMax == null ? null : Number(body.compMax);
  }
  // Eligibility criteria: recruiter-edited (or AI auto-pulled then edited)
  // must-have/good-to-have skills etc. Stamped with who/when changed it so
  // "why did this candidate's score change" is always answerable.
  if ("eligibilityCriteria" in body) {
    patch.eligibility_criteria = body.eligibilityCriteria;
    patch.eligibility_criteria_updated_at = new Date().toISOString();
    patch.eligibility_criteria_updated_by = user.id;
  }

  const { data: requisition, error } = await supabase
    .from("talent_requisitions")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Status changed: log an audit row and, if the change wasn't made by the
  // requisition's own owner, let them know in-app that something moved.
  const nextStatus = typeof patch.status === "string" ? patch.status : null;
  if (existing && nextStatus && nextStatus !== existing.status) {
    await supabase.from("talent_requisition_status_history").insert({
      requisition_id: id,
      from_status: existing.status,
      to_status: nextStatus,
      changed_by: user.id,
      note: typeof body.statusNote === "string" ? body.statusNote : null,
    });

    if (existing.created_by && existing.created_by !== user.id) {
      await supabase.from("notifications").insert({
        user_id: existing.created_by,
        feature_key: FEATURE_KEY,
        title: `Requisition "${existing.title}" is now ${nextStatus.replace(/_/g, " ")}`,
        body: null,
        link: `/tools/talent-ai?requisition=${id}`,
        channel: "in_app",
      });
    }
  }

  return NextResponse.json({ requisition });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase;
  try {
    ({ supabase } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;

  const { error } = await supabase.from("talent_requisitions").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// Action route: AI pipeline summary, or resubmitting a sent-back requisition
// (rebuilds the approval chain from scratch and notifies the first approver
// again -- same behavior as the original submit).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase, user;
  try {
    ({ supabase, user } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  if (body.action === "resubmit") {
    const { data: requisition } = await supabase.from("talent_requisitions").select("*").eq("id", id).single();
    if (!requisition) return NextResponse.json({ error: "Requisition not found." }, { status: 404 });
    // A draft has never had an approval chain built; a sent-back req had one
    // that was already resolved (rejected) and needs a fresh one. Both are
    // valid starting points for "submit for approval" -- everything else
    // (already pending, approved, etc.) is not.
    if (requisition.status !== "sent_back" && requisition.status !== "draft") {
      return NextResponse.json(
        { error: "Only a draft or sent-back requisition can be submitted for approval." },
        { status: 409 }
      );
    }
    const wasDraft = requisition.status === "draft";

    const admin = createAdminClient();
    await admin.from("talent_approval_steps").delete().eq("requisition_id", id);
    const chain = await buildApprovalChain(admin, user.id);
    await admin.from("talent_approval_steps").insert(
      chain.map((step) => ({
        requisition_id: id,
        step_order: step.step_order,
        approver_role: step.approver_role,
        approver_user_id: step.approver_user_id,
      }))
    );
    await admin
      .from("talent_requisitions")
      .update({ status: "pending_approval", updated_at: new Date().toISOString() })
      .eq("id", id);
    await admin.from("talent_requisition_status_history").insert({
      requisition_id: id,
      from_status: requisition.status,
      to_status: "pending_approval",
      changed_by: user.id,
      note: wasDraft ? "Submitted for approval" : "Resubmitted after edits",
    });
    const firstStep = chain[0];
    if (firstStep?.approver_user_id) {
      await notifyUser({
        userId: firstStep.approver_user_id,
        title: wasDraft
          ? `Approval needed: "${requisition.title}"`
          : `Approval needed: "${requisition.title}" (resubmitted)`,
        link: `/tools/talent-ai?requisition=${id}`,
      });
    }
    await logAudit({
      entityType: "talent_requisitions",
      entityId: id,
      actorId: user.id,
      action: wasDraft ? "submitted" : "resubmitted",
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "structure_eligibility_criteria") {
    const { data: requisition, error: reqError } = await supabase
      .from("talent_requisitions")
      .select("title, description, jd_source_text")
      .eq("id", id)
      .single();
    if (reqError || !requisition) {
      return NextResponse.json({ error: "Requisition not found." }, { status: 404 });
    }
    const jdText = (typeof body.jdText === "string" && body.jdText.trim()) || requisition.description || requisition.jd_source_text || "";
    if (!jdText.trim()) {
      return NextResponse.json(
        { error: "This requisition has no job description text to pull criteria from. Enter it manually instead." },
        { status: 400 }
      );
    }
    try {
      const criteria = await structureEligibilityCriteria(jdText, requisition.title);
      return NextResponse.json({ criteria });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Could not pull criteria from the JD." },
        { status: 500 }
      );
    }
  }

  if (body.action !== "summarize") {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const { data: requisition, error: reqError } = await supabase
    .from("talent_requisitions")
    .select("title")
    .eq("id", id)
    .single();
  if (reqError || !requisition) {
    return NextResponse.json({ error: "Requisition not found." }, { status: 404 });
  }

  const { data: candidates, error: candError } = await supabase
    .from("talent_candidates")
    .select("name, stage, rating, tags, created_at")
    .eq("requisition_id", id);
  if (candError) {
    return NextResponse.json({ error: candError.message }, { status: 500 });
  }

  const now = Date.now();
  const shaped = (candidates || []).map((c) => ({
    name: c.name,
    stage: c.stage,
    rating: c.rating,
    tags: c.tags || [],
    days_in_stage: Math.max(0, Math.round((now - new Date(c.created_at).getTime()) / 86_400_000)),
  }));

  try {
    const summary = await summarizePipeline(requisition.title, shaped);
    const stageCounts: Record<string, number> = {};
    for (const c of shaped) stageCounts[c.stage] = (stageCounts[c.stage] || 0) + 1;
    return NextResponse.json({ summary: { ...summary, stage_counts: stageCounts } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI summary failed." },
      { status: 500 }
    );
  }
}
