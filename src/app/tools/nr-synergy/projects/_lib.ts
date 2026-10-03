import type { Tone } from "../_home/ui";
import { addDays, isoWeekday, localDateInTz, type IsoDate } from "@/lib/nrs/dates";
import { formatMoney } from "@/lib/nrs/money";

// Client-safe Projects constants, row types and pure helpers.

export const PROJECT_STATUSES = ["in_progress", "completed", "on_hold", "pending"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const APPROVAL_STATUSES = ["pending", "approved", "rejected", "sent_back"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export function isProjectStatus(v: unknown): v is ProjectStatus {
  return typeof v === "string" && (PROJECT_STATUSES as readonly string[]).includes(v);
}

export const STATUS_TONE: Record<ProjectStatus, Tone> = {
  in_progress: "good",
  on_hold: "warning",
  pending: "neutral",
  completed: "brand",
};

export const APPROVAL_TONE: Record<ApprovalStatus, Tone> = {
  pending: "warning",
  approved: "good",
  rejected: "critical",
  sent_back: "warning",
};

export interface ProjectRow {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  division: string | null;
  owner_member_id: string;
  created_by_member: string | null;
  status: ProjectStatus;
  value_minor: number | null;
  value_currency: string | null;
  next_steps: string | null;
  approval_status: ApprovalStatus;
  approved_at: string | null;
  tags: string[];
  country_code: string | null;
  created_at: string;
  archived_at: string | null;
}

export interface ProjectUpdateRow {
  id: string;
  project_id: string;
  member_id: string;
  status: ProjectStatus;
  progress: string;
  challenges: string | null;
  plan_of_action: string | null;
  help_needed_member_id: string | null;
  next_steps: string | null;
  created_at: string;
}

export const PROJECT_COLUMNS =
  "id, org_id, name, description, division, owner_member_id, created_by_member, status, value_minor, value_currency, next_steps, approval_status, approved_at, tags, country_code, created_at, archived_at";
export const UPDATE_COLUMNS =
  "id, project_id, member_id, status, progress, challenges, plan_of_action, help_needed_member_id, next_steps, created_at";

/** supabase-js may hand bigint back as a string; normalise. */
export function normaliseProject(r: ProjectRow): ProjectRow {
  return {
    ...r,
    value_minor: r.value_minor == null ? null : Number(r.value_minor),
    tags: Array.isArray(r.tags) ? r.tags : [],
  };
}

export function formatValue(minor: number | null, currency: string | null): string | null {
  if (minor == null || !currency || !Number.isSafeInteger(minor)) return null;
  try {
    return formatMoney(minor, currency);
  } catch {
    return `${minor} ${currency}`;
  }
}

/** Monday ("yyyy-mm-dd") of the current week in tz. */
export function weekStartInTz(tz: string, now: Date = new Date()): IsoDate {
  const today = localDateInTz(tz, now);
  return addDays(today, -(isoWeekday(today) - 1));
}

/**
 * "Update overdue": it is Friday or later in the owner's timezone and the
 * project has had no update since Monday 00:00 there. Completed projects and
 * projects approved this week are never overdue.
 */
export function isUpdateOverdue(
  p: Pick<ProjectRow, "status" | "approval_status" | "archived_at" | "approved_at">,
  lastUpdateAt: string | null,
  ownerTz: string,
  now: Date = new Date()
): boolean {
  if (p.approval_status !== "approved" || p.archived_at || p.status === "completed") return false;
  const today = localDateInTz(ownerTz, now);
  if (isoWeekday(today) < 5) return false;
  const monday = weekStartInTz(ownerTz, now);
  const since = (iso: string | null) => !!iso && localDateInTz(ownerTz, new Date(iso)) >= monday;
  if (since(p.approved_at)) return false;
  return !since(lastUpdateAt);
}

/** Split "a, b ,c" into unique, trimmed, lower-case tags (max 12, 40 chars each). */
export function parseTags(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const t = part.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 40);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= 12) break;
  }
  return out;
}
