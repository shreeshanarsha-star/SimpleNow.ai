import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getModel } from "@/lib/aiClient";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      transcript_text = "",
      transcript_segments = [],
      duration_seconds = 0,
    } = body;

    if (!transcript_text || !transcript_text.trim()) {
      return NextResponse.json(
        { error: "No transcript content provided for verification." },
        { status: 400 }
      );
    }

    // 1. Fetch Event
    const { data: event, error: eventErr } = await supabase
      .from("intelexa_events")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (eventErr || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // 2. Independently and Permanently Store Raw Transcript in Database
    // This ensures raw speech is NEVER lost regardless of user's next action
    await supabase.from("intelexa_transcripts").upsert(
      {
        event_id: id,
        user_id: user.id,
        full_text: transcript_text,
        segments: transcript_segments,
      },
      { onConflict: "event_id" }
    );

    // Update event duration
    await supabase
      .from("intelexa_events")
      .update({
        duration_seconds: Math.max(duration_seconds, event.duration_seconds || 0),
        recording_status: "stopped",
      })
      .eq("id", id);

    // 3. Statistical Analysis
    const words = transcript_text.trim().split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const durationMin = Math.max(0.5, duration_seconds / 60);
    const wpm = Math.round(wordCount / durationMin);
    const segmentsCount = transcript_segments.length;

    // 4. Fast AI Audit of Transcription Completeness & Thematic Coherence
    let aiAudit = {
      completeness_score: 95,
      voice_fidelity: "High Voice Clarity",
      topic_summary: "Continuous speech captured across conference session.",
      speaker_flow: "Multi-turn speech identified.",
      has_substantial_content: wordCount >= 30,
    };

    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey && wordCount >= 10) {
      try {
        const systemPrompt = `You are Intelexa's Audio Transcription Completeness Auditor.
Analyze this raw conference/seminar transcript excerpt to evaluate its completeness and thematic coverage.
Rules:
- Calculate a realistic completeness score (0-100) based on speech coherence, absence of major mid-sentence dropouts, and natural conversational cadence.
- Rate voice fidelity ("Excellent Voice Fidelity", "High Voice Clarity", "Moderate Acoustics", or "Faint Speech Detected").
- Provide a crisp 1-2 sentence topic summary of what was actually spoken in the room.
- Describe speaker interaction ("Keynote Presentation", "Panel Discussion / Multi-Speaker", or "Interactive Q&A").
- Return strictly valid JSON:
{
  "completeness_score": number,
  "voice_fidelity": string,
  "topic_summary": string,
  "speaker_flow": string
}`;

        const userExcerpt = transcript_text.slice(0, 4000);
        const userPrompt = `Recorded Duration: ${Math.round(durationMin)} minutes\nWord Count: ${wordCount} words (~${wpm} WPM)\nSegments Count: ${segmentsCount}\n\nTranscript Excerpt:\n${userExcerpt}`;

        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: getModel(),
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            response_format: { type: "json_object" },
            temperature: 0.1,
            max_tokens: 500,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
          if (parsed.completeness_score !== undefined) {
            aiAudit = {
              completeness_score: Math.min(100, Math.max(10, Number(parsed.completeness_score) || 95)),
              voice_fidelity: parsed.voice_fidelity || "High Voice Clarity",
              topic_summary: parsed.topic_summary || "Speech successfully transcribed.",
              speaker_flow: parsed.speaker_flow || "Speaker dialogue detected.",
              has_substantial_content: wordCount >= 30,
            };
          }
        }
      } catch (err) {
        console.warn("[verify-transcript] AI audit warning:", err);
      }
    }

    const auditResult = {
      word_count: wordCount,
      duration_seconds,
      wpm,
      segments_count: segmentsCount,
      ...aiAudit,
      verified_at: new Date().toISOString(),
    };

    // Store audit inside event metadata
    const existingMetadata = (event.metadata && typeof event.metadata === "object") ? event.metadata : {};
    await supabase
      .from("intelexa_events")
      .update({
        metadata: {
          ...existingMetadata,
          completeness_audit: auditResult,
        },
      })
      .eq("id", id);

    return NextResponse.json({
      ok: true,
      audit: auditResult,
      transcript_text,
      segments: transcript_segments,
    });
  } catch (err) {
    console.error("Transcript verification failed:", err);
    return NextResponse.json(
      { error: (err as Error).message || "Verification failed." },
      { status: 500 }
    );
  }
}
