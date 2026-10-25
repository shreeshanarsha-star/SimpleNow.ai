import { loadWorkspaceBySlug, loadSession, json } from "@/lib/remi/public";
import { endSession } from "@/lib/remi/engine";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";
export const maxDuration = 45;

// Called when a visitor leaves (navigator.sendBeacon on page hide) or a kiosk
// resets after inactivity: writes the AI summary onto the lead and sends one
// summary email to the team (only when the customer consented).
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await loadWorkspaceBySlug(slug);
  if (!found) return json({ ok: false }, 404);
  const { admin, ws } = found;
  const raw = await req.text().catch(() => "");
  let token: unknown = null;
  try {
    token = JSON.parse(raw)?.token;
  } catch {
    token = null;
  }
  const session = await loadSession(admin, ws.id, token);
  if (!session) return json({ ok: true });
  try {
    await endSession(admin, ws, session.id);
  } catch (e) {
    console.error("[remi end]", e);
  }
  return json({ ok: true });
}
