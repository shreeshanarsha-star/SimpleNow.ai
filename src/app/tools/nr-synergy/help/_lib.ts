import type { Tone } from "../_home/ui";

// Ticket model shared by Help (employees) and the Support desk (agents). Client-safe.

export const TICKET_CATEGORIES = ["it", "hr", "payroll", "admin"] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const TICKET_STATUSES = ["open", "in_progress", "waiting", "resolved", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
/** Statuses that still need an agent. */
export const ACTIVE_STATUSES: readonly TicketStatus[] = ["open", "in_progress", "waiting"];

export const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export function isTicketCategory(v: unknown): v is TicketCategory {
  return typeof v === "string" && (TICKET_CATEGORIES as readonly string[]).includes(v);
}
export function isTicketStatus(v: unknown): v is TicketStatus {
  return typeof v === "string" && (TICKET_STATUSES as readonly string[]).includes(v);
}
export function isTicketPriority(v: unknown): v is TicketPriority {
  return typeof v === "string" && (TICKET_PRIORITIES as readonly string[]).includes(v);
}

export const TICKET_TONE: Record<TicketStatus, Tone> = {
  open: "warning",
  in_progress: "brand",
  waiting: "neutral",
  resolved: "good",
  closed: "neutral",
};

export const PRIORITY_TONE: Record<TicketPriority, Tone> = {
  low: "neutral",
  normal: "neutral",
  high: "warning",
  urgent: "critical",
};

/** Target time to resolve, in hours, by priority (drives the SLA age badge). */
export const SLA_HOURS: Record<TicketPriority, number> = { low: 120, normal: 72, high: 24, urgent: 4 };

/** "45m", "5h", "3d". */
export function fmtAge(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60000));
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** Age of an unresolved ticket against its SLA target. */
export function slaState(createdAt: string, priority: TicketPriority, now: number = Date.now()): { age: string; tone: Tone; overdue: boolean } {
  const ms = now - new Date(createdAt).getTime();
  const ratio = ms / (SLA_HOURS[priority] * 3600_000);
  return { age: fmtAge(ms), tone: ratio >= 1 ? "critical" : ratio >= 0.5 ? "warning" : "good", overdue: ratio >= 1 };
}

export interface TicketRow {
  id: string;
  member_id: string;
  category: TicketCategory;
  title: string;
  description: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  assignee_member_id: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export const TICKET_COLUMNS =
  "id, member_id, category, title, description, status, priority, assignee_member_id, created_at, updated_at, resolved_at";
