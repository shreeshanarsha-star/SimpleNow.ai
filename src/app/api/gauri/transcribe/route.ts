import { NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/gauriTranscribe";

export const dynamic = "force-dynamic";

// Public — farmers have no account, so this can't be gated by login.
// Ported verbatim from askshree-app (v1)'s app/api/gauri/transcribe/route.js.
export async function POST(req: Request) {
  const { audioFile } = await req.json();
  if (!audioFile?.base64) {
    return NextResponse.json({ error: "No audio provided." }, { status: 400 });
  }
  const result = await transcribeAudio(audioFile.base64, audioFile.mimeType);
  if (!result.ok) {
    return NextResponse.json(
      {
        error:
          result.reason === "no_stt_configured"
            ? "Voice input isn't set up yet — please type your answer instead."
            : "Could not transcribe that recording. Try again, or type instead.",
      },
      { status: 503 }
    );
  }
  return NextResponse.json({ ok: true, transcript: result.text });
}
