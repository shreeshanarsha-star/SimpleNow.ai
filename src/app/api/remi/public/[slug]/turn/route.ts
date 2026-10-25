import { loadWorkspaceBySlug, loadSession, json, MAX_TURNS_PER_SESSION } from "@/lib/remi/public";
import { allowUsage, ipHash } from "@/lib/remi/security";
import { hasRemiAi, synthesize, transcribe } from "@/lib/remi/ai";
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

  // Streaming mode (Server-Sent Events): reply text arrives word by word and,
  // when voice is on, each finished sentence is synthesised and streamed as
  // audio immediately — so the customer hears the answer within seconds.
  if (body.stream === true) {
    const wantVoice = body.voice === true && (await allowUsage(ip, "tts", ws.id));
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          try {
            controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          } catch {
            /* client went away */
          }
        };
        if (transcript) send("transcript", { text: transcript });
        let pending = "";
        let seq = 0;
        let chain: Promise<void> = Promise.resolve();
        let langName: string | null = findLanguage(languagePref)?.name || findLanguage(spokenLanguage)?.name || null;
        const speak = (sentence: string) => {
          const t = sentence.trim();
          if (!wantVoice || !t) return;
          const n = seq++;
          const audioP = synthesize(t, ws.voice, langName).then((b) => b.toString("base64")).catch(() => null);
          chain = chain.then(async () => {
            const b64 = await audioP;
            if (b64) send("audio", { seq: n, mp3: b64 });
          });
        };
        const flushSentences = (final: boolean) => {
          // Split on sentence ends (Latin, Devanagari danda, CJK); keep >= 25 chars per chunk.
          for (;;) {
            const m = pending.match(/^[\s\S]{25,}?[.!?।。！？](\s|$)/);
            if (!m) break;
            speak(m[0]);
            pending = pending.slice(m[0].length);
          }
          if (final && pending.trim()) {
            speak(pending);
            pending = "";
          }
        };
        try {
          const result = await runTurn({
            admin, ws, session, userText: text, languagePref, spokenLanguage,
            defer: (fn) => after(fn),
            onDelta: (d) => {
              send("delta", { text: d });
              pending += d;
              flushSentences(false);
            },
          });
          langName = result.language.name;
          flushSentences(true);
          await chain;
          send("done", { ...result, transcript, audioChunks: seq });
        } catch (e) {
          console.error("[remi turn stream]", e);
          send("error", { error: "I couldn't answer just now. Please try again." });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" },
    });
  }

  try {
    const result = await runTurn({ admin, ws, session, userText: text, languagePref, spokenLanguage, defer: (fn) => after(fn) });
    return json({ ...result, transcript });
  } catch (e) {
    console.error("[remi turn]", e);
    return json({ error: "I couldn't answer just now. Please try again." }, 500);
  }
}
