import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/nrs/audit";
import { guard, isUuid, jsonError } from "@/app/tools/nr-synergy/_home/server";
import { loadTicket, notifyTicketHandlers } from "@/app/tools/nr-synergy/desk/support/_server";

// POST: the requester re-opens their own resolved ticket.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard("help");
  if (!g.ok) return g.res;
  const { member, ctx } = g;
  const { id } = await params;
  if (!isUuid(id)) return jsonError("Ticket not found", 404);

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return jsonError("Something went wrong", 500);
  }
  const ticket = await loadTicket(admin, member.org_id, id).catch(() => null);
  if (!ticket || ticket.member_id !== member.id) return jsonError("Ticket not found", 404);
  if (ticket.status !== "resolved") return jsonError("Only a resolved ticket can be re-opened", 409);

  const { error } = await admin
    .from("nrs_tickets")
    .update({ status: "open", resolved_at: null, updated_at: new Date().toISOString() })
    .eq("id", ticket.id)
    .eq("org_id", member.org_id)
    .eq("status", "resolved");
  if (error) return jsonError(error.message, 500);

  await Promise.all([
    logAudit(admin, {
      orgId: member.org_id,
      actorUser: ctx.user.id,
      entity: "nrs_tickets",
      entityId: ticket.id,
      action: "reopen",
      before: { status: "resolved" },
      after: { status: "open" },
    }),
    notifyTicketHandlers(admin, ticket, { title: `Ticket re-opened: ${ticket.title}`, body: `${member.full_name} re-opened this ticket.` }),
  ]);
  return NextResponse.json({ ok: true });
}
