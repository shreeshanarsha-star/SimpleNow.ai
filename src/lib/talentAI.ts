import Anthropic from "@anthropic-ai/sdk";

// Talent.AI's AI layer. Same pattern as lib/smartScreen.ts: explicit
// per-call timeout, model id from ANTHROPIC_MODEL, strict JSON-only
// output, never a silent empty result.
export const AI_TIMEOUT_MS = 25_000;

export function getAnthropic() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

export function getModel() {
  return process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";
}

function parseJsonResponse(text: string) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

async function callClaude(prompt: string, maxTokens: number): Promise<string> {
  const anthropic = getAnthropic();
  if (!anthropic) throw new Error("ANTHROPIC_API_KEY is not set on the server.");
  const message = await anthropic.messages.create(
    {
      model: getModel(),
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    },
    { timeout: AI_TIMEOUT_MS }
  );
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (!text) throw new Error("The model returned an empty response.");
  return text;
}

export type ParsedCandidate = {
  name: string | null;
  email: string | null;
  phone: string | null;
  current_company: string | null;
  current_designation: string | null;
  location: string | null;
  years_experience: number | null;
  key_skills: string[];
  summary: string;
  fit_notes: string | null;
};

// Turns a pasted resume into structured candidate fields so an interviewer
// never has to hand-type name/email/phone. When a requisition is supplied,
// also returns a short, evidence-based fit_notes line against that role —
// never a score here (Talent.AI keeps scoring in explicit scorecards, not
// a black-box number), just a factual read a human can act on.
const PARSE_PROMPT = `You extract structured candidate details from a raw resume/CV text for an ATS.
Respond as JSON only (no markdown fences, no prose):
{
  "name": string or null,
  "email": string or null,
  "phone": string or null,
  "current_company": string or null,
  "current_designation": string or null,
  "location": string or null,
  "years_experience": number or null,
  "key_skills": array of short strings (max 10),
  "summary": string (~40 words, factual, evidence-based),
  "fit_notes": string or null
}
Extract only what is explicitly present in the text -- never invent an email, phone number, company,
or figure that isn't stated. Never use age, date of birth, or any age-implying detail. If a
requisition context is given below, fill fit_notes with a short, specific, evidence-based read of
how this candidate's actual background matches or doesn't match it -- otherwise leave fit_notes null.`;

export async function parseResumeToCandidate(
  resumeText: string,
  requisitionContext?: string
): Promise<ParsedCandidate> {
  const context = requisitionContext
    ? `\n\n--- Requisition context ---\n${requisitionContext}`
    : "";
  const text = await callClaude(
    `${PARSE_PROMPT}${context}\n\n--- Resume text ---\n${resumeText}`,
    900
  );
  return parseJsonResponse(text);
}

export type PipelineSummary = {
  headline: string;
  stage_counts: Record<string, number>;
  bottleneck: string | null;
  standouts: string[];
  risks: string[];
};

// On-demand summary of a requisition's pipeline for a hiring manager who
// wants the state of play without opening every card. Grounded entirely in
// the candidate rows passed in -- never invents a candidate or figure.
const SUMMARY_PROMPT = `You summarize a hiring pipeline for a hiring manager, from real candidate
data only (JSON array of candidates, each with name, stage, rating, tags, days_in_stage).
Respond as JSON only (no markdown fences, no prose):
{
  "headline": string (~20 words, plain-language state of the pipeline),
  "bottleneck": string or null (~20 words, name the stage/issue if one stage is clearly stuck, else null),
  "standouts": array of up to 3 short strings naming specific candidates worth prioritizing, from the data given,
  "risks": array of up to 3 short strings -- specific candidates going stale (long days_in_stage) or gaps in the pipeline
}
Never invent a candidate, rating, or number not present in the data. If there isn't enough data for a
field, use null or an empty array rather than guessing.`;

export async function summarizePipeline(
  requisitionTitle: string,
  candidates: Array<{ name: string; stage: string; rating: number | null; tags: string[]; days_in_stage: number }>
): Promise<Omit<PipelineSummary, "stage_counts">> {
  const stageCounts: Record<string, number> = {};
  for (const c of candidates) stageCounts[c.stage] = (stageCounts[c.stage] || 0) + 1;

  const text = await callClaude(
    `${SUMMARY_PROMPT}\n\nRequisition: ${requisitionTitle}\nStage counts: ${JSON.stringify(
      stageCounts
    )}\nCandidates:\n${JSON.stringify(candidates)}`,
    600
  );
  return parseJsonResponse(text);
}
