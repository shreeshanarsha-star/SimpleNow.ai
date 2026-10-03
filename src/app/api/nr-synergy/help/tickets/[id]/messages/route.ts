import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyMembers } from "@/lib/nrs/notify";
import { guard, isUuid, jsonError, optText, readBody } from "@/app/tools/nr-synergy/_home/server";
import { loadTicket, notifyTicketHandlers, requesterTicketLink } from "@/app/tools/nr-synergy/desk/support/_server";

// POST { body }: a public reply on a ticket the caller raised, is assigned to,
// or (agent / HR) can see. User client: nrs_ticket_messages' insert policy
// enforces who may write. Replies from Help are never internal.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard("help");
  if (!g.ok) return g.res;
  const { member, supabase } = g;
  const { id } = await params;
  if (!isUuid(id)) return jsonError("Ticket not found", 404);

  const payload = await readBody(req);
  const text = optText(payload?.body, 4000);
  if (!text) return jsonError(text === undefined ? "Reply is too long (4000 characters max)" : "Write a reply first");

  // Visibility check through RLS first: if the caller can't read it, it doesn't exist for them.
  const { data: tData, error: tErr } = await supabase
    .from("nrs_tickets")
    .select("id, org_id, status")
    .eq("id", id)
    .eq("org_id", member.org_id)
    .maybeSingle();
  if (tErr) return jsonError(tErr.message, 500);
  const visible = tData as { id: string; org_id: string; status: string } | null;
  if (!visible) return jsonError("Ticket not found", 404);
  if (visible.status === "closed") return jsonError("This ticket is closed", 409);

  const { error } = await supabase
    .from("nrs_ticket_messages")
    .insert({ ticket_id: visible.id, org_id: visible.org_id, member_id: member.id, body: text, internal: false });
  if (error) return jsonError(error.message, 500);

  try {
    const admin = createAdminClient();
    const ticket = await loadTicket(admin, member.org_id, visible.id);
    if (ticket) {
      const isRequester = ticket.member_id === member.id;
      // Requester answered a "waiting on you" ticket: it's back with the agent.
      const update: { updated_at: string; status?: string } = { updated_at: new Date().toISOString() };
      if (isRequester && ticket.status === "waiting") update.status = "in_progress";
      await admin.from("nrs_tickets").update(update).eq("id", ticket.id).eq("org_id", member.org_id);

      const preview = text.length > 280 ? `${text.slice(0, 277)}…` : text;
      if (isRequester) {
        await notifyTicketHandlers(admin, ticket, { title: `${member.full_name} replied: ${ticket.title}`, body: preview });
      } else {
        await notifyMembers(admin, member.org_id, [ticket.member_id], {
          title: `New reply on your ticket: ${ticket.title}`,
          body: preview,
          link: requesterTicketLink(ticket.id),
        });
      }
    }
  } catch (e) {
    console.error("[nrs] ticket reply follow-up failed", e);
  }
  return NextResponse.json({ ok: true });
}
