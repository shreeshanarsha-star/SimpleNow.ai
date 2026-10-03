import { NextResponse } from "next/server";
import { guard, isUuid, jsonError, optText, readBody } from "@/app/tools/nr-synergy/_home/server";

// POST { body }: reply on a ticket the caller raised, is assigned to, or
// (HR) can see. User client: nrs_ticket_messages' insert policy enforces it.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard("help");
  if (!g.ok) return g.res;
  const { member, supabase } = g;
  const { id } = await params;
  if (!isUuid(id)) return jsonError("Ticket not found", 404);

  const payload = await readBody(req);
  const text = optText(payload?.body, 4000);
  if (!text) return jsonError(text === undefined ? "Reply is too long (4000 characters max)" : "Write a reply first");

  const { data: tData, error: tErr } = await supabase
    .from("nrs_tickets")
    .select("id, org_id, status")
    .eq("id", id)
    .eq("org_id", member.org_id)
    .maybeSingle();
  if (tErr) return jsonError(tErr.message, 500);
  const ticket = tData as { id: string; org_id: string; status: string } | null;
  if (!ticket) return jsonError("Ticket not found", 404);
  if (ticket.status === "closed") return jsonError("This ticket is closed", 409);

  const { error } = await supabase
    .from("nrs_ticket_messages")
    .insert({ ticket_id: ticket.id, org_id: ticket.org_id, member_id: member.id, body: text });
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true });
}
