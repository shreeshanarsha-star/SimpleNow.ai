// Dr.Remi -- server-only AI plumbing. Same provider choice as the rest of
// SimpleNow (OpenAI over raw fetch; gpt-4o-transcribe, then Groq Whisper, for speech-to-text),
// so no new keys are needed. Every call has a timeout and a typed failure.
//
//   chatJson()      -> structured JSON reply (response_format json_object)
//   embed()         -> multilingual embeddings (text-embedding-3-small, 1536d)
//   transcribe()    -> speech-to-text + detected language
//   synthesize()    -> mp3 speech in whatever language the text is written in

import { reconcileSpokenLanguage } from "./languages";

const OPENAI = "https://api.openai.com/v1";

export function remiModel() {
  return process.env.REMI_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
}

export function hasRemiAi() {
  return !!process.env.OPENAI_API_KEY;
}

async function withTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fn(controller.signal);
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error("The AI service timed out.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function key() {
  const k = process.env.OPENAI_API_KEY;
  if (!k) throw new Error("OPENAI_API_KEY is not set on the server.");
  return k;
}

export type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

export async function chatJson<T = Record<string, unknown>>(
  messages: ChatMsg[],
  opts: { maxTokens?: number; temperature?: number; timeoutMs?: number; model?: string } = {}
): Promise<T> {
  const text = await withTimeout(opts.timeoutMs ?? 30_000, async (signal) => {
    const res = await fetch(`${OPENAI}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key()}` },
      body: JSON.stringify({
        model: opts.model || remiModel(),
        messages,
        max_tokens: opts.maxTokens ?? 1200,
        temperature: opts.temperature ?? 0.4,
        response_format: { type: "json_object" },
      }),
      signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error?.message || `OpenAI error ${res.status}`);
    return String(data?.choices?.[0]?.message?.content || "");
  });
  try {
    return JSON.parse(text) as T;
  } catch {
    // Salvage the first {...} block if the model wrapped it in prose.
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]) as T;
    throw new Error("The AI returned an unreadable answer.");
  }
}

/** Streamed plain-text completion; calls onDelta with each text fragment and returns the full text. */
export async function chatStream(
  messages: ChatMsg[],
  onDelta: (t: string) => void,
  opts: { maxTokens?: number; temperature?: number; timeoutMs?: number; model?: string } = {}
): Promise<string> {
  return withTimeout(opts.timeoutMs ?? 40_000, async (signal) => {
    const res = await fetch(`${OPENAI}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key()}` },
      body: JSON.stringify({
        model: opts.model || remiModel(),
        messages,
        max_tokens: opts.maxTokens ?? 700,
        temperature: opts.temperature ?? 0.4,
        stream: true,
      }),
      signal,
    });
    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error?.message || `OpenAI error ${res.status}`);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let full = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const t = JSON.parse(payload)?.choices?.[0]?.delta?.content;
          if (t) {
            full += t;
            onDelta(t);
          }
        } catch {
          /* partial line */
        }
      }
    }
    return full;
  });
}

export const EMBED_DIM = 1536;

export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const out: number[][] = [];
  // OpenAI accepts up to 2048 inputs; keep batches small for latency/limits.
  for (let i = 0; i < texts.length; i += 64) {
    const batch = texts.slice(i, i + 64).map((t) => t.slice(0, 8000));
    const vecs = await withTimeout(45_000, async (signal) => {
      const res = await fetch(`${OPENAI}/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key()}` },
        body: JSON.stringify({ model: process.env.REMI_EMBED_MODEL || "text-embedding-3-small", input: batch }),
        signal,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message || `Embedding error ${res.status}`);
      return (data.data as { embedding: number[]; index: number }[])
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding);
    });
    out.push(...vecs);
  }
  return out;
}

/** pgvector literal for supabase-js rpc/insert. */
export function toVectorLiteral(v: number[]) {
  return `[${v.map((x) => (Number.isFinite(x) ? x.toFixed(6) : "0")).join(",")}]`;
}

function extFor(mime: string) {
  const t = mime.toLowerCase();
  if (t.includes("mp4") || t.includes("m4a")) return "mp4";
  if (t.includes("ogg")) return "ogg";
  if (t.includes("wav")) return "wav";
  if (t.includes("mpeg") || t.includes("mp3")) return "mp3";
  return "webm";
}

export type TranscribeResult =
  | { ok: true; text: string; language: string | null; provider: string }
  | { ok: false; reason: string };

/**
 * Speech-to-text with language detection.
 *
 * gpt-4o-transcribe goes first: its language identification is far more
 * reliable than Whisper's on Indian and other non-European languages
 * (Whisper was labelling Kannada speech as Arabic). It returns no language
 * label, so the language is read from the transcript's own script; for
 * Latin-script text the reply model judges the language from the words.
 * Whisper (Groq, then OpenAI) is the fallback, and its label is only kept
 * when it agrees with the script of what it transcribed.
 *
 * `hint` (ISO code) is passed only when we know what the customer SPEAKS,
 * never the reply language -- forcing the reply language onto STT breaks
 * "speak English, answer in Spanish".
 */
export async function transcribe(audio: Buffer, mime: string, hint?: string | null): Promise<TranscribeResult> {
  const attempts: { url: string; key?: string; model: string; name: string; verbose: boolean }[] = [
    { url: `${OPENAI}/audio/transcriptions`, key: process.env.OPENAI_API_KEY, model: "gpt-4o-transcribe", name: "openai-4o", verbose: false },
    { url: "https://api.groq.com/openai/v1/audio/transcriptions", key: process.env.GROQ_API_KEY, model: "whisper-large-v3", name: "groq", verbose: true },
    { url: `${OPENAI}/audio/transcriptions`, key: process.env.OPENAI_API_KEY, model: "whisper-1", name: "openai", verbose: true },
  ];
  let lastReason = "no_stt_configured";
  for (const a of attempts) {
    if (!a.key) continue;
    try {
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(audio)], { type: mime || "audio/webm" }), `speech.${extFor(mime)}`);
      form.append("model", a.model);
      form.append("response_format", a.verbose ? "verbose_json" : "json");
      if (hint && /^[a-z]{2,3}$/.test(hint)) form.append("language", hint);
      const data = await withTimeout(30_000, async (signal) => {
        const res = await fetch(a.url, { method: "POST", headers: { Authorization: `Bearer ${a.key}` }, body: form, signal });
        if (!res.ok) throw new Error(`${a.name} ${res.status}`);
        return res.json();
      });
      const text = String(data?.text || "").trim();
      if (text) {
        const label = data?.language ? String(data.language) : null;
        return { ok: true, text, language: reconcileSpokenLanguage(text, label), provider: a.name };
      }
      lastReason = "empty_transcript";
    } catch (e) {
      lastReason = e instanceof Error ? e.message : "transcription_failed";
    }
  }
  return { ok: false, reason: lastReason };
}

export const REMI_VOICES = ["sage", "coral", "alloy", "ash", "ballad", "echo", "fable", "nova", "onyx", "shimmer", "verse"] as const;

/** mp3 bytes. gpt-4o-mini-tts speaks the language the text is written in. */
export async function synthesize(text: string, voice: string, languageName?: string | null, fast = false): Promise<Buffer> {
  const v = (REMI_VOICES as readonly string[]).includes(voice) ? voice : "sage";
  const attempt = async (model: string) =>
    withTimeout(30_000, async (signal) => {
      const res = await fetch(`${OPENAI}/audio/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key()}` },
        body: JSON.stringify({
          model,
          voice: v,
          input: text.slice(0, 1500),
          response_format: "mp3",
          ...(model.includes("gpt")
            ? {
                instructions:
                  `Warm, confident, professional sales consultant at a trade exhibition. Natural pace, clear diction.` +
                  (languageName ? ` Speak in ${languageName} with a natural native accent.` : ""),
              }
            : {}),
        }),
        signal,
      });
      if (!res.ok) throw new Error(`tts ${model} ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    });
  // fast=true (streamed sentences): tts-1 starts speaking much sooner.
  const primary = fast ? process.env.REMI_TTS_FAST_MODEL || "tts-1" : process.env.REMI_TTS_MODEL || "gpt-4o-mini-tts";
  try {
    return await attempt(primary);
  } catch {
    return attempt(primary === "tts-1" ? "gpt-4o-mini-tts" : "tts-1");
  }
}
