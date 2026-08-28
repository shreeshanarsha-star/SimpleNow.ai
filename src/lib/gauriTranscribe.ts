// Speech-to-text for both live-recorded clips (from the browser's
// MediaRecorder) and uploaded audio/video files. Groq's Whisper endpoint is
// tried first (generous free tier, fast); OpenAI's Whisper endpoint is the
// fallback if Groq isn't configured or the call fails. If neither key is
// set, the client is expected to fall back to the browser's own Web Speech
// API for live mic input only (see the avatar page) — that path never
// reaches this function in normal use.
//
// Ported verbatim from askshree-app (v1)'s lib/gauriTranscribe.js.

function extensionFor(mimeType: string | null | undefined): string {
  const type = (mimeType || "").toLowerCase();
  if (type.includes("mp4") || type.includes("m4a")) return "mp4";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("wav")) return "wav";
  if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
  return "webm";
}

export async function transcribeAudio(
  base64: string,
  mimeType?: string | null
): Promise<{ ok: true; text: string; provider: "groq" | "openai" } | { ok: false; reason: string; detail?: string }> {
  const groqKey = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!groqKey && !openaiKey) return { ok: false, reason: "no_stt_configured" };

  const buffer = Buffer.from(base64, "base64");
  const resolvedMimeType = mimeType || "audio/webm";
  const blob = new Blob([buffer], { type: resolvedMimeType });
  const filename = `audio.${extensionFor(resolvedMimeType)}`;

  if (groqKey) {
    try {
      const form = new FormData();
      form.append("file", blob, filename);
      form.append("model", "whisper-large-v3");
      const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${groqKey}` },
        body: form,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.text) return { ok: true, text: data.text, provider: "groq" };
      }
    } catch {
      // fall through to OpenAI below
    }
  }

  if (openaiKey) {
    try {
      const form = new FormData();
      form.append("file", blob, filename);
      form.append("model", "whisper-1");
      const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}` },
        body: form,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.text) return { ok: true, text: data.text, provider: "openai" };
      }
      const errText = await res.text().catch(() => "");
      return { ok: false, reason: "transcription_failed", detail: errText.slice(0, 300) };
    } catch (e) {
      return { ok: false, reason: "transcription_failed", detail: String((e as Error)?.message || e) };
    }
  }

  return { ok: false, reason: "transcription_failed" };
}
