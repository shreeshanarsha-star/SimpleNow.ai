// Presenter.ai — Shree's Library (owner only): list, add text/file/link/note, delete, sync the deck.
import { db, json, ownerGuard } from "@/lib/presenter/server";
import { addDoc, fetchUrlText, syncDeck } from "@/lib/presenter/library";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const g = await ownerGuard();
  if (g instanceof Response) return g;
  const { data } = await db().from("presenter_library").select("id, title, kind, source, status, chars, error, created_at").order("created_at", { ascending: false });
  return json({ docs: data || [] });
}

export async function POST(req: Request) {
  const g = await ownerGuard();
  if (g instanceof Response) return g;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action || "");
  try {
    if (action === "add-text") {
      const text = String(body.text || "");
      const title = String(body.title || "").trim() || text.slice(0, 60);
      const kind = body.kind === "note" ? "note" : "file";
      return json(await addDoc({ title, kind, source: body.source ? String(body.source) : null, text }));
    }
    if (action === "add-url") {
      const url = String(body.url || "").trim();
      try {
        const page = await fetchUrlText(url);
        return json(await addDoc({ title: String(body.title || "").trim() || page.title, kind: "url", source: url, text: page.text }));
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not read the link";
        await db().from("presenter_library").insert({ title: String(body.title || "").trim() || url.slice(0, 200), kind: "url", source: url, status: "failed", error: msg.slice(0, 300) });
        return json({ status: "failed", error: msg });
      }
    }
    if (action === "delete") {
      await db().from("presenter_library").delete().eq("id", String(body.id || ""));
      return json({ ok: true });
    }
    if (action === "sync-deck") {
      return json(await syncDeck(String(body.sessionId || "")));
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Library error" }, 500);
  }
  return json({ error: "Unknown action" }, 400);
}
