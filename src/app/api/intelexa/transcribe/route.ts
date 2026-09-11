import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function formatSeconds(sec: number): string {
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const groqKey = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!groqKey && !openaiKey) {
    return NextResponse.json(
      { error: "No transcription API key configured (neither GROQ_API_KEY nor OPENAI_API_KEY)." },
      { status: 503 }
    );
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    let fileBlob: Blob | null = null;
    let fileName = "audio.webm";
    let offsetSeconds = 0;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file");
      if (file && typeof file === "object" && "arrayBuffer" in file) {
        fileBlob = file as Blob;
        fileName = (file as any).name || "audio.webm";
      }
      if (formData.get("offset")) {
        offsetSeconds = Number(formData.get("offset")) || 0;
      }
    } else {
      const body = await req.json();
      if (body.base64) {
        const buffer = Buffer.from(body.base64, "base64");
        const mimeType = body.mimeType || "audio/webm";
        fileBlob = new Blob([buffer], { type: mimeType });
        const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("wav") ? "wav" : mimeType.includes("mpeg") ? "mp3" : "webm";
        fileName = `audio.${ext}`;
      }
      if (body.offset) {
        offsetSeconds = Number(body.offset) || 0;
      }
    }

    if (!fileBlob || fileBlob.size === 0) {
      return NextResponse.json({ error: "No valid audio data provided." }, { status: 400 });
    }

    // Attempt 1: Groq Whisper (Blazing fast ~1s latency)
    if (groqKey) {
      try {
        const form = new FormData();
        form.append("file", fileBlob, fileName);
        form.append("model", "whisper-large-v3");
        form.append("response_format", "verbose_json");
        form.append("temperature", "0.2");

        const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${groqKey}` },
          body: form,
        });

        if (res.ok) {
          const data = await res.json();
          const segments = (data.segments || []).map((seg: any) => ({
            start: formatSeconds((seg.start || 0) + offsetSeconds),
            end: formatSeconds((seg.end || 0) + offsetSeconds),
            text: seg.text?.trim() || "",
          }));

          if (segments.length === 0 && data.text?.trim()) {
            segments.push({
              start: formatSeconds(offsetSeconds),
              end: formatSeconds(offsetSeconds + (data.duration || 30)),
              text: data.text.trim(),
            });
          }

          return NextResponse.json({
            ok: true,
            provider: "groq",
            text: data.text || "",
            duration: data.duration || 0,
            segments,
          });
        }
      } catch (err) {
        console.warn("[intelexa:transcribe] Groq attempt failed, falling back to OpenAI Whisper:", err);
      }
    }

    // Attempt 2: OpenAI Whisper-1
    if (openaiKey) {
      const form = new FormData();
      form.append("file", fileBlob, fileName);
      form.append("model", "whisper-1");
      form.append("response_format", "verbose_json");
      form.append("temperature", "0.2");

      const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}` },
        body: form,
      });

      if (res.ok) {
        const data = await res.json();
        const segments = (data.segments || []).map((seg: any) => ({
          start: formatSeconds((seg.start || 0) + offsetSeconds),
          end: formatSeconds((seg.end || 0) + offsetSeconds),
          text: seg.text?.trim() || "",
        }));

        if (segments.length === 0 && data.text?.trim()) {
          segments.push({
            start: formatSeconds(offsetSeconds),
            end: formatSeconds(offsetSeconds + (data.duration || 30)),
            text: data.text.trim(),
          });
        }

        return NextResponse.json({
          ok: true,
          provider: "openai",
          text: data.text || "",
          duration: data.duration || 0,
          segments,
        });
      }

      const errText = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `OpenAI Whisper transcription failed (${res.status}): ${errText.slice(0, 300)}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ error: "Transcription failed." }, { status: 500 });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Transcription processing failed." },
      { status: 500 }
    );
  }
}
