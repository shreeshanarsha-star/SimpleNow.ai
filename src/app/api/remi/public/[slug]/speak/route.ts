import { loadWorkspaceBySlug, loadSession, json } from "@/lib/remi/public";
import { allowUsage, ipHash } from "@/lib/remi/security";
import { hasRemiAi, synthesize } from "@/lib/remi/ai";
import { findLanguage } from "@/lib/remi/languages";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

// Text-to-speech for one of THIS session's assistant messages. The text is
// read from the DB by id, so this endpoint can't be used as a free
// general-purpose TTS service.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await loadWorkspaceBySlug(slug);
  if (!found) return json({ error: "Not available." }, 404);
  const { admin, ws } = found;
  if (!hasRemiAi()) return json({ error: "tts_unavailable" }, 503);
  const body = await req.json().catch(() => null);
  const session = await loadSession(admin, ws.id, body?.token);
  if (!session) return json({ error: "session_expired" }, 401);
  const id = Number(body?.messageId);
  if (!Number.isInteger(id) || id <= 0) return json({ error: "Bad request." }, 400);
  if (!(await allowUsage(ipHash(req), "tts", ws.id))) return json({ error: "Too many requests." }, 429);

  const { data: msg } = await admin
    .from("remi_messages")
    .select("content,language,role")
    .eq("id", id)
    .eq("session_id", session.id)
    .maybeSingle();
  if (!msg || msg.role !== "assistant") return json({ error: "Not found." }, 404);

  try {
    const audio = await synthesize(msg.content, ws.voice, findLanguage(msg.language)?.name || null);
    return new Response(new Uint8Array(audio), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" },
    });
  } catch (e) {
    console.error("[remi tts]", e);
    return json({ error: "tts_failed" }, 502);
  }
}
