import { applyCommand, db, fastOwnerGuard, getShow, json } from "@/lib/studio/server";
import { showResults } from "@/lib/studio/results";
import type { Action } from "@/lib/studio/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET: everything the TV and the remote need (owner only).
export async function GET(req: Request, ctx: Ctx) {
  const g = await fastOwnerGuard(req);
  if (g instanceof Response) return g;
  const { id } = await ctx.params;
  const show = await getShow(id);
  if (!show) return json({ error: "Not found" }, 404);
  const light = new URL(req.url).searchParams.get("light") === "1";
  const results = light ? null : await showResults(id, show.plan);
  return json({ id: show.id, title: show.title, code: show.code, status: show.status, plan: show.plan, live: show.live, results, serverNow: Date.now() });
}

const ACTIONS = new Set(["start", "next", "prev", "goto", "hold", "resume", "say", "spoken", "avatar", "reset"]);

// POST { action, v } — versioned command; or { question: { id, op: "dismiss" | "answered" | "reopen" } }.
export async function POST(req: Request, ctx: Ctx) {
  const g = await fastOwnerGuard(req);
  if (g instanceof Response) return g;
  const { id } = await ctx.params;
  const b = (await req.json().catch(() => ({}))) as { action?: Action; v?: number | null; question?: { id: number; op: string; text?: string } };
  if (b.question) {
    const status = { dismiss: "dismissed", answered: "answered", reopen: "new" }[b.question.op];
    if (!status) return json({ error: "Unknown op" }, 400);
    await db().from("presenter_show_answers").update({ status }).eq("id", b.question.id).eq("show_id", id).eq("kind", "ask");
    return json({ ok: true });
  }
  if (b.question === undefined && (!b.action || !ACTIONS.has(b.action.type))) return json({ error: "Unknown action" }, 400);
  // "spoken" and "avatar" are reports from the TV, not operator moves: no version check.
  const seen = b.action!.type === "spoken" || b.action!.type === "avatar" ? null : typeof b.v === "number" ? b.v : null;
  const r = await applyCommand(id, b.action!, seen);
  return json(r, r.status);
}
