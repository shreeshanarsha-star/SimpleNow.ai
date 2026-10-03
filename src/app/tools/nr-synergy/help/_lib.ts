import type { Tone } from "../_home/ui";

export const TICKET_CATEGORIES = ["it", "hr", "payroll", "admin"] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";

export function isTicketCategory(v: unknown): v is TicketCategory {
  return typeof v === "string" && (TICKET_CATEGORIES as readonly string[]).includes(v);
}

export const TICKET_TONE: Record<TicketStatus, Tone> = {
  open: "warning",
  in_progress: "brand",
  resolved: "good",
  closed: "neutral",
};

export interface TicketRow {
  id: string;
  member_id: string;
  category: TicketCategory;
  title: string;
  description: string | null;
  status: TicketStatus;
  assignee_member_id: string | null;
  created_at: string;
  resolved_at: string | null;
}

export const TICKET_COLUMNS = "id, member_id, category, title, description, status, assignee_member_id, created_at, resolved_at";
