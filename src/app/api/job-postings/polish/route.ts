import { callTextModel } from "@/lib/aiClient";
import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";

// AI calls get real time to think, but never hang the request indefinitely —
// explicit per-call timeout + a visible error the UI can show, never a
// silent empty result.
export const maxDuration = 30;
const REQUEST_TIMEOUT_MS = 25_000;
const FEATURE_KEY = "Job Postings.ai";

export async function POST(request: Request) {
  try {
    await requireFeatureAccess(FEATURE_KEY);
  } catch (res) {
    return res as Response;
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      {
        error:
          "OPENAI_API_KEY is not set on the server. AI polish is unavailable until it's configured.",
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

  const prompt = [
    "You are helping an HR team polish a job posting draft into a clear, professional job description.",
    "Keep every factual detail the draft gives you (title, requirements, location, etc.) — do not invent responsibilities, salary, or benefits that weren't mentioned.",
    "Return plain text only: a short intro paragraph, then 'Responsibilities' and 'Requirements' sections as bullet lists using '-' markers. No markdown headers, no extra commentary.",
    "",
    `Job title: ${title}`,
    `Draft description: ${description}`,
    requirements ? `Draft requirements: ${requirements}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const text = await callTextModel(prompt, 1024, REQUEST_TIMEOUT_MS);
    return NextResponse.json({ polished: text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `AI polish failed: ${message}` },
      { status: 502 }
    );
  }
}
