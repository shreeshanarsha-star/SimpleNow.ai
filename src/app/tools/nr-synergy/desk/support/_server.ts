import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError, guard, type Guarded } from "@/lib/nrs/invoice/kit";
import type { NrsContext, NrsMember } from "@/lib/nrs/member";
import { notifyMembers, notifyRoles, type NrsNotice } from "@/lib/nrs/notify";
import { NRS_BASE } from "@/lib/nrs/tabs";
import { TICKET_CATEGORIES, TICKET_COLUMNS, type TicketCategory, type TicketRow } from "../../help/_lib";

// Server-only helpers for the Support desk and the Help ticket routes:
// who is a ticket agent for which categories, who can be assigned, and
// who gets told about what. Mirrors nrs_is_ticket_agent(cat) in SQL:
//   HR admin / super admin / platform admin -> every category
//   it_agent -> it;  hr_agent -> hr, payroll, admin
// NrsContext.roles only carries the original five roles, so the agent roles
// are read straight from nrs_member_roles.

export const AGENT_ROLE: Record<TicketCategory, "it_agent" | "hr_agent"> = {
  it: "it_agent",
  hr: "hr_agent",
  payroll: "hr_agent",
  admin: "hr_agent",
};

export const agentTicketLink = (id: string) => `${NRS_BASE}/desk/support?ticket=${id}`;
export const requesterTicketLink = (id: string) => `${NRS_BASE}/help/${id}`;

/** Categories this member may work as an agent (empty = not an agent). */
export async function agentCategories(
  client: SupabaseClient,
  ctx: Pick<NrsContext, "isHr">,
  member: Pick<NrsMember, "id"> | null
): Promise<TicketCategory[]> {
  if (ctx.isHr) return [...TICKET_CATEGORIES];
  if (!member) return [];
  const { data, error } = await client.from("nrs_member_roles").select("role").eq("member_id", member.id);
  if (error) throw new Error(error.message);
  const roles = new Set(((data ?? []) as { role: string }[]).map((r) => r.role));
  return TICKET_CATEGORIES.filter((c) => roles.has(AGENT_ROLE[c]));
}

export interface AgentGuarded extends Guarded {
  member: NrsMember;
  categories: TicketCategory[];
}

/** API guard: signed in, has a member row, and is an agent for at least one category. Throws. */
export async function requireAgent(): Promise<AgentGuarded> {
  const g = await guard();
  if (!g.ctx.member) throw new HttpError("You need an NR Synergy member profile to work tickets.", 403);
  if (g.ctx.member.org_id !== g.orgId) throw new HttpError("Your profile belongs to another organisation.", 403);
  const categories = await agentCategories(g.admin, g.ctx, g.ctx.member);
  if (!categories.length) throw new HttpError("Only support agents can do this.", 403);
  return { ...g, member: g.ctx.member, categories };
}

export interface AgentLite {
  id: string;
  full_name: string;
}

/** Active members who may be assigned a ticket of this category. */
export async function eligibleAgents(admin: SupabaseClient, orgId: string, category: TicketCategory): Promise<AgentLite[]> {
  const { data, error } = await admin
    .from("nrs_member_roles")
    .select("member_id, nrs_members!inner(id, full_name, org_id, status, deleted_at)")
    .in("role", ["hr_admin", "super_admin", AGENT_ROLE[category]])
    .eq("nrs_members.org_id", orgId)
    .eq("nrs_members.status", "active")
    .is("nrs_members.deleted_at", null);
  if (error) throw new HttpError(`Agents: ${error.message}`, 500);
  const out = new Map<string, AgentLite>();
  for (const r of (data ?? []) as unknown as { nrs_members: AgentLite | AgentLite[] }[]) {
    const m = Array.isArray(r.nrs_members) ? r.nrs_members[0] : r.nrs_members;
    if (m) out.set(m.id, { id: m.id, full_name: m.full_name });
  }
  return Array.from(out.values()).sort((a, b) => a.full_name.localeCompare(b.full_name));
}

/** Tell the agents for a category (HR admins always included). */
export function notifyTicketAgents(admin: SupabaseClient, orgId: string, category: TicketCategory, n: NrsNotice): Promise<void> {
  return notifyRoles(admin, orgId, ["hr_admin", AGENT_ROLE[category]], n);
}

/** Requester replied / re-opened: tell the assignee, or the category's agents when unassigned. */
export async function notifyTicketHandlers(admin: SupabaseClient, ticket: TicketRow & { org_id: string }, n: Omit<NrsNotice, "link">): Promise<void> {
  const notice = { ...n, link: agentTicketLink(ticket.id) };
  if (ticket.assignee_member_id && ticket.assignee_member_id !== ticket.member_id) {
    await notifyMembers(admin, ticket.org_id, [ticket.assignee_member_id], notice);
  } else {
    await notifyTicketAgents(admin, ticket.org_id, ticket.category, notice);
  }
}

/** One ticket in the org (service role), or null. */
export async function loadTicket(admin: SupabaseClient, orgId: string, id: string): Promise<(TicketRow & { org_id: string }) | null> {
  const { data, error } = await admin.from("nrs_tickets").select(`${TICKET_COLUMNS}, org_id`).eq("id", id).eq("org_id", orgId).maybeSingle();
  if (error) throw new HttpError(`Ticket: ${error.message}`, 500);
  return (data as (TicketRow & { org_id: string }) | null) ?? null;
}

/** id -> full_name, org-scoped (service role). */
export async function namesIn(admin: SupabaseClient, orgId: string, ids: (string | null | undefined)[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(ids.filter((v): v is string => !!v)));
  if (!unique.length) return {};
  const { data, error } = await admin.from("nrs_members").select("id, full_name").eq("org_id", orgId).in("id", unique);
  if (error) throw new HttpError(`Members: ${error.message}`, 500);
  const out: Record<string, string> = {};
  for (const r of (data ?? []) as { id: string; full_name: string }[]) out[r.id] = r.full_name;
  return out;
}
