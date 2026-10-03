import type { TicketCategory, TicketRow } from "../../help/_lib";

// DTOs for /api/nr-synergy/desk/support (client-safe).

export interface DeskTicket extends TicketRow {
  requester_name: string;
  assignee_name: string | null;
}

export interface DeskQueue {
  me: string;
  categories: TicketCategory[];
  tickets: DeskTicket[];
  truncated: boolean;
}

export interface DeskMessage {
  id: string;
  member_id: string;
  author_name: string;
  body: string;
  internal: boolean;
  created_at: string;
}

export interface DeskTicketDetail {
  me: string;
  ticket: DeskTicket;
  messages: DeskMessage[];
  agents: { id: string; full_name: string }[];
}

export const ASSIGNED_FILTERS = ["all", "me", "unassigned"] as const;
export type AssignedFilter = (typeof ASSIGNED_FILTERS)[number];
