import { HttpError, dbCheck, ok, run } from "@/lib/nrs/invoice/kit";
import { requireAgent, namesIn } from "@/app/tools/nr-synergy/desk/support/_server";
import type { DeskQueue, DeskTicket } from "@/app/tools/nr-synergy/desk/support/_types";
import {
  ACTIVE_STATUSES,
  TICKET_COLUMNS,
  TICKET_PRIORITIES,
  isTicketCategory,
  isTicketPriority,
  isTicketStatus,
  type TicketRow,
} from "@/app/tools/nr-synergy/help/_lib";

export const dynamic = "force-dynamic";

const LIMIT = 300;
const PRIORITY_RANK = Object.fromEntries(TICKET_PRIORITIES.map((p, i) => [p, i])) as Record<string, number>;

/** Strip characters that carry meaning in a PostgREST or()/ilike filter. */
function cleanSearch(q: string): string {
  return q.replace(/[%_,()*\\:."'`]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

// GET ?status=active|all|<status>&category=&priority=&assigned=all|me|unassigned&q=
// The caller's queue: only categories they are an agent for, in their org.
export async function GET(req: Request) {
  return run(async () => {
    const g = await requireAgent();
    const sp = new URL(req.url).searchParams;
    const status = sp.get("status") || "active";
    const category = sp.get("category") || "";
    const priority = sp.get("priority") || "";
    const assigned = sp.get("assigned") || "all";
    const q = cleanSearch(sp.get("q") ?? "");

    let cats = g.categories;
    if (category) {
      if (!isTicketCategory(category)) throw new HttpError("Unknown category");
      cats = cats.filter((c) => c === category);
    }
    if (!cats.length) return ok<DeskQueue>({ me: g.member.id, categories: g.categories, tickets: [], truncated: false });

    let query = g.admin.from("nrs_tickets").select(TICKET_COLUMNS).eq("org_id", g.orgId).in("category", cats);
    if (status === "active") query = query.in("status", ACTIVE_STATUSES as string[]);
    else if (status !== "all") {
      if (!isTicketStatus(status)) throw new HttpError("Unknown status");
      query = query.eq("status", status);
    }
    if (priority) {
      if (!isTicketPriority(priority)) throw new HttpError("Unknown priority");
      query = query.eq("priority", priority);
    }
    if (assigned === "me") query = query.eq("assignee_member_id", g.member.id);
    else if (assigned === "unassigned") query = query.is("assignee_member_id", null);
    else if (assigned !== "all") throw new HttpError("Unknown assignment filter");

    if (q) {
      const { data: people, error: pErr } = await g.admin
        .from("nrs_members")
        .select("id")
        .eq("org_id", g.orgId)
        .ilike("full_name", `%${q}%`)
        .limit(50);
      dbCheck(pErr, "Members");
      const ids = ((people ?? []) as { id: string }[]).map((p) => p.id);
      const ors = [`title.ilike.%${q}%`, `description.ilike.%${q}%`];
      if (ids.length) ors.push(`member_id.in.(${ids.join(",")})`);
      query = query.or(ors.join(","));
    }

    const { data, error } = await query.order("created_at", { ascending: false }).limit(LIMIT + 1);
    dbCheck(error, "Tickets");
    const rows = (data ?? []) as TicketRow[];
    const truncated = rows.length > LIMIT;
    const list = rows.slice(0, LIMIT);
    const names = await namesIn(g.admin, g.orgId, list.flatMap((t) => [t.member_id, t.assignee_member_id]));

    const active = new Set<string>(ACTIVE_STATUSES);
    const tickets: DeskTicket[] = list
      .map((t) => ({ ...t, requester_name: names[t.member_id] ?? "", assignee_name: t.assignee_member_id ? names[t.assignee_member_id] ?? null : null }))
      .sort((a, b) => {
        const aa = active.has(a.status) ? 0 : 1;
        const ba = active.has(b.status) ? 0 : 1;
        if (aa !== ba) return aa - ba;
        if (aa === 0) {
          const pr = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
          if (pr) return pr;
          return a.created_at.localeCompare(b.created_at); // oldest first within a priority
        }
        return b.updated_at.localeCompare(a.updated_at);
      });

    return ok<DeskQueue>({ me: g.member.id, categories: g.categories, tickets, truncated });
  });
}
