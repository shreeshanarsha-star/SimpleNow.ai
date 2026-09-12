import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";
import { callTextModel, hasAiKey } from "@/lib/aiClient";

export type NoteSynthesisMode = "auto" | "meeting" | "brainstorm" | "tasks" | "clean";

export type VoiceNoteAnalysis = {
  title: string;
  body: string;
  action_items: Array<{ text: string; due_date?: string | null }>;
  tags: string[];
  summary: string;
};

const MODE_INSTRUCTIONS: Record<NoteSynthesisMode, string> = {
  auto: "Determine the best structure based on content. If it reads like a meeting, use meeting format; if fragmented thoughts, organize into themes; if tasks, focus on checklists.",
  meeting:
    "Format as an Executive Meeting Debrief. Include sections for: ## Context & Objectives, ## Key Discussion Points, ## Decisions Made, and ## Next Steps.",
  brainstorm:
    "Format as an Idea & Brainstorm Canvas. Distill scattered thoughts into: ## Core Thesis, ## Strategic Angles & Ideas, ## Open Questions, and ## Next Experiments.",
  tasks:
    "Format with heavy focus on deliverables: ## Primary Goal, followed by markdown task checkboxes (`- [ ] ...`) grouped by priority or category.",
  clean:
    "Keep the speaker's original voice, flow, and verbatim thoughts, but eliminate verbal tics/fillers ('um', 'uh', 'you know', repeated words), fix run-on punctuation, and organize into clean readable paragraphs with occasional bullet points where appropriate.",
};

function parseAiJson(raw: string): VoiceNoteAnalysis {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    return {
      title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : "Voice Note",
      body: typeof parsed.body === "string" && parsed.body.trim() ? parsed.body.trim() : raw,
      action_items: Array.isArray(parsed.action_items)
        ? parsed.action_items
            .filter((item: unknown) => item && typeof item === "object" && "text" in item && typeof (item as { text: string }).text === "string")
            .map((item: { text: string; due_date?: string | null }) => ({
              text: item.text.trim(),
              due_date: typeof item.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.due_date) ? item.due_date : null,
            }))
        : [],
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter((t: unknown) => typeof t === "string").slice(0, 5) : [],
      summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "",
    };
  } catch {
    // If JSON parsing fails, fallback gracefully to returning the raw response as note body
    return {
      title: "Dictated Note",
      body: raw,
      action_items: [],
      tags: ["Voice Note"],
      summary: "Voice dictated note",
    };
  }
}

export async function POST(req: Request) {
  let user;
  try {
    ({ user } = await requireUser());
  } catch (res) {
    return res as Response;
  }

  const body = await req.json().catch(() => ({}));
  const transcript = typeof body.transcript === "string" ? body.transcript.trim() : "";
  const mode: NoteSynthesisMode = ["auto", "meeting", "brainstorm", "tasks", "clean"].includes(body.mode)
    ? body.mode
    : "auto";
  const existingNoteTitle = typeof body.existingTitle === "string" ? body.existingTitle.trim() : "";
  const existingNoteBody = typeof body.existingBody === "string" ? body.existingBody.trim() : "";

  if (!transcript) {
    return NextResponse.json({ error: "Transcript is empty. Please speak clearly and try again." }, { status: 400 });
  }

  // Graceful fallback if OpenAI key is not configured
  if (!hasAiKey()) {
    return NextResponse.json({
      analysis: {
        title: transcript.slice(0, 30) + (transcript.length > 30 ? "…" : ""),
        body: transcript,
        action_items: [],
        tags: ["Voice"],
        summary: "Raw voice transcription",
      },
      warning: "AI key not configured; saved raw transcription.",
    });
  }

  const today = new Date().toISOString().split("T")[0];
  const modeGuidance = MODE_INSTRUCTIONS[mode];

  const prompt = `You are an elite Executive Chief of Staff and AI Note Architect.
Today's date is: ${today}.
The user has dictated their thoughts via voice. Your task is to transform this raw, spoken dictation into a polished, high-value, executive-grade note.

Raw Spoken Transcript:
"""
${transcript}
"""

${
  existingNoteBody
    ? `Context: The user already has an existing note open titled "${existingNoteTitle || "Untitled"}":
Existing Note Content:
"""
${existingNoteBody}
"""
You may integrate or synthesize the new dictation with the existing context if instructed to update, or deliver a self-contained structured note.`
    : ""
}

Mode: "${mode}"
Formatting Guidance: ${modeGuidance}

Instructions:
1. Strip all verbal filler words ("um", "uh", "like", "you know", "kind of", "sort of", stuttered phrases).
2. Create a concise, professional title (under 8 words) capturing the true subject matter. Do NOT use generic titles like "Voice Note" unless the transcript is too vague.
3. Structure the body using clean, beautiful GitHub Flavored Markdown (bullet points, bold key concepts, clear section headers). Make it easy to scan in 5 seconds.
4. Detect any actionable commitments, tasks, or follow-ups mentioned in the transcript. Extract each into the "action_items" array. If a relative date is mentioned (e.g. "tomorrow", "next Friday", "by the 25th"), calculate and resolve it to a "YYYY-MM-DD" string based on today's date (${today}).
5. Generate 2 to 4 topical tags (e.g., ["Strategy", "Marketing", "Urgent"]).
6. Provide a 1-sentence executive summary.

CRITICAL: Return strictly valid JSON ONLY. No markdown code blocks around the JSON, no commentary before or after.
JSON format:
{
  "title": "Short punchy executive title",
  "summary": "1 sentence executive summary",
  "body": "Markdown formatted note content with headers, bullet points, bold text",
  "action_items": [
    { "text": "Specific task description", "due_date": "YYYY-MM-DD or null" }
  ],
  "tags": ["Tag1", "Tag2"]
}`;

  try {
    const aiResponse = await callTextModel(prompt, 1800, 25_000);
    const analysis = parseAiJson(aiResponse);
    return NextResponse.json({ analysis });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI synthesis failed.";
    // Provide a resilient fallback so the user's spoken words are never lost
    return NextResponse.json({
      analysis: {
        title: transcript.slice(0, 32) + (transcript.length > 32 ? "…" : ""),
        body: transcript,
        action_items: [],
        tags: ["Voice Note"],
        summary: "Spoken note",
      },
      warning: `AI note structuring could not complete (${msg}). Raw transcription preserved.`,
    });
  }
}
