import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/requireAdmin";

// AI calls get real time to think, but never hang the request indefinitely —
// explicit per-call timeout + a visible error the UI can show, never a
// silent empty result.
export const maxDuration = 30;
const REQUEST_TIMEOUT_MS = 25_000;

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch (res) {
    return res as Response;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY is not set on the server. AI polish is unavailable until it's configured.",
      },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const description =
    typeof body?.description === "string" ? body.description.trim() : "";
  const requirements =
    typeof body?.requirements === "string" ? body.requirements.trim() : "";

  if (!title || !description) {
    return NextResponse.json(
      { error: "title and description are required." },
      { status: 400 }
    );
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Model ID is configurable — set ANTHROPIC_MODEL in your environment to
  // the exact current identifier from https://docs.claude.com/en/docs/about-claude/models.
  // The fallback below was current as of this code being written; Anthropic
  // periodically retires old snapshot IDs, so don't assume it still works
  // without checking.
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";

  try {
    const message = await anthropic.messages.create(
      {
        model,
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              "You are helping an HR team polish a job posting draft into a clear, professional job description.",
              "Keep every factual detail the draft gives you (title, requirements, location, etc.) — do not invent responsibilities, salary, or benefits that weren't mentioned.",
              "Return plain text only: a short intro paragraph, then 'Responsibilities' and 'Requirements' sections as bullet lists using '-' markers. No markdown headers, no extra commentary.",
              "",
              `Job title: ${title}`,
              `Draft description: ${description}`,
              requirements ? `Draft requirements: ${requirements}` : "",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
      },
      { timeout: REQUEST_TIMEOUT_MS }
    );

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!text) {
      return NextResponse.json(
        { error: "The model returned an empty response. Try again." },
        { status: 502 }
      );
    }

    return NextResponse.json({ polished: text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `AI polish failed: ${message}` },
      { status: 502 }
    );
  }
}
