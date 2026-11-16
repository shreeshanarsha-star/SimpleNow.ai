// Flyer.ai — PUBLIC: the app Claude built live tonight (sandboxed, so it can't
// touch simplenow.ai cookies). Falls back to the tested backup app, prefilled
// with the room's inputs, if nothing was published.
import { db } from "@/lib/presenter/server";
import { hubOf, sessionByCode, type SessionRow } from "@/lib/presenter/hub";
import { FLYER_PRESETS, backupFlyerUrl } from "@/lib/presenter/content";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  let session: SessionRow | null = null;
  const code = u.searchParams.get("code");
  if (code) session = await sessionByCode(code);
  if (!session) {
    const { data } = await db().from("presenter_sessions").select("id, code, title, status, state").order("created_at", { ascending: false }).limit(1).maybeSingle();
    session = (data as SessionRow) || null;
  }
  const fb = session ? hubOf(session).flyerBuild : null;
  const claudeBuilt = fb?.status === "ready" && (fb.provider === "claude-code" || fb.provider === "claude");
  if (session && claudeBuilt && u.searchParams.get("backup") !== "1") {
    const { data } = await db().storage.from("presenter").download(`${session.id}/flyer.html`);
    if (data) {
      return new Response(await data.text(), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Security-Policy": "sandbox allow-scripts allow-downloads allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals",
          "X-Robots-Tag": "noindex",
        },
      });
    }
  }
  return Response.redirect(new URL(backupFlyerUrl(fb?.inputs || FLYER_PRESETS[0].inputs), u.origin), 302);
}
