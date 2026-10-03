import { logAudit } from "@/lib/nrs/audit";
import { HttpError, dbCheck, ok, readJson, run, uuid } from "@/lib/nrs/invoice/kit";
import { notifyMembers } from "@/lib/nrs/notify";
import { loadTicket, requesterTicketLink, requireAgent } from "@/app/tools/nr-synergy/desk/support/_server";

export const dynamic = "force-dynamic";

// POST { body, internal? }: an agent's public reply (requester sees it) or internal note (agents only).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return run(async () => {
    const g = await requireAgent();
    const id = uuid((await params).id, "Ticket");
    const ticket = await loadTicket(g.admin, g.orgId, id);
    if (!ticket || !g.categories.includes(ticket.category)) throw new HttpError("Ticket not found", 404);

    const b = await readJson(req);
    const text = typeof b.body === "string" ? b.body.trim() : "";
    if (!text) throw new HttpError("Write a message first");
    if (text.length > 4000) throw new HttpError("Message is too long (4000 characters max)");
    const internal = b.internal === true;
    if (ticket.status === "closed" && !internal) throw new HttpError("This ticket is closed", 409);

    const { data, error } = await g.admin
      .from("nrs_ticket_messages")
      .insert({ ticket_id: ticket.id, org_id: g.orgId, member_id: g.member.id, body: text, internal })
      .select("id")
      .single();
    dbCheck(error, "Saving message");

    // A first public reply picks the ticket up.
    const update: { updated_at: string; status?: string } = { updated_at: new Date().toISOString() };
    if (!internal && ticket.status === "open") update.status = "in_progress";
    const { error: uErr } = await g.admin.from("nrs_tickets").update(update).eq("id", ticket.id).eq("org_id", g.orgId);
    dbCheck(uErr, "Updating ticket");

    await logAudit(g.admin, {
      orgId: g.orgId,
      actorUser: g.user.id,
      entity: "nrs_ticket_messages",
      entityId: (data as { id: string }).id,
      action: internal ? "internal_note" : "agent_reply",
      context: { ticket_id: ticket.id, status_change: update.status ?? null },
    });

    if (!internal && ticket.member_id !== g.member.id) {
      await notifyMembers(g.admin, g.orgId, [ticket.member_id], {
        title: `New reply on your ticket: ${ticket.title}`,
        body: text.length > 280 ? `${text.slice(0, 277)}…` : text,
        link: requesterTicketLink(ticket.id),
      });
    }
    return ok({ ok: true }, 201);
  });
}
