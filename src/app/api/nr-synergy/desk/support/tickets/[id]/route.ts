import { logAudit } from "@/lib/nrs/audit";
import { HttpError, dbCheck, ok, readJson, run, uuid } from "@/lib/nrs/invoice/kit";
import { notifyMembers } from "@/lib/nrs/notify";
import {
  agentTicketLink,
  eligibleAgents,
  loadTicket,
  namesIn,
  requesterTicketLink,
  requireAgent,
  type AgentGuarded,
} from "@/app/tools/nr-synergy/desk/support/_server";
import type { DeskMessage, DeskTicketDetail } from "@/app/tools/nr-synergy/desk/support/_types";
import { ACTIVE_STATUSES, isTicketPriority, isTicketStatus, type TicketPriority, type TicketStatus } from "@/app/tools/nr-synergy/help/_lib";
import { desk } from "@/lib/nrs/i18n/en/desk";

export const dynamic = "force-dynamic";

async function ticketInQueue(g: AgentGuarded, rawId: string) {
  const id = uuid(rawId, "Ticket");
  const ticket = await loadTicket(g.admin, g.orgId, id);
  if (!ticket || !g.categories.includes(ticket.category)) throw new HttpError("Ticket not found", 404);
  return ticket;
}

// GET: the ticket, its full thread (internal notes included) and the agents it can be assigned to.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return run(async () => {
    const g = await requireAgent();
    const ticket = await ticketInQueue(g, (await params).id);
    const [{ data, error }, agents] = await Promise.all([
      g.admin
        .from("nrs_ticket_messages")
        .select("id, member_id, body, internal, created_at")
        .eq("ticket_id", ticket.id)
        .eq("org_id", g.orgId)
        .order("created_at", { ascending: true })
        .limit(500),
      eligibleAgents(g.admin, g.orgId, ticket.category),
    ]);
    dbCheck(error, "Messages");
    const rows = (data ?? []) as Omit<DeskMessage, "author_name">[];
    const names = await namesIn(g.admin, g.orgId, [ticket.member_id, ticket.assignee_member_id, ...rows.map((m) => m.member_id)]);
    const { org_id: _org, ...t } = ticket;
    void _org;
    return ok<DeskTicketDetail>({
      me: g.member.id,
      ticket: {
        ...t,
        requester_name: names[t.member_id] ?? "",
        assignee_name: t.assignee_member_id ? names[t.assignee_member_id] ?? null : null,
      },
      messages: rows.map((m) => ({ ...m, author_name: names[m.member_id] ?? "" })),
      agents,
    });
  });
}

// PATCH { status?, priority?, assignee?: memberId | "me" | null }
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return run(async () => {
    const g = await requireAgent();
    const ticket = await ticketInQueue(g, (await params).id);
    const b = await readJson(req);

    const patch: {
      status?: TicketStatus;
      priority?: TicketPriority;
      assignee_member_id?: string | null;
      resolved_at?: string | null;
      updated_at?: string;
    } = {};

    if ("status" in b) {
      if (!isTicketStatus(b.status)) throw new HttpError("Unknown status");
      if (b.status !== ticket.status) {
        patch.status = b.status;
        const nowDone = b.status === "resolved" || b.status === "closed";
        if (nowDone && !ticket.resolved_at) patch.resolved_at = new Date().toISOString();
        if ((ACTIVE_STATUSES as readonly string[]).includes(b.status)) patch.resolved_at = null;
      }
    }
    if ("priority" in b) {
      if (!isTicketPriority(b.priority)) throw new HttpError("Unknown priority");
      if (b.priority !== ticket.priority) patch.priority = b.priority;
    }
    if ("assignee" in b) {
      let next: string | null;
      if (b.assignee === null || b.assignee === "") next = null;
      else if (b.assignee === "me") next = g.member.id;
      else next = uuid(b.assignee, "Assignee");
      if (next) {
        const agents = await eligibleAgents(g.admin, g.orgId, ticket.category);
        if (!agents.some((a) => a.id === next)) throw new HttpError("That person can't handle this category of ticket", 400);
      }
      if (next !== ticket.assignee_member_id) patch.assignee_member_id = next;
    }
    if (!Object.keys(patch).length) return ok({ ok: true, changed: false });

    patch.updated_at = new Date().toISOString();
    const { error } = await g.admin.from("nrs_tickets").update(patch).eq("id", ticket.id).eq("org_id", g.orgId);
    dbCheck(error, "Updating ticket");

    await logAudit(g.admin, {
      orgId: g.orgId,
      actorUser: g.user.id,
      entity: "nrs_tickets",
      entityId: ticket.id,
      action: "desk_update",
      before: { status: ticket.status, priority: ticket.priority, assignee_member_id: ticket.assignee_member_id },
      after: patch,
    });

    const tasks: Promise<void>[] = [];
    if (patch.assignee_member_id && patch.assignee_member_id !== g.member.id) {
      tasks.push(
        notifyMembers(g.admin, g.orgId, [patch.assignee_member_id], {
          title: `Ticket assigned to you: ${ticket.title}`,
          body: `${desk.categories[ticket.category]} · ${desk.priority[patch.priority ?? ticket.priority]} priority`,
          link: agentTicketLink(ticket.id),
        })
      );
    }
    if (patch.status === "resolved" && ticket.member_id !== g.member.id) {
      tasks.push(
        notifyMembers(g.admin, g.orgId, [ticket.member_id], {
          title: `Your ticket was resolved: ${ticket.title}`,
          body: "If it isn't fixed, open the ticket and re-open it.",
          link: requesterTicketLink(ticket.id),
        })
      );
    }
    await Promise.all(tasks);
    return ok({ ok: true, changed: true });
  });
}
