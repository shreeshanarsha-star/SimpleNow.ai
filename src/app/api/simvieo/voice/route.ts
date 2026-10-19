import { NextResponse } from "next/server";
import { optionalUserId } from "@/lib/simvieo/request";
import { callerKey, checkUsage, limitMessage, recordUsage } from "@/lib/simvieo/usage";

export const maxDuration = 60;

// POST /api/simvieo/voice -- narration, one clip per scene so captions and
// voice stay in sync. Hard-capped at MAX_CHARS per video (≈ ₹0.8 at most).
const MAX_CHARS = 520;
const INR_PER_CHAR = 0.0015;
const VOICES = ["nova", "onyx", "alloy", "shimmer"] as const;
const TONE: Record<string, string> = {
  energetic: "Upbeat, confident, energetic advertising voiceover. Clear and punchy.",
  uplifting: "Warm, optimistic, inspiring advertising voiceover.",
  calm: "Calm, reassuring, premium advertising voiceover.",
  corporate: "Professional, credible, friendly corporate voiceover.",
};

async function speak(text: string, voice: string, mood: string): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY!;
  const attempt = async (model: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          voice,
          input: text,
          response_format: "mp3",
          ...(model.includes("gpt") ? { instructions: TONE[mood] || TONE.uplifting } : {}),
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`tts ${model} ${res.status}`);
      return Buffer.from(await res.arrayBuffer()).toString("base64");
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    return await attempt(process.env.SIMVIEO_TTS_MODEL || "gpt-4o-mini-tts");
  } catch (e) {
    console.error("simvieo tts primary failed:", e instanceof Error ? e.message : e);
    try {
      return await attempt("tts-1");
    } catch (e2) {
      console.error("simvieo tts fallback failed:", e2 instanceof Error ? e2.message : e2);
      return null;
    }
  }
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "Voiceover isn't available right now." }, { status: 503 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const voice = VOICES.includes(body.voice as (typeof VOICES)[number]) ? (body.voice as string) : "nova";
  const mood = typeof body.mood === "string" ? body.mood : "uplifting";
  const raw = Array.isArray(body.lines) ? (body.lines as unknown[]).slice(0, 14) : [];
  let budget = MAX_CHARS;
  const lines = raw.map((l) => {
    const t = typeof l === "string" ? l.replace(/\s+/g, " ").trim() : "";
    if (!t || budget <= 0) return "";
    const cut = t.length <= budget ? t : t.slice(0, budget).replace(/\s+\S*$/, "") + ".";
    budget -= cut.length;
    return cut;
  });
  const chars = lines.reduce((a, l) => a + l.length, 0);
  if (!chars) return NextResponse.json({ error: "Nothing to narrate." }, { status: 400 });

  const ipHash = callerKey(request);
  const usage = await checkUsage(ipHash, "voice");
  if (!usage.allowed) return NextResponse.json({ error: limitMessage("voice") }, { status: 429 });
  if (usage.overBudget) {
    return NextResponse.json({ error: "Voiceover is resting for today. Captions and music still work." }, { status: 503 });
  }

  const clips = await Promise.all(lines.map((l) => (l ? speak(l, voice, mood) : Promise.resolve(null))));
  const ok = clips.filter(Boolean).length;
  if (!ok) return NextResponse.json({ error: "Voiceover failed. Your video still works with captions and music." }, { status: 502 });
  await recordUsage(ipHash, await optionalUserId(), "voice", chars * INR_PER_CHAR, "ai");
  return NextResponse.json({ clips, truncated: chars < raw.join("").length });
}
