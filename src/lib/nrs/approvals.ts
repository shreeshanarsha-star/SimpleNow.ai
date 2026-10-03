import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getNrsContext, NRS_FEATURE_KEY, type NrsContext } from "./member";
import { logAudit } from "./audit";

// NR Synergy approval engine: one engine (nrs_requests + nrs_request_steps)
// for every request kind. Server-only. All writes use the service-role
// client; permission to decide is checked with the caller's own client via
// the nrs_can_act_on_step() RPC (approver, role holder or active delegate).
//
// Routes should catch NrsApprovalError and return
//   NextResponse.json({ error: e.message }, { status: e.status }).

export type NrsRequestKind = "leave" | "correction" | "expense" | "travel" | "invoice";
export type NrsApproverRole = "hr_admin" | "finance" | "super_admin";
export type NrsDecision = "approve" | "reject" | "send_back";
export type NrsRequestStatus = "draft" | "pending" | "approved" | "rejected" | "sent_back" | "cancelled";
export type NrsStepStatus = "waiting" | "pending" | "approved" | "rejected" | "sent_back" | "skipped";

export interface ChainStepCondition {
  /** Step applies only when the request amount (minor units) is strictly greater. */
  amount_minor_gt?: number;
}

export type ChainStep =
  | { type: "manager"; when?: ChainStepCondition }
  | { type: "role"; role: NrsApproverRole; when?: ChainStepCondition }
  | { type: "member"; member_id: string; when?: ChainStepCondition };

export const NRS_REQUEST_KINDS: readonly NrsRequestKind[] = ["leave", "correction", "expense", "travel", "invoice"];

export const DEFAULT_CHAINS: Readonly<Record<NrsRequestKind, ChainStep[]>> = {
  leave: [{ type: "manager" }],
  correction: [{ type: "manager" }],
  expense: [{ type: "manager" }, { type: "role", role: "finance", when: { amount_minor_gt: 50000 } }],
  travel: [{ type: "manager" }],
  invoice: [{ type: "manager" }, { type: "role", role: "hr_admin" }, { type: "role", role: "finance" }],
};

/** kind -> the table holding the subject row. */
export const SUBJECT_TABLES: Readonly<Record<NrsRequestKind, string>> = {
  leave: "nrs_leave_requests",
  correction: "nrs_corrections",
  expense: "nrs_expenses",
  travel: "nrs_travel_requests",
  invoice: "nrs_invoices",
};

// Subject status while the request is in flight / when fully approved.
const SUBMITTED_STATUS: Readonly<Record<NrsRequestKind, string>> = {
  leave: "pending",
  correction: "pending",
  expense: "submitted",
  travel: "pending",
  invoice: "submitted",
};
const APPROVED_STATUS: Readonly<Record<NrsRequestKind, string>> = {
  leave: "approved",
  correction: "approved",
  expense: "approved",
  travel: "approved",
  invoice: "finance_approved",
};

const REQUESTER_LINK: Readonly<Record<NrsRequestKind, string>> = {
  leave: "/tools/nr-synergy/time",
  correction: "/tools/nr-synergy/time",
  expense: "/tools/nr-synergy/money",
  travel: "/tools/nr-synergy/money",
  invoice: "/tools/nr-synergy/money",
};
const APPROVER_LINK = "/tools/nr-synergy/team";

export class NrsApprovalError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "NrsApprovalError";
    this.status = status;
  }
}

interface MemberLite {
  id: string;
  org_id: string;
  user_id: string | null;
  full_name: string;
  manager_id: string | null;
}

interface StepRow {
  id: string;
  request_id: string;
  org_id: string;
  step_no: number;
  approver_type: "manager" | "role" | "member";
  approver_role: NrsApproverRole | null;
  approver_member_id: string | null;
  status: NrsStepStatus;
}

interface RequestRow {
  id: string;
  org_id: string;
  kind: NrsRequestKind;
  subject_id: string;
  member_id: string;
  title: string;
  status: NrsRequestStatus;
  current_step: number;
  amount_minor: number | null;
  currency: string | null;
}

export interface ExpandedStep {
  step_no: number;
  approver_type: "manager" | "role" | "member";
  approver_role: NrsApproverRole | null;
  approver_member_id: string | null;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function isChainStep(v: unknown): v is ChainStep {
  if (!v || typeof v !== "object") return false;
  const t = (v as { type?: unknown }).type;
  if (t === "manager") return true;
  if (t === "role") {
    const r = (v as { role?: unknown }).role;
    return r === "hr_admin" || r === "finance" || r === "super_admin";
  }
  if (t === "member") return typeof (v as { member_id?: unknown }).member_id === "string";
  return false;
}

// ---------------------------------------------------------------------------
// Notifications (existing platform `notifications` table)
// ---------------------------------------------------------------------------

async function userIdsForMembers(admin: SupabaseClient, orgId: string, memberIds: string[]): Promise<string[]> {
  if (!memberIds.length) return [];
  const { data } = await admin
    .from("nrs_members")
    .select("user_id")
    .eq("org_id", orgId)
    .in("id", memberIds)
    .eq("status", "active")
    .is("deleted_at", null);
  return ((data ?? []) as { user_id: string | null }[]).map((r) => r.user_id).filter((u): u is string => !!u);
}

async function memberIdsWithRole(admin: SupabaseClient, orgId: string, role: NrsApproverRole): Promise<string[]> {
  const { data: roleRows } = await admin
    .from("nrs_member_roles")
    .select("member_id")
    .in("role", role === "super_admin" ? ["super_admin"] : [role, "super_admin"]);
  const ids = Array.from(new Set(((roleRows ?? []) as { member_id: string }[]).map((r) => r.member_id)));
  if (!ids.length) return [];
  const { data: members } = await admin
    .from("nrs_members")
    .select("id")
    .eq("org_id", orgId)
    .in("id", ids)
    .eq("status", "active")
    .is("deleted_at", null);
  return ((members ?? []) as { id: string }[]).map((m) => m.id);
}

async function approverUserIds(admin: SupabaseClient, orgId: string, step: ExpandedStep): Promise<string[]> {
  const memberIds: string[] = [];
  if (step.approver_member_id) {
    memberIds.push(step.approver_member_id);
    // Active delegates of that approver can act too.
    const today = todayUtc();
    const { data: dels } = await admin
      .from("nrs_delegations")
      .select("delegate_member_id")
      .eq("org_id", orgId)
      .eq("member_id", step.approver_member_id)
      .lte("starts_on", today)
      .gte("ends_on", today);
    for (const d of (dels ?? []) as { delegate_member_id: string }[]) memberIds.push(d.delegate_member_id);
  } else if (step.approver_type === "role" && step.approver_role) {
    memberIds.push(...(await memberIdsWithRole(admin, orgId, step.approver_role)));
  }
  return userIdsForMembers(admin, orgId, Array.from(new Set(memberIds)));
}

async function notify(
  admin: SupabaseClient,
  orgId: string,
  userIds: string[],
  msg: { title: string; body?: string | null; link: string },
  excludeUserId?: string | null
): Promise<void> {
  const recipients = Array.from(new Set(userIds)).filter((u) => u !== excludeUserId);
  if (!recipients.length) return;
  const { error } = await admin.from("notifications").insert(
    recipients.map((userId) => ({
      user_id: userId,
      org_id: orgId,
      feature_key: NRS_FEATURE_KEY,
      title: msg.title,
      body: msg.body ?? null,
      link: msg.link,
      channel: "in_app",
    }))
  );
  // Best-effort: a failed notification never blocks the approval itself.
  if (error) console.error("[nrs] notification insert failed", error.message);
}

// ---------------------------------------------------------------------------
// Chains
// ---------------------------------------------------------------------------

/** Insert the five default chains for any kind the org has no chain for yet. */
export async function ensureDefaultChains(admin: SupabaseClient, orgId: string): Promise<{ inserted: NrsRequestKind[] }> {
  const { data, error } = await admin.from("nrs_approval_chains").select("kind").eq("org_id", orgId);
  if (error) throw new NrsApprovalError(`Approval chains: ${error.message}`, 500);
  const have = new Set(((data ?? []) as { kind: NrsRequestKind }[]).map((r) => r.kind));
  const missing = NRS_REQUEST_KINDS.filter((k) => !have.has(k));
  if (!missing.length) return { inserted: [] };
  const { error: insErr } = await admin.from("nrs_approval_chains").upsert(
    missing.map((kind) => ({
      org_id: orgId,
      kind,
      steps: DEFAULT_CHAINS[kind],
      applies_to: "all",
      effective_from: todayUtc(),
    })),
    { onConflict: "org_id,kind,applies_to,effective_from", ignoreDuplicates: true }
  );
  if (insErr) throw new NrsApprovalError(`Approval chains: ${insErr.message}`, 500);
  return { inserted: missing };
}

/**
 * Latest chain (effective_from <= today) for the org + kind. A chain for the
 * member's specific engagement type wins over an 'all' chain. Falls back to
 * seeding and using DEFAULT_CHAINS when the org has none.
 */
async function loadChain(
  admin: SupabaseClient,
  orgId: string,
  kind: NrsRequestKind,
  engagementType: string | null
): Promise<ChainStep[]> {
  const appliesTo = engagementType ? [engagementType, "all"] : ["all"];
  const { data, error } = await admin
    .from("nrs_approval_chains")
    .select("steps, applies_to, effective_from")
    .eq("org_id", orgId)
    .eq("kind", kind)
    .lte("effective_from", todayUtc())
    .in("applies_to", appliesTo)
    .order("effective_from", { ascending: false });
  if (error) throw new NrsApprovalError(`Approval chain: ${error.message}`, 500);
  const rows = (data ?? []) as { steps: unknown; applies_to: string }[];
  const chosen = rows.find((r) => r.applies_to === engagementType) ?? rows.find((r) => r.applies_to === "all");
  if (!chosen) {
    await ensureDefaultChains(admin, orgId);
    return DEFAULT_CHAINS[kind];
  }
  if (!Array.isArray(chosen.steps) || !chosen.steps.every(isChainStep)) {
    throw new NrsApprovalError(`The ${kind} approval chain is misconfigured. Ask HR to fix it.`, 500);
  }
  return chosen.steps;
}

function expandSteps(chain: ChainStep[], member: MemberLite, amountMinor: number | null): ExpandedStep[] {
  const out: ExpandedStep[] = [];
  for (const step of chain) {
    const gt = step.when?.amount_minor_gt;
    if (typeof gt === "number" && !(amountMinor != null && amountMinor > gt)) continue;
    let expanded: Omit<ExpandedStep, "step_no">;
    if (step.type === "manager") {
      // No manager on file: route to HR so the request can't get stuck.
      expanded = member.manager_id
        ? { approver_type: "manager", approver_role: null, approver_member_id: member.manager_id }
        : { approver_type: "role", approver_role: "hr_admin", approver_member_id: null };
    } else if (step.type === "role") {
      expanded = { approver_type: "role", approver_role: step.role, approver_member_id: null };
    } else {
      expanded = { approver_type: "member", approver_role: null, approver_member_id: step.member_id };
    }
    out.push({ step_no: out.length + 1, ...expanded });
  }
  return out;
}

async function setSubjectStatus(admin: SupabaseClient, kind: NrsRequestKind, subjectId: string, status: string) {
  const { error } = await admin.from(SUBJECT_TABLES[kind]).update({ status }).eq("id", subjectId);
  if (error) throw new NrsApprovalError(`Updating ${kind} status: ${error.message}`, 500);
}

// ---------------------------------------------------------------------------
// createRequest
// ---------------------------------------------------------------------------

export interface CreateRequestOptions {
  /** auth.users id of the submitter (nrs_requests.created_by + audit actor). */
  createdBy?: string | null;
  summary?: string | null;
  isDemo?: boolean;
  /** Service-role client; created when omitted. */
  admin?: SupabaseClient;
}

export interface CreateRequestResult {
  requestId: string;
  status: "pending" | "approved";
  steps: ExpandedStep[];
}

/**
 * Open an approval request for a subject row (leave, correction, expense,
 * travel, invoice) owned by memberId. The caller must already have checked
 * that the actor may submit for this member. Re-submitting a subject whose
 * previous request was sent back / cancelled restarts that request.
 */
export async function createRequest(
  kind: NrsRequestKind,
  subjectId: string,
  memberId: string,
  title: string,
  amountMinor?: number | null,
  currency?: string | null,
  opts: CreateRequestOptions = {}
): Promise<CreateRequestResult> {
  if (!NRS_REQUEST_KINDS.includes(kind)) throw new NrsApprovalError(`Unknown request kind "${kind}"`);
  if (!title.trim()) throw new NrsApprovalError("A title is required");
  if (amountMinor != null && !Number.isSafeInteger(amountMinor)) {
    throw new NrsApprovalError("amountMinor must be an integer of minor units");
  }
  const admin = opts.admin ?? createAdminClient();

  const { data: memberData, error: mErr } = await admin
    .from("nrs_members")
    .select("id, org_id, user_id, full_name, manager_id")
    .eq("id", memberId)
    .is("deleted_at", null)
    .maybeSingle();
  if (mErr) throw new NrsApprovalError(mErr.message, 500);
  const member = memberData as MemberLite | null;
  if (!member) throw new NrsApprovalError("Member not found", 404);
  const orgId = member.org_id;

  const { data: engData } = await admin.rpc("nrs_engagement_type", { m: member.id });
  const engagementType = typeof engData === "string" ? engData : null;

  const chain = await loadChain(admin, orgId, kind, engagementType);
  const steps = expandSteps(chain, member, amountMinor ?? null);
  const autoApproved = steps.length === 0;
  const now = new Date().toISOString();

  const requestFields = {
    org_id: orgId,
    kind,
    subject_id: subjectId,
    member_id: member.id,
    created_by: opts.createdBy ?? null,
    title: title.trim(),
    summary: opts.summary ?? null,
    amount_minor: amountMinor ?? null,
    currency: currency ?? null,
    status: autoApproved ? "approved" : "pending",
    current_step: 1,
    is_demo: opts.isDemo ?? false,
    decided_at: autoApproved ? now : null,
  };

  // unique (kind, subject_id): restart a sent-back / cancelled / draft request.
  const { data: existingData } = await admin
    .from("nrs_requests")
    .select("id, status")
    .eq("kind", kind)
    .eq("subject_id", subjectId)
    .maybeSingle();
  const existing = existingData as { id: string; status: NrsRequestStatus } | null;

  let requestId: string;
  if (existing) {
    if (!["sent_back", "cancelled", "draft"].includes(existing.status)) {
      throw new NrsApprovalError(`This ${kind} already has a ${existing.status} request`, 409);
    }
    const { error: delErr } = await admin.from("nrs_request_steps").delete().eq("request_id", existing.id);
    if (delErr) throw new NrsApprovalError(delErr.message, 500);
    const { error: upErr } = await admin.from("nrs_requests").update(requestFields).eq("id", existing.id);
    if (upErr) throw new NrsApprovalError(upErr.message, 500);
    requestId = existing.id;
  } else {
    const { data: inserted, error: insErr } = await admin
      .from("nrs_requests")
      .insert(requestFields)
      .select("id")
      .single();
    if (insErr || !inserted) throw new NrsApprovalError(insErr?.message ?? "Could not create request", 500);
    requestId = (inserted as { id: string }).id;
  }

  if (steps.length) {
    const { error: stepErr } = await admin.from("nrs_request_steps").insert(
      steps.map((s, i) => ({
        request_id: requestId,
        org_id: orgId,
        step_no: s.step_no,
        approver_type: s.approver_type,
        approver_role: s.approver_role,
        approver_member_id: s.approver_member_id,
        status: i === 0 ? "pending" : "waiting",
      }))
    );
    if (stepErr) {
      if (!existing) await admin.from("nrs_requests").delete().eq("id", requestId);
      throw new NrsApprovalError(`Creating approval steps: ${stepErr.message}`, 500);
    }
  }

  await setSubjectStatus(admin, kind, subjectId, autoApproved ? APPROVED_STATUS[kind] : SUBMITTED_STATUS[kind]);

  if (steps[0]) {
    const recipients = await approverUserIds(admin, orgId, steps[0]);
    await notify(
      admin,
      orgId,
      recipients,
      { title: `${member.full_name} needs your approval`, body: title.trim(), link: APPROVER_LINK },
      member.user_id
    );
  }

  await logAudit(admin, {
    orgId,
    actorUser: opts.createdBy ?? null,
    entity: "nrs_requests",
    entityId: requestId,
    action: existing ? "resubmit" : "submit",
    after: { kind, subject_id: subjectId, member_id: member.id, steps, amount_minor: amountMinor ?? null, currency },
  });

  return { requestId, status: autoApproved ? "approved" : "pending", steps };
}

// ---------------------------------------------------------------------------
// decide
// ---------------------------------------------------------------------------

export interface DecideOptions {
  /** The caller's own (RLS) client, used for the nrs_can_act_on_step RPC. */
  supabase?: SupabaseClient;
  /** The caller's NR Synergy context (from requireNrs / getNrsContext). */
  ctx?: NrsContext;
  /** Service-role client; created when omitted. */
  admin?: SupabaseClient;
}

export interface DecideResult {
  requestId: string;
  requestStatus: NrsRequestStatus;
  /** Set when an approve moved the request on to another step. */
  nextStepId: string | null;
}

/**
 * Approve, reject or send back the pending step `stepId` as the signed-in
 * caller. Reject and send_back need a comment and end the request.
 */
export async function decide(
  stepId: string,
  decision: NrsDecision,
  comment: string | null | undefined,
  opts: DecideOptions = {}
): Promise<DecideResult> {
  if (decision !== "approve" && decision !== "reject" && decision !== "send_back") {
    throw new NrsApprovalError(`Unknown decision "${String(decision)}"`);
  }
  const note = (comment ?? "").trim();
  if (decision !== "approve" && !note) {
    throw new NrsApprovalError("A comment is required to reject or send back");
  }

  const supabase = opts.supabase ?? (await createClient());
  const ctx = opts.ctx ?? (await getNrsContext());
  if (!ctx) throw new NrsApprovalError("Not authenticated", 401);
  const admin = opts.admin ?? createAdminClient();

  const { data: canAct, error: rpcErr } = await supabase.rpc("nrs_can_act_on_step", { step_id: stepId });
  if (rpcErr) throw new NrsApprovalError(rpcErr.message, 500);
  if (canAct !== true) throw new NrsApprovalError("You can't act on this approval step", 403);

  const { data: stepData, error: sErr } = await admin
    .from("nrs_request_steps")
    .select("id, request_id, org_id, step_no, approver_type, approver_role, approver_member_id, status")
    .eq("id", stepId)
    .maybeSingle();
  if (sErr) throw new NrsApprovalError(sErr.message, 500);
  const step = stepData as StepRow | null;
  if (!step) throw new NrsApprovalError("Approval step not found", 404);

  const { data: reqData, error: rErr } = await admin
    .from("nrs_requests")
    .select("id, org_id, kind, subject_id, member_id, title, status, current_step, amount_minor, currency")
    .eq("id", step.request_id)
    .maybeSingle();
  if (rErr) throw new NrsApprovalError(rErr.message, 500);
  const request = reqData as RequestRow | null;
  if (!request) throw new NrsApprovalError("Request not found", 404);

  if (!ctx.isPlatformAdmin && ctx.orgId !== request.org_id) {
    throw new NrsApprovalError("You can't act on this approval step", 403);
  }
  if (request.status !== "pending" || step.status !== "pending" || step.step_no !== request.current_step) {
    throw new NrsApprovalError("This step has already been decided", 409);
  }
  const me = ctx.member?.id ?? null;
  const { data: requesterData } = await admin
    .from("nrs_members")
    .select("user_id, full_name")
    .eq("id", request.member_id)
    .maybeSingle();
  const requester = requesterData as { user_id: string | null; full_name: string } | null;
  // Never on your own request, whether matched by member row or by login.
  if ((me && me === request.member_id) || (requester?.user_id && requester.user_id === ctx.user.id)) {
    throw new NrsApprovalError("You can't decide your own request", 403);
  }

  const actingFor = step.approver_member_id && me && step.approver_member_id !== me ? step.approver_member_id : null;
  const now = new Date().toISOString();
  const stepStatus: NrsStepStatus =
    decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "sent_back";

  // Conditional on status = 'pending' so two approvers can't both decide.
  const { data: updated, error: uErr } = await admin
    .from("nrs_request_steps")
    .update({
      status: stepStatus,
      decided_by_member: me,
      acting_for_member: actingFor,
      comment: note || null,
      decided_at: now,
    })
    .eq("id", step.id)
    .eq("status", "pending")
    .select("id");
  if (uErr) throw new NrsApprovalError(uErr.message, 500);
  if (!updated || (updated as unknown[]).length === 0) {
    throw new NrsApprovalError("This step has already been decided", 409);
  }

  const deciderName = ctx.member?.full_name ?? ctx.firstName;

  let requestStatus: NrsRequestStatus = "pending";
  let nextStepId: string | null = null;

  if (decision === "approve") {
    const { data: nextData } = await admin
      .from("nrs_request_steps")
      .select("id, request_id, org_id, step_no, approver_type, approver_role, approver_member_id, status")
      .eq("request_id", request.id)
      .eq("status", "waiting")
      .order("step_no", { ascending: true })
      .limit(1)
      .maybeSingle();
    const next = nextData as StepRow | null;

    if (next) {
      const { error: nErr } = await admin.from("nrs_request_steps").update({ status: "pending" }).eq("id", next.id);
      if (nErr) throw new NrsApprovalError(nErr.message, 500);
      const { error: crErr } = await admin
        .from("nrs_requests")
        .update({ current_step: next.step_no })
        .eq("id", request.id);
      if (crErr) throw new NrsApprovalError(crErr.message, 500);
      nextStepId = next.id;

      if (request.kind === "invoice") {
        if (step.approver_type === "manager") {
          await setSubjectStatus(admin, "invoice", request.subject_id, "manager_approved");
        } else if (step.approver_role === "hr_admin") {
          await setSubjectStatus(admin, "invoice", request.subject_id, "hr_approved");
        }
      }

      const recipients = await approverUserIds(admin, request.org_id, next);
      await notify(
        admin,
        request.org_id,
        recipients,
        { title: `${requester?.full_name ?? "A colleague"} needs your approval`, body: request.title, link: APPROVER_LINK },
        requester?.user_id
      );
    } else {
      requestStatus = "approved";
      const { error: fErr } = await admin
        .from("nrs_requests")
        .update({ status: "approved", decided_at: now })
        .eq("id", request.id);
      if (fErr) throw new NrsApprovalError(fErr.message, 500);
      await setSubjectStatus(admin, request.kind, request.subject_id, APPROVED_STATUS[request.kind]);
      if (requester?.user_id) {
        await notify(admin, request.org_id, [requester.user_id], {
          title: `Approved: ${request.title}`,
          body: note ? `${deciderName}: ${note}` : `Approved by ${deciderName}`,
          link: REQUESTER_LINK[request.kind],
        });
      }
    }
  } else {
    requestStatus = decision === "reject" ? "rejected" : "sent_back";
    const { error: endErr } = await admin
      .from("nrs_requests")
      .update({ status: requestStatus, decided_at: now })
      .eq("id", request.id);
    if (endErr) throw new NrsApprovalError(endErr.message, 500);
    await admin.from("nrs_request_steps").update({ status: "skipped" }).eq("request_id", request.id).eq("status", "waiting");
    await setSubjectStatus(admin, request.kind, request.subject_id, requestStatus);
    if (requester?.user_id) {
      await notify(admin, request.org_id, [requester.user_id], {
        title: `${decision === "reject" ? "Rejected" : "Sent back"}: ${request.title}`,
        body: `${deciderName}: ${note}`,
        link: REQUESTER_LINK[request.kind],
      });
    }
  }

  await logAudit(admin, {
    orgId: request.org_id,
    actorUser: ctx.user.id,
    entity: "nrs_request_steps",
    entityId: step.id,
    action: decision,
    before: { step_status: "pending", request_status: "pending" },
    after: { step_status: stepStatus, request_status: requestStatus, next_step_id: nextStepId },
    context: { request_id: request.id, kind: request.kind, acting_for_member: actingFor, comment: note || null },
  });

  return { requestId: request.id, requestStatus, nextStepId };
}
