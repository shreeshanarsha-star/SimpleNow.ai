// Presenter.ai — Claude Code "deploys" the app here: it goes live at once at
// simplenow.ai/flyer-ai (no site redeploy). Token-protected.
import { db, json } from "@/lib/presenter/server";
import { patchHub } from "@/lib/presenter/hub";
import { FLYER_PRESETS } from "@/lib/presenter/content";
import { flyerBuildOf, sessionByFlyerToken } from "@/lib/presenter/flyerKit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await sessionByFlyerToken(req);
  if (!session) return json({ error: "Invalid deploy token" }, 401);
  const html = await req.text();
  if (html.length < 500 || html.length > 1_500_000 || !/<html[\s>]/i.test(html)) return json({ error: "That doesn't look like a complete HTML page" }, 400);
  const { error } = await db().storage.from("presenter").upload(`${session.id}/flyer.html`, Buffer.from(html), { contentType: "text/html", upsert: true });
  if (error) return json({ error: error.message }, 500);
  const fb = flyerBuildOf(session);
  await patchHub(session.id, {
    flyerBuild: { status: "ready", startedAt: fb?.startedAt || Date.now(), finishedAt: Date.now(), inputs: fb?.inputs || FLYER_PRESETS[0].inputs, provider: "claude-code" },
  });
  return json({ ok: true, live: "https://www.simplenow.ai/flyer-ai", bytes: html.length });
}
