import { db, getShow, json, ownerGuard } from "@/lib/studio/server";
import { emptyLive, normalizePlan, type Plan } from "@/lib/studio/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const g = await ownerGuard();
  if (g instanceof Response) return g;
  const { id } = await ctx.params;
  const show = await getShow(id);
  if (!show) return json({ error: "Not found" }, 404);
  return json({ show });
}

// PATCH { plan?, title?, event_date?, status?, resetLive? }
export async function PATCH(req: Request, ctx: Ctx) {
  const g = await ownerGuard();
  if (g instanceof Response) return g;
  const { id } = await ctx.params;
  const b = (await req.json().catch(() => ({}))) as { plan?: Partial<Plan>; title?: string; event_date?: string | null; status?: string; resetLive?: boolean };
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (b.plan) patch.plan = normalizePlan(b.plan);
  if (typeof b.title === "string") patch.title = b.title.trim().slice(0, 160) || "Untitled presentation";
  if (b.event_date !== undefined) patch.event_date = b.event_date || null;
  if (b.status && ["draft", "ready", "done", "archived"].includes(b.status)) patch.status = b.status;
  const sb = db();
  if (b.resetLive) {
    // Fresh run: clear live state and this show's audience answers (rehearsal leftovers).
    const cur = await getShow(id);
    patch.live = { ...emptyLive(), v: (cur?.live.v || 0) + 1, take: (cur?.live.take || 0) + 1 };
    await sb.from("presenter_show_answers").delete().eq("show_id", id);
    await sb.from("presenter_show_people").delete().eq("show_id", id);
  }
  const { error } = await sb.from("presenter_shows").update(patch).eq("id", id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const g = await ownerGuard();
  if (g instanceof Response) return g;
  const { id } = await ctx.params;
  const show = await getShow(id);
  if (!show) return json({ error: "Not found" }, 404);
  if (show.legacy_session_id) return json({ error: "Past events from the first Presenter can't be deleted here." }, 400);
  const sb = db();
  await sb.storage.from("presenter").remove([`shows/${id}/deck.pdf`]);
  const { error } = await sb.from("presenter_shows").delete().eq("id", id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}
