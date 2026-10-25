import { loadWorkspaceBySlug, loadSession, json, MAX_TURNS_PER_SESSION } from "@/lib/remi/public";
import { allowUsage, ipHash } from "@/lib/remi/security";
import { hasRemiAi, transcribe } from "@/lib/remi/ai";
import { runTurn } from "@/lib/remi/engine";
import { findLanguage } from "@/lib/remi/languages";
import { after } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
// Co-locate with the Supabase database (Singapore) and Indian/APAC visitors.
export const preferredRegion = "sin1";

const MAX_AUDIO_BYTES = 3_500_000; // ~3 minutes of opus; Vercel body cap is 4.5MB

// One customer turn. Accepts typed text OR a recorded audio clip
// (base64). Audio is transcribed with automatic language detection, so a
// visitor can simply start talking in their own language.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await loadWorkspaceBySlug(slug);
  if (!found) return json({ error: "This assistant isn't available." }, 404);
  const { admin, ws } = found;
  if (!hasRemiAi()) return json({ error: "The assistant is not configured yet." }, 503);

  const body = await req.json().catch(() => null);
  if (!body) return json({ error: "Bad request." }, 400);
  const session = await loadSession(admin, ws.id, body.token);
  if (!session) return json({ error: "session_expired" }, 401);
  if (session.turn_count >= MAX_TURNS_PER_SESSION) {
    return json({ error: "This conversation is very long — please start a new one." }, 429);
  }

  const ip = ipHash(req);
  const languagePref = findLanguage(body.language)?.code || null;

  let text = typeof body.text === "string" ? body.text.trim().slice(0, 1500) : "";
  let spokenLanguage: string | null = null;
  let transcript: string | null = null;

  if (!text && typeof body.audio === "string" && body.audio.length > 100) {
    if (!(await allowUsage(ip, "stt", ws.id))) return json({ error: "Too many requests. Please wait a moment." }, 429);
    const audio = Buffer.from(body.audio, "base64");
    if (audio.byteLength > MAX_AUDIO_BYTES) return json({ error: "That recording is too long." }, 413);
    const mime = typeof body.mime === "string" ? body.mime.slice(0, 60) : "audio/webm";
    const t = await transcribe(audio, mime, languagePref);
    if (!t.ok) return json({ error: "I couldn't hear that clearly. Please try again.", reason: t.reason }, 422);
    text = t.text.slice(0, 1500);
    transcript = text;
    spokenLanguage = t.language;
  }
  if (!text) return json({ error: "Please type or say something." }, 400);

  if (!(await allowUsage(ip, "turn", ws.id))) return json({ error: "Too many requests. Please wait a moment." }, 429);

  try {
    const result = await runTurn({ admin, ws, session, userText: text, languagePref, spokenLanguage, defer: (fn) => after(fn) });
    return json({ ...result, transcript });
  } catch (e) {
    console.error("[remi turn]", e);
    return json({ error: "I couldn't answer just now. Please try again." }, 500);
  }
}
