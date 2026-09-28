// Smart Source.ai pipeline model: Stage (where the candidate is) + Status
// (what is happening inside that stage). This file is the single source of
// truth for both the API (validation, auto-advance) and the UI (dropdowns,
// funnel, badges). It must stay free of server-only imports.

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

export const STAGES = [
  { key: "sourcing", label: "Sourcing", short: "Sourcing", optional: false },
  { key: "screening", label: "Screening", short: "Screening", optional: true },
  { key: "hm_review", label: "HM Review", short: "HM Review", optional: true },
  { key: "l1", label: "L1 Interview", short: "L1", optional: true },
  { key: "l2", label: "L2 Interview", short: "L2", optional: true },
  { key: "l3", label: "L3 Interview", short: "L3", optional: true },
  { key: "assessment", label: "Assessment", short: "Assessment", optional: true },
  { key: "hr_interview", label: "HR Interview", short: "HR", optional: true },
  { key: "offer", label: "Offer", short: "Offer", optional: false },
  { key: "joining", label: "Joining", short: "Joining", optional: false },
] as const;

export type StageKey = (typeof STAGES)[number]["key"];

export const STAGE_KEYS: StageKey[] = STAGES.map((s) => s.key);

export function isStageKey(v: unknown): v is StageKey {
  return typeof v === "string" && (STAGE_KEYS as string[]).includes(v);
}

export function stageLabel(key: string | null | undefined): string {
  return STAGES.find((s) => s.key === key)?.label ?? "Sourcing";
}

// ---------------------------------------------------------------------------
// Statuses
// ---------------------------------------------------------------------------

// tone drives badge colour; `exit` marks outcomes that take a candidate out
// of the active funnel ("Other" bucket); `needs` lists what the change dialog
// must collect before the status can be saved.
export type StatusTone = "neutral" | "info" | "progress" | "success" | "warning" | "danger";
export type StatusNeed = "reason_reject" | "reason_withdraw" | "reason_hold" | "schedule" | "feedback" | "ctc" | "doj";
export type ExitKind = "hold" | "rejected" | "withdrawn";

type StatusDef = {
  label: string;
  tone: StatusTone;
  exit?: ExitKind;
  needs?: StatusNeed[];
};

export const STATUSES = {
  yet_to_contact: { label: "Yet to contact", tone: "neutral" },
  interested: { label: "Interested", tone: "info" },
  not_interested: { label: "Not interested", tone: "danger", exit: "withdrawn", needs: ["reason_withdraw"] },
  yet_to_screen: { label: "Yet to screen", tone: "neutral" },
  yet_to_share: { label: "Yet to share", tone: "neutral" },
  shared_with_hm: { label: "Shared with HM", tone: "info" },
  yet_to_schedule: { label: "Yet to schedule", tone: "neutral" },
  scheduled: { label: "Scheduled", tone: "info", needs: ["schedule"] },
  no_show: { label: "No-show", tone: "warning" },
  yet_to_assign: { label: "Yet to assign", tone: "neutral" },
  assigned: { label: "Assigned", tone: "info" },
  complete: { label: "Complete (feedback)", tone: "progress", needs: ["feedback"] },
  documents_called: { label: "Documents called", tone: "info" },
  proposal_shared: { label: "Proposal shared", tone: "info", needs: ["ctc"] },
  approval_pending: { label: "Approval pending", tone: "warning" },
  offered: { label: "Offered", tone: "progress", needs: ["ctc"] },
  offer_accepted: { label: "Offer accepted", tone: "success", needs: ["doj"] },
  offer_declined: { label: "Offer declined", tone: "danger", exit: "withdrawn", needs: ["reason_withdraw"] },
  yet_to_join: { label: "Yet to join", tone: "progress" },
  joined: { label: "Joined", tone: "success" },
  dropped: { label: "Dropped / No-show", tone: "danger", exit: "withdrawn", needs: ["reason_withdraw"] },
  shortlist: { label: "Shortlist", tone: "success" },
  reject: { label: "Reject", tone: "danger", exit: "rejected", needs: ["reason_reject"] },
  withdrawn: { label: "Candidate withdrew", tone: "danger", exit: "withdrawn", needs: ["reason_withdraw"] },
  hold: { label: "Hold", tone: "warning", exit: "hold", needs: ["reason_hold"] },
} as const satisfies Record<string, StatusDef>;

export type StatusKey = keyof typeof STATUSES;

export function isStatusKey(v: unknown): v is StatusKey {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(STATUSES, v);
}

export function statusDef(key: string | null | undefined): StatusDef {
  return (isStatusKey(key) ? STATUSES[key] : STATUSES.yet_to_contact) as StatusDef;
}

export function statusLabel(key: string | null | undefined): string {
  return statusDef(key).label;
}

// Statuses offered per stage, in dropdown order. The first entry is the
// stage's default status (what a candidate lands on when moved into it).
const INTERVIEW: StatusKey[] = ["yet_to_schedule", "scheduled", "no_show", "complete", "shortlist", "reject", "hold", "withdrawn"];

export const STAGE_STATUSES: Record<StageKey, StatusKey[]> = {
  sourcing: ["yet_to_contact", "interested", "not_interested", "shortlist", "reject", "hold"],
  screening: ["yet_to_screen", "shortlist", "reject", "hold", "withdrawn"],
  hm_review: ["yet_to_share", "shared_with_hm", "shortlist", "reject", "hold", "withdrawn"],
  l1: INTERVIEW,
  l2: INTERVIEW,
  l3: INTERVIEW,
  assessment: ["yet_to_assign", "assigned", "complete", "shortlist", "reject", "hold", "withdrawn"],
  hr_interview: INTERVIEW,
  offer: ["documents_called", "proposal_shared", "approval_pending", "offered", "offer_accepted", "offer_declined", "reject", "hold", "withdrawn"],
  joining: ["yet_to_join", "joined", "dropped", "hold"],
};

export function defaultStatusFor(stage: StageKey): StatusKey {
  return STAGE_STATUSES[stage][0];
}

export function isStatusAllowed(stage: StageKey, status: StatusKey): boolean {
  return STAGE_STATUSES[stage].includes(status);
}

// Statuses that move a candidate forward automatically: the candidate is
// recorded at (stage, status) and then placed in the next enabled stage at
// that stage's default status.
export const ADVANCING_STATUSES: StatusKey[] = ["shortlist", "offer_accepted"];

export function exitKind(status: string | null | undefined): ExitKind | null {
  return statusDef(status).exit ?? null;
}

// ---------------------------------------------------------------------------
// Reasons
// ---------------------------------------------------------------------------

export const REJECT_REASONS = [
  "Skills gap",
  "Experience mismatch",
  "CTC mismatch",
  "Notice period too long",
  "Location mismatch",
  "Culture fit",
  "HM rejected",
  "Failed interview",
  "Failed assessment",
  "Position filled / closed",
  "Duplicate profile",
  "Other",
] as const;

export const WITHDRAW_REASONS = [
  "Not interested in the role",
  "Accepted another offer",
  "Counter-offer from current employer",
  "CTC expectations not met",
  "Location / relocation",
  "Role or level mismatch",
  "Personal reasons",
  "Not reachable",
  "Other",
] as const;

export const HOLD_REASONS = [
  "Position on hold",
  "Awaiting HM feedback",
  "Better-fit candidates in process",
  "Candidate requested time",
  "Budget approval pending",
  "Keep for future role",
  "Other",
] as const;

export const BGV_STATUSES = [
  { key: "initiated", label: "BGV initiated" },
  { key: "cleared", label: "BGV cleared" },
  { key: "discrepancy", label: "BGV discrepancy" },
] as const;
export type BgvKey = (typeof BGV_STATUSES)[number]["key"];
export function isBgvKey(v: unknown): v is BgvKey {
  return typeof v === "string" && BGV_STATUSES.some((b) => b.key === v);
}

// ---------------------------------------------------------------------------
// Stage templates (per project)
// ---------------------------------------------------------------------------

export function enabledStages(template: string[] | null | undefined): StageKey[] {
  if (!template) return [...STAGE_KEYS];
  const set = new Set(template);
  // Mandatory stages are always on, whatever the stored template says.
  return STAGES.filter((s) => !s.optional || set.has(s.key)).map((s) => s.key);
}

export function nextEnabledStage(stage: StageKey, template: string[] | null | undefined): StageKey | null {
  const enabled = enabledStages(template);
  const idx = STAGE_KEYS.indexOf(stage);
  for (let i = idx + 1; i < STAGE_KEYS.length; i++) {
    if (enabled.includes(STAGE_KEYS[i])) return STAGE_KEYS[i];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

export type PipelinePosition = { stage: StageKey; status: StatusKey };
export type TransitionStep = PipelinePosition & { auto: boolean };

// Resolve a requested (stage, status) into the steps to record. A plain
// change is one step; an advancing status adds an automatic second step
// into the next enabled stage.
export function resolveTransition(
  requested: PipelinePosition,
  template: string[] | null | undefined
): TransitionStep[] {
  const steps: TransitionStep[] = [{ ...requested, auto: false }];
  if (ADVANCING_STATUSES.includes(requested.status)) {
    const next = nextEnabledStage(requested.stage, template);
    if (next) steps.push({ stage: next, status: defaultStatusFor(next), auto: true });
  }
  return steps;
}

// ---------------------------------------------------------------------------
// Details captured on specific statuses
// ---------------------------------------------------------------------------

export type InterviewDetails = {
  scheduled_at?: string | null;
  mode?: string | null;
  panel?: string | null;
  rating?: number | null;
  feedback?: string | null;
};

export type PipelineDetails = {
  interviews?: Partial<Record<StageKey, InterviewDetails>>;
  offered_ctc?: string | null;
  doj?: string | null;
};

export const INTERVIEW_MODES = ["Video", "Phone", "In-person"] as const;

// ---------------------------------------------------------------------------
// Aging
// ---------------------------------------------------------------------------

export type AgingLevel = "ok" | "amber" | "red";

const AGING_THRESHOLDS: Partial<Record<StageKey, [number, number]>> = {
  sourcing: [5, 10],
  screening: [3, 7],
  hm_review: [3, 7],
  l1: [5, 10],
  l2: [5, 10],
  l3: [5, 10],
  assessment: [5, 10],
  hr_interview: [4, 8],
  offer: [5, 10],
};

export function daysSince(iso: string | null | undefined, now: number = Date.now()): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
}

// Joining and exit/terminal statuses don't age (joining is paced by the
// date of joining; holds are paced by their review date instead).
export function agingLevel(stage: StageKey, status: StatusKey, days: number): AgingLevel {
  if (exitKind(status) || status === "joined") return "ok";
  const t = AGING_THRESHOLDS[stage];
  if (!t) return "ok";
  if (days >= t[1]) return "red";
  if (days >= t[0]) return "amber";
  return "ok";
}

export function isHoldDue(status: string | null | undefined, holdUntil: string | null | undefined, now: Date = new Date()): boolean {
  if (status !== "hold" || !holdUntil) return false;
  const today = now.toISOString().slice(0, 10);
  return holdUntil <= today;
}

// ---------------------------------------------------------------------------
// Candidate notification templates (manual send via WhatsApp / email)
// ---------------------------------------------------------------------------

export function notifyTemplate(opts: {
  name: string | null | undefined;
  role: string | null | undefined;
  stage: StageKey;
  status: StatusKey;
  details?: PipelineDetails | null;
}): string | null {
  const first = (opts.name || "").trim().split(/\s+/)[0] || "there";
  const role = opts.role ? ` for the ${opts.role} role` : "";
  const stage = stageLabel(opts.stage);
  const iv = opts.details?.interviews?.[opts.stage];
  const when = iv?.scheduled_at
    ? new Date(iv.scheduled_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : null;
  switch (opts.status) {
    case "yet_to_schedule":
      return `Hi ${first}, good news: you've been shortlisted for the ${stage}${role}. We'll share the interview slot shortly.`;
    case "scheduled":
      return `Hi ${first}, your ${stage}${role} is scheduled${when ? ` for ${when}` : ""}${iv?.mode ? ` (${iv.mode})` : ""}. Please confirm your availability.`;
    case "yet_to_assign":
    case "assigned":
      return `Hi ${first}, as the next step${role}, we'll be sharing an assessment with you. Please keep an eye on your email.`;
    case "documents_called":
      return `Hi ${first}, congratulations on clearing the interviews${role}. Please share your documents (latest payslips, relieving letters, ID proof) so we can move to the offer stage.`;
    case "offered":
      return `Hi ${first}, we're delighted to extend an offer${role}. Please check your email for the offer letter and let us know if you have any questions.`;
    case "yet_to_join":
      return `Hi ${first}, welcome aboard! We're looking forward to you joining${opts.details?.doj ? ` on ${opts.details.doj}` : ""}. We'll share onboarding details soon.`;
    case "reject":
      return `Hi ${first}, thank you for your time and interest${role}. After careful consideration we won't be moving forward at this stage. We'll keep your profile for future openings.`;
    case "hold":
      return `Hi ${first}, a quick update${role}: the process is briefly on hold on our side. We'll get back to you as soon as we have an update.`;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Legacy flat statuses (pre-2026-09-28) -> (stage, status)
// ---------------------------------------------------------------------------

export const LEGACY_STATUS_MAP: Record<string, PipelinePosition> = {
  "CV Sourced": { stage: "sourcing", status: "yet_to_contact" },
  "CV Screened": { stage: "hm_review", status: "yet_to_share" },
  "CV Shared": { stage: "hm_review", status: "shared_with_hm" },
  "L1 Interview Shortlist": { stage: "l1", status: "yet_to_schedule" },
  "L2 Interview Shortlist": { stage: "l2", status: "yet_to_schedule" },
  "HR Interview Shortlist": { stage: "hr_interview", status: "yet_to_schedule" },
  Offered: { stage: "offer", status: "offered" },
  "To Join": { stage: "joining", status: "yet_to_join" },
  Joined: { stage: "joining", status: "joined" },
  Hold: { stage: "screening", status: "hold" },
  Rejected: { stage: "screening", status: "reject" },
  "Offer Drop": { stage: "offer", status: "offer_declined" },
  Backout: { stage: "joining", status: "dropped" },
};
