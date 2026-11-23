import { applyCommand, canUse, db, getShow, json, studioGuard } from "@/lib/studio/server";
import { showResults } from "@/lib/studio/results";
import type { Action } from "@/lib/studio/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET: everything the TV and the remote need (owner only).
export async function GET(req: Request, ctx: Ctx) {
  const g = await studioGuard(req);
  if (g instanceof Response) return g;
  const { id } = await ctx.params;
  const show = await getShow(id);
  if (!show || !canUse(show, g)) return json({ error: "Not found" }, 404);
  const light = new URL(req.url).searchParams.get("light") === "1";
  const results = light ? null : await showResults(id, show.plan);
  return json({ id: show.id, title: show.title, code: show.code, status: show.status, plan: show.plan, live: show.live, results, serverNow: Date.now() });
}

const ACTIONS = new Set(["start", "next", "prev", "goto", "hold", "resume", "say", "spoken", "avatar", "reset"]);

// POST { action, v } — versioned command;
// or { question: { id, op } } — claim (the TV takes a waiting question to answer), answered, not_covered, dismiss, reopen;
// or { ask: { text, source } } — add a question heard by the TV microphone or typed on the remote.
export async function POST(req: Request, ctx: Ctx) {
  const g = await studioGuard(req);
  if (g instanceof Response) return g;
  const { id } = await ctx.params;
  const b = (await req.json().catch(() => ({}))) as { action?: Action; v?: number | null; question?: { id: number; op: string }; ask?: { text: string; source?: string } };
  if (b.ask) {
    const text = String(b.ask.text || "").trim().slice(0, 500);
    if (!text) return json({ error: "Empty" }, 400);
    const show = await getShow(id);
    if (!show || !canUse(show, g)) return json({ error: "Not found" }, 404);
    const voice = b.ask.source === "voice";
    const { data } = await db()
      .from("presenter_show_answers")
      .insert({ show_id: id, kind: "ask", item: String(b.ask.source || "").startsWith("voice") ? "voice" : "remote", text, status: voice ? "answering" : "new" })
      .select("id")
      .single();
    return json({ ok: true, id: data?.id });
  }
  if (b.question) {
    const sb = db();
    if (b.question.op === "claim") {
      // Only one TV can take a question, and only while it's still waiting.
      const { data } = await sb.from("presenter_show_answers").update({ status: "answering" }).eq("id", b.question.id).eq("show_id", id).eq("kind", "ask").eq("status", "new").select("id");
      return json({ ok: !!data?.length });
    }
    const status = { dismiss: "dismissed", answered: "answered", not_covered: "not_covered", reopen: "new" }[b.question.op];
    if (!status) return json({ error: "Unknown op" }, 400);
    await sb.from("presenter_show_answers").update({ status }).eq("id", b.question.id).eq("show_id", id).eq("kind", "ask");
    return json({ ok: true });
  }
  if (b.question === undefined && (!b.action || !ACTIONS.has(b.action.type))) return json({ error: "Unknown action" }, 400);
  // "spoken" and "avatar" are reports from the TV, not operator moves: no version check.
  const seen = b.action!.type === "spoken" || b.action!.type === "avatar" ? null : typeof b.v === "number" ? b.v : null;
  const r = await applyCommand(id, b.action!, seen);
  return json(r, r.status);
}
