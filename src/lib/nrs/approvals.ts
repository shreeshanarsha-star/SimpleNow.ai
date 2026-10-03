import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getNrsContext, NRS_FEATURE_KEY, type NrsContext } from "./member";
import { logAudit } from "./audit";
import { notifyMembers } from "./notify";

// NR Synergy approval engine: one engine (nrs_requests + nrs_request_steps)
// for every request kind. Server-only. All writes use the service-role
// client; permission to decide is checked with the caller's own client via
// the nrs_can_act_on_step() RPC (approver, role holder or active delegate).
//
// Routes should catch NrsApprovalError and return
//   NextResponse.json({ error: e.message }, { status: e.status }).

export type NrsRequestKind = "leave" | "correction" | "expense" | "travel" | "invoice" | "project";
export type NrsApproverRole = "hr_admin" | "finance" | "super_admin" | "travel_desk";

const APPROVER_ROLES: readonly NrsApproverRole[] = ["hr_admin", "finance", "super_admin", "travel_desk"];
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

export const NRS_REQUEST_KINDS: readonly NrsRequestKind[] = ["leave", "correction", "expense", "travel", "invoice", "project"];

export const DEFAULT_CHAINS: Readonly<Record<NrsRequestKind, ChainStep[]>> = {
  leave: [{ type: "manager" }],
  correction: [{ type: "manager" }],
  expense: [{ type: "manager" }, { type: "role", role: "finance", when: { amount_minor_gt: 50000 } }],
  travel: [
    { type: "manager" },
    { type: "role", role: "travel_desk" },
    { type: "role", role: "finance", when: { amount_minor_gt: 100000 } },
  ],
  invoice: [{ type: "manager" }, { type: "role", role: "hr_admin" }, { type: "role", role: "finance" }],
  project: [{ type: "manager" }],
};

/** kind -> the table holding the subject row. */
export const SUBJECT_TABLES: Readonly<Record<NrsRequestKind, string>> = {
  leave: "nrs_leave_requests",
  correction: "nrs_corrections",
  expense: "nrs_expenses",
  travel: "nrs_travel_requests",
  invoice: "nrs_invoices",
  project: "nrs_projects",
};

/**
 * Column on the subject table that mirrors the request's state. Projects keep
 * their delivery status in `status`, so the approval state lives in
 * `approval_status` (pending | approved | rejected | sent_back).
 */
const SUBJECT_STATUS_COLUMN: Readonly<Record<NrsRequestKind, string>> = {
  leave: "status",
  correction: "status",
  expense: "status",
  travel: "status",
  invoice: "status",
  project: "approval_status",
};

// Subject status while the request is in flight / when fully approved.
const SUBMITTED_STATUS: Readonly<Record<NrsRequestKind, string>> = {
  leave: "pending",
  correction: "pending",
  expense: "submitted",
  travel: "pending",
  invoice: "submitted",
  project: "pending",
};
const APPROVED_STATUS: Readonly<Record<NrsRequestKind, string>> = {
  leave: "approved",
  correction: "approved",
  expense: "approved",
  travel: "approved",
  invoice: "finance_approved",
  project: "approved",
};

const REQUESTER_LINK: Readonly<Record<Exclude<NrsRequestKind, "project">, string>> = {
  leave: "/tools/nr-synergy/time",
  correction: "/tools/nr-synergy/time",
  expense: "/tools/nr-synergy/money",
  travel: "/tools/nr-synergy/money",
  invoice: "/tools/nr-synergy/money",
};

function requesterLink(kind: NrsRequestKind, subjectId: string): string {
  return kind === "project" ? `/tools/nr-synergy/projects/${subjectId}` : REQUESTER_LINK[kind];
}
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
    return typeof r === "string" && (APPROVER_ROLES as readonly string[]).includes(r);
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

async function approverMemberIds(admin: SupabaseClient, orgId: string, step: ExpandedStep): Promise<string[]> {
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
  return Array.from(new Set(memberIds));
}

async function approverUserIds(admin: SupabaseClient, orgId: string, step: ExpandedStep): Promise<string[]> {
  return userIdsForMembers(admin, orgId, await approverMemberIds(admin, orgId, step));
}

/**
 * Projects notify through the shared notify.ts helper (in-app + email).
 * Other kinds keep the engine's in-app-only notice.
 */
async function notifyApprovers(
  admin: SupabaseClient,
  kind: NrsRequestKind,
  orgId: string,
  step: ExpandedStep,
  msg: { title: string; body?: string | null; link: string },
  requester: { memberId: string; userId: string | null }
): Promise<void> {
  if (kind === "project") {
    const ids = (await approverMemberIds(admin, orgId, step)).filter((id) => id !== requester.memberId);
    await notifyMembers(admin, orgId, ids, { title: msg.title, body: msg.body ?? undefined, link: msg.link });
    return;
  }
  await notify(admin, orgId, await approverUserIds(admin, orgId, step), msg, requester.userId);
}

async function notifyRequester(
  admin: SupabaseClient,
  kind: NrsRequestKind,
  orgId: string,
  requester: { memberId: string; userId: string | null },
  msg: { title: string; body?: string | null; link: string }
): Promise<void> {
  if (kind === "project") {
    await notifyMembers(admin, orgId, [requester.memberId], { title: msg.title, body: msg.body ?? undefined, link: msg.link });
    return;
  }
  if (requester.userId) await notify(admin, orgId, [requester.userId], msg);
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

/** Insert the default chains for any kind the org has no chain for yet. */
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
  const patch: Record<string, string | null> = { [SUBJECT_STATUS_COLUMN[kind]]: status };
  if (kind === "project") patch.approved_at = status === "approved" ? new Date().toISOString() : null;
  const { error } = await admin.from(SUBJECT_TABLES[kind]).update(patch).eq("id", subjectId);
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
  /**
   * Also restart a request that is still pending (its subject was edited
   * mid-approval): the chain is re-expanded with the new amount and the first
   * approver is notified again.
   */
  restartPending?: boolean;
}

export interface CreateRequestResult {
  requestId: string;
  status: "pending" | "approved";
  steps: ExpandedStep[];
}

/**
 * Open an approval request for a subject row (leave, correction, expense,
 * travel, invoice, project) owned by memberId. The caller must already have
 * checked that the actor may submit for this member. Re-submitting a subject
 * whose previous request was sent back / cancelled restarts that request:
 * unique (kind, subject_id) means the same nrs_requests row is reused, its
 * old steps are deleted and a fresh chain is inserted. With
 * opts.restartPending a still-pending request is restarted the same way.
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
    const restartable: NrsRequestStatus[] = opts.restartPending
      ? ["sent_back", "cancelled", "draft", "pending"]
      : ["sent_back", "cancelled", "draft"];
    if (!restartable.includes(existing.status)) {
      throw new NrsApprovalError(`This ${kind} already has a ${existing.status} request`, 409);
    }
    // Claim the restart first, conditional on the status we read, so two
    // concurrent resubmits can't both rebuild the chain.
    const { data: restarted, error: upErr } = await admin
      .from("nrs_requests")
      .update({ ...requestFields, created_at: now })
      .eq("id", existing.id)
      .eq("status", existing.status)
      .select("id");
    if (upErr) throw new NrsApprovalError(upErr.message, 500);
    if (!restarted || (restarted as unknown[]).length === 0) {
      throw new NrsApprovalError(`This ${kind} was already resubmitted`, 409);
    }
    // Old steps (decided / skipped) make way for the fresh chain.
    const { error: delErr } = await admin.from("nrs_request_steps").delete().eq("request_id", existing.id);
    if (delErr) {
      await admin.from("nrs_requests").update({ status: existing.status }).eq("id", existing.id);
      throw new NrsApprovalError(delErr.message, 500);
    }
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
      else await admin.from("nrs_requests").update({ status: existing.status }).eq("id", existing.id);
      throw new NrsApprovalError(`Creating approval steps: ${stepErr.message}`, 500);
    }
  }

  await setSubjectStatus(admin, kind, subjectId, autoApproved ? APPROVED_STATUS[kind] : SUBMITTED_STATUS[kind]);

  if (steps[0]) {
    await notifyApprovers(
      admin,
      kind,
      orgId,
      steps[0],
      {
        title: kind === "project" ? `${member.full_name} submitted a project for approval` : `${member.full_name} needs your approval`,
        body: title.trim(),
        link: APPROVER_LINK,
      },
      { memberId: member.id, userId: member.user_id }
    );
  } else if (kind === "project") {
    await notifyRequester(admin, kind, orgId, { memberId: member.id, userId: member.user_id }, {
      title: `Approved: ${title.trim()}`,
      body: "Your project was approved automatically.",
      link: requesterLink(kind, subjectId),
    });
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

  // HR / admins may also decide project approvals addressed to a manager.
  const hrOverride = canAct !== true && request.kind === "project" && ctx.isHr;
  if (canAct !== true && !hrOverride) throw new NrsApprovalError("You can't act on this approval step", 403);

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

  const actingFor =
    !hrOverride && step.approver_member_id && me && step.approver_member_id !== me ? step.approver_member_id : null;
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

      await notifyApprovers(
        admin,
        request.kind,
        request.org_id,
        next,
        { title: `${requester?.full_name ?? "A colleague"} needs your approval`, body: request.title, link: APPROVER_LINK },
        { memberId: request.member_id, userId: requester?.user_id ?? null }
      );
    } else {
      requestStatus = "approved";
      const { error: fErr } = await admin
        .from("nrs_requests")
        .update({ status: "approved", decided_at: now })
        .eq("id", request.id);
      if (fErr) throw new NrsApprovalError(fErr.message, 500);
      await setSubjectStatus(admin, request.kind, request.subject_id, APPROVED_STATUS[request.kind]);
      await notifyRequester(admin, request.kind, request.org_id, { memberId: request.member_id, userId: requester?.user_id ?? null }, {
        title: `Approved: ${request.title}`,
        body: note ? `${deciderName}: ${note}` : `Approved by ${deciderName}`,
        link: requesterLink(request.kind, request.subject_id),
      });
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
    await notifyRequester(admin, request.kind, request.org_id, { memberId: request.member_id, userId: requester?.user_id ?? null }, {
      title: `${decision === "reject" ? "Rejected" : "Sent back"}: ${request.title}`,
      body: `${deciderName}: ${note}`,
      link: requesterLink(request.kind, request.subject_id),
    });
  }

  await logAudit(admin, {
    orgId: request.org_id,
    actorUser: ctx.user.id,
    entity: "nrs_request_steps",
    entityId: step.id,
    action: decision,
    before: { step_status: "pending", request_status: "pending" },
    after: { step_status: stepStatus, request_status: requestStatus, next_step_id: nextStepId },
    context: { request_id: request.id, kind: request.kind, acting_for_member: actingFor, comment: note || null, hr_override: hrOverride },
  });

  return { requestId: request.id, requestStatus, nextStepId };
}
