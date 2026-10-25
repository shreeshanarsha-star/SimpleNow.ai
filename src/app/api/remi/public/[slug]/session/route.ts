import { loadWorkspaceBySlug, json } from "@/lib/remi/public";
import { allowUsage, ipHash, newSessionToken } from "@/lib/remi/security";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

const CHANNELS = ["web", "kiosk", "qr", "test", "embed"];

// Starts an anonymous customer session. The raw token goes to the browser
// only; the DB stores its hash.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await loadWorkspaceBySlug(slug);
  if (!found) return json({ error: "This assistant isn't available." }, 404);
  const { admin, ws } = found;
  const ip = ipHash(req);
  if (!(await allowUsage(ip, "session", ws.id))) return json({ error: "Too many sessions. Please wait a little." }, 429);
  const body = await req.json().catch(() => ({}));
  const channel = CHANNELS.includes(body?.channel) ? body.channel : "web";
  const { token, hash } = newSessionToken();
  const { error } = await admin.from("remi_sessions").insert({
    workspace_id: ws.id,
    token_hash: hash,
    channel,
    ip_hash: ip,
    user_agent: (req.headers.get("user-agent") || "").slice(0, 200),
  });
  if (error) return json({ error: "Couldn't start a conversation." }, 500);
  return json({ token });
}
