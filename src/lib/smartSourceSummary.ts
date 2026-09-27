// AI-generated 5-line candidate profile summary for Smart Source.ai --
// used both by the Chrome extension (before a candidate is even added, off
// whatever was scraped from LinkedIn) and by the web app (after adding, off
// whatever's saved on the candidate row: resume_text, LinkedIn scrape
// carried over at capture time, or nothing at all). Deliberately one shared
// function so both call sites produce the same shape and quality of
// output, and so there's one place to tune the prompt.
//
// Every line is explicitly an ESTIMATE, not a verified fact -- age is
// inferred from an assumed graduation age, experience from whatever dates
// are visible in the profile/resume text, and CTC from a best-effort
// market-rate web search (same SerpApi pattern as the public contact
// lookup). The prompt asks the model to say "unknown"/caveat rather than
// invent a confident-sounding wrong answer, but this is still AI output a
// recruiter should sanity-check, not something to act on blindly.

import { callTextModel, AI_TIMEOUT_MS } from "@/lib/aiClient";
import { searchGoogle } from "@/lib/publicContactLookup";

export type SummaryInput = {
  name: string | null;
  designation: string | null;
  company: string | null;
  location: string | null;
  experience_years: number | null;
  qualification: string | null;
  raw_text: string | null; // resume_text, or the extension's raw scraped LinkedIn text
};

function parseJsonArray(text: string): unknown {
  const cleaned = text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

const SUMMARY_PROMPT_HEADER = `You are helping a recruiter quickly triage a candidate. Using ONLY the profile information and market-data snippets below, produce a 5-line summary as a JSON array of exactly 5 strings (one string per line -- no markdown, no numbering, the caller numbers them):

Line 1: Location, an approximate age (estimate from a likely graduation year if one is visible -- always phrase it as an estimate, e.g. "~34", never a stated fact), total years of experience (estimate from the earliest role or graduation year if exact dates aren't given), and highest qualification in shorthand (e.g. "B.Tech + MBA"). If any single part genuinely can't be estimated, write "unknown" for just that part rather than dropping the whole line.
Line 2: The person's main area of expertise across their whole career, and which industry that falls in.
Line 3: Job stability -- average tenure per role in years, and the approximate number of job changes across their career.
Line 4: Any visible career gaps or other red flags (very short stints, unexplained gaps, frequent lateral moves). If nothing stands out, say so plainly rather than inventing a concern.
Line 5: An approximate CTC (compensation) range for this role at this company / in this industry and location, based on the market-data snippets below (or general knowledge if none are provided). Always caveat it explicitly as an estimate, e.g. "Est. ~18-24 LPA based on market data -- not confirmed."

Keep each line to 1-2 sentences. Never invent specific employers, dates, or figures that aren't supported by the text below -- when genuinely unsure, say so instead of guessing confidently.

Return ONLY a JSON array of exactly 5 strings, nothing else.

CANDIDATE PROFILE:
`;

export async function summarizeCandidateProfile(input: SummaryInput): Promise<string[]> {
  const parts: string[] = [];
  if (input.name) parts.push(`Name: ${input.name}`);
  if (input.designation) parts.push(`Current/most recent role: ${input.designation}`);
  if (input.company) parts.push(`Current/most recent company: ${input.company}`);
  if (input.location) parts.push(`Location: ${input.location}`);
  if (typeof input.experience_years === "number") parts.push(`Estimated total experience so far (years): ${input.experience_years}`);
  if (input.qualification) parts.push(`Qualification on file: ${input.qualification}`);
  if (input.raw_text) {
    parts.push(
      `Profile / resume text (may include fuller experience & education history -- use it for lines 1-4):\n${input.raw_text.slice(0, 6000)}`
    );
  }
  if (!parts.length) {
    throw new Error("Not enough profile information to summarize yet.");
  }

  // Best-effort CTC market-data search -- same SerpApi + snippet pattern as
  // the public contact lookup. A missing key or failed search just means
  // line 5 falls back to the model's own general knowledge.
  let ctcBlock = "";
  if (process.env.SERPAPI_KEY && (input.designation || input.company)) {
    const query = [input.designation, input.company, input.location, "salary CTC"].filter(Boolean).join(" ");
    try {
      const search = await searchGoogle(query);
      if (search.ok && search.results.length) {
        ctcBlock =
          "\n\nMARKET-RATE SEARCH SNIPPETS (for line 5 only -- general market data, not necessarily about this exact person):\n" +
          search.results.slice(0, 5).map((r, i) => `[${i}] ${r.title}: ${r.snippet}`).join("\n");
      }
    } catch {
      // Search is best-effort -- fall through without it.
    }
  }

  const prompt = SUMMARY_PROMPT_HEADER + parts.join("\n") + ctcBlock;
  const raw = await callTextModel(prompt, 550, Math.min(AI_TIMEOUT_MS, 20_000));

  let lines: unknown;
  try {
    lines = parseJsonArray(raw);
  } catch {
    // The model didn't return clean JSON -- fall back to treating its raw
    // text as newline-separated lines rather than failing outright.
    lines = raw
      .split("\n")
      .map((l) => l.replace(/^\d+[.)]\s*/, "").replace(/^[-*]\s*/, "").trim())
      .filter(Boolean);
  }
  if (!Array.isArray(lines)) throw new Error("The model didn't return a usable summary.");
  const cleaned = lines.map((l) => String(l || "").trim()).filter(Boolean).slice(0, 5);
  if (!cleaned.length) throw new Error("The model didn't return a usable summary.");
  return cleaned;
}
