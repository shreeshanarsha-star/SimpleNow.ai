import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/nrs/audit";
import { desk } from "@/lib/nrs/i18n/en/desk";
import { guard, jsonError, optText, readBody } from "@/app/tools/nr-synergy/_home/server";
import { isTicketCategory, isTicketPriority, type TicketPriority } from "@/app/tools/nr-synergy/help/_lib";
import { agentTicketLink, notifyTicketAgents } from "@/app/tools/nr-synergy/desk/support/_server";

// POST { category, title, description?, priority? }: open a ticket for the caller.
// User client: nrs_tickets allows own insert when the help feature is on.
// Then the category's agents (and HR admins) are told about it.
export async function POST(req: Request) {
  const g = await guard("help");
  if (!g.ok) return g.res;
  const { member, supabase, ctx } = g;

  const body = await readBody(req);
  if (!body) return jsonError("Invalid request body");
  if (!isTicketCategory(body.category)) return jsonError("Choose a category");
  const title = optText(body.title, 200);
  if (!title) return jsonError(title === undefined ? "Subject is too long (200 characters max)" : "Please add a subject");
  const description = optText(body.description, 4000);
  if (description === undefined) return jsonError("Details are too long (4000 characters max)");
  let priority: TicketPriority = "normal";
  if (body.priority != null) {
    if (!isTicketPriority(body.priority)) return jsonError("Choose a priority");
    priority = body.priority;
  }
  const category = body.category;

  const { data, error } = await supabase
    .from("nrs_tickets")
    .insert({ org_id: member.org_id, member_id: member.id, category, title, description, priority })
    .select("id")
    .single();
  if (error) return jsonError(error.message, 500);
  const id = (data as { id: string }).id;

  try {
    const admin = createAdminClient();
    await Promise.all([
      logAudit(admin, {
        orgId: member.org_id,
        actorUser: ctx.user.id,
        entity: "nrs_tickets",
        entityId: id,
        action: "create",
        after: { category, title, priority },
      }),
      notifyTicketAgents(admin, member.org_id, category, {
        title: `New ${desk.categories[category]} ticket: ${title}`,
        body: `${member.full_name} · ${desk.priority[priority]} priority`,
        link: agentTicketLink(id),
      }),
    ]);
  } catch (e) {
    console.error("[nrs] ticket follow-up failed", e);
  }
  return NextResponse.json({ ok: true, id });
}
