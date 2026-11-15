// Presenter.ai — PUBLIC: serves the live-built flyer app for a session code.
// AI-written HTML is sandboxed (opaque origin): it can't touch simplenow.ai cookies.
import { db } from "@/lib/presenter/server";
import { sessionByCode } from "@/lib/presenter/hub";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await sessionByCode(new URL(req.url).searchParams.get("code") || "");
  if (!session) return new Response("Not found", { status: 404 });
  const { data, error } = await db().storage.from("presenter").download(`${session.id}/flyer.html`);
  if (error || !data) return new Response("The app isn't ready yet.", { status: 404 });
  return new Response(await data.text(), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "sandbox allow-scripts allow-downloads allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals",
      "X-Robots-Tag": "noindex",
    },
  });
}
