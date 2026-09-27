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
//
// Alongside the 5 prose lines, the SAME model call also returns a
// "structured" block -- machine-readable versions of the same estimates
// (graduation year, current age, total experience, CTC current/expected,
// notice period) so the extension's side panel can auto-fill the
// Experience/CTC/Notice fields directly instead of making the recruiter
// re-read prose and retype numbers. One call produces both -- no extra
// model round-trip, no extra market-rate search.

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

export type StructuredEstimate = {
  graduation_year: number | null;
  estimated_age: number | null;
  experience_years: number | null;
  ctc_current_estimate: string | null;
  ctc_expected_estimate: string | null;
  notice_period_estimate: string | null;
};

export type SummaryResult = {
  lines: string[];
  structured: StructuredEstimate | null;
};

function parseJsonResponse(text: string): unknown {
  const cleaned = text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

const SUMMARY_PROMPT_HEADER = `You are helping a recruiter quickly triage a candidate. Using ONLY the profile information and market-data snippets below, return a single JSON object (no markdown, no prose outside the JSON) shaped exactly like this:

{
  "lines": [ <exactly 5 strings, one per line below> ],
  "structured": {
    "graduation_year": <number or null -- the year they most likely finished their highest degree, from the profile/resume text if visible, else your best estimate from career-start year minus ~0-1 years, else null>,
    "estimated_age": <number or null -- their approximate current age. Estimate the graduation year (or, if unclear, assume graduation around age 22 for a bachelor's / 24 for a master's) and add years to reach the current year given below. Always your best estimate, never null if ANY career history is visible>,
    "experience_years": <number or null -- total years from their earliest career-start year (first job / graduation, whichever is visible) to the current year given below. Use fractional years if helpful (e.g. 7.5)>,
    "ctc_current_estimate": <string or null -- e.g. "18-22 LPA" -- an estimated CURRENT compensation range for their current/most recent role, company, seniority, and location, based on the market-data snippets below or general knowledge if none are given>,
    "ctc_expected_estimate": <string or null -- an estimated EXPECTED compensation range if they were to move roles now (typically 20-40% above current CTC for a lateral/upward move at this seniority) -- same units as ctc_current_estimate>,
    "notice_period_estimate": <string or null -- e.g. "60-90 days" -- the typical notice period for someone at this seniority, company type (startup vs large enterprise), and location/industry, based on general knowledge of standard notice periods>
  }
}

Lines (exactly 5, each 1-2 sentences, as plain strings -- no markdown, no numbering, the caller numbers them):
Line 1: Location, an approximate age (state it as an estimate, e.g. "~34", never a stated fact), total years of experience (estimate from the earliest role or graduation year if exact dates aren't given), and highest qualification in shorthand (e.g. "B.Tech + MBA"). If any single part genuinely can't be estimated, write "unknown" for just that part rather than dropping the whole line.
Line 2: The person's main area of expertise across their whole career, and which industry that falls in.
Line 3: Job stability -- average tenure per role in years, and the approximate number of job changes across their career.
Line 4: Any visible career gaps or other red flags (very short stints, unexplained gaps, frequent lateral moves). If nothing stands out, say so plainly rather than inventing a concern.
Line 5: An approximate CTC (compensation) range for this role at this company / in this industry and location, based on the market-data snippets below (or general knowledge if none are provided). Always caveat it explicitly as an estimate, e.g. "Est. ~18-24 LPA based on market data -- not confirmed."

Rules for BOTH the lines and the structured block: never invent specific employers, dates, or figures that aren't supported by the text below -- when genuinely unsure, give your single best good-faith estimate rather than refusing, but phrase prose lines as estimates. Numeric structured fields should be your best-effort number, not null, whenever there is at least a company/role/seniority to reason from -- only use null when there is truly nothing to go on (e.g. no name, no role, no text at all).

Return ONLY the JSON object described above, nothing else.

`;

export async function summarizeCandidateProfile(input: SummaryInput): Promise<SummaryResult> {
  const parts: string[] = [];
  const currentYear = new Date().getFullYear();
  parts.push(`Current year: ${currentYear}`);
  if (input.name) parts.push(`Name: ${input.name}`);
  if (input.designation) parts.push(`Current/most recent role: ${input.designation}`);
  if (input.company) parts.push(`Current/most recent company: ${input.company}`);
  if (input.location) parts.push(`Location: ${input.location}`);
  if (typeof input.experience_years === "number") parts.push(`Estimated total experience so far (years): ${input.experience_years}`);
  if (input.qualification) parts.push(`Qualification on file: ${input.qualification}`);
  if (input.raw_text) {
    parts.push(
      `Profile / resume text (may include fuller experience & education history -- use it for lines 1-4 and for the structured estimates):\n${input.raw_text.slice(0, 6000)}`
    );
  }
  if (parts.length <= 1) {
    // Only "Current year" -- nothing about the candidate at all.
    throw new Error("Not enough profile information to summarize yet.");
  }

  // Best-effort CTC market-data search -- same SerpApi + snippet pattern as
  // the public contact lookup. A missing key or failed search just means
  // the CTC lines/fields fall back to the model's own general knowledge.
  let ctcBlock = "";
  if (process.env.SERPAPI_KEY && (input.designation || input.company)) {
    const query = [input.designation, input.company, input.location, "salary CTC"].filter(Boolean).join(" ");
    try {
      const search = await searchGoogle(query);
      if (search.ok && search.results.length) {
        ctcBlock =
          "\n\nMARKET-RATE SEARCH SNIPPETS (for CTC estimates only -- general market data, not necessarily about this exact person):\n" +
          search.results.slice(0, 5).map((r, i) => `[${i}] ${r.title}: ${r.snippet}`).join("\n");
      }
    } catch {
      // Search is best-effort -- fall through without it.
    }
  }

  const prompt = SUMMARY_PROMPT_HEADER + parts.join("\n") + ctcBlock;
  const raw = await callTextModel(prompt, 700, Math.min(AI_TIMEOUT_MS, 20_000));

  let parsed: unknown;
  try {
    parsed = parseJsonResponse(raw);
  } catch {
    parsed = null;
  }

  let lines: unknown;
  let structuredRaw: unknown = null;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && "lines" in (parsed as Record<string, unknown>)) {
    lines = (parsed as Record<string, unknown>).lines;
    structuredRaw = (parsed as Record<string, unknown>).structured ?? null;
  } else if (Array.isArray(parsed)) {
    // Backward-compatible fallback: model returned the old bare-array shape.
    lines = parsed;
  } else {
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

  let structured: StructuredEstimate | null = null;
  if (structuredRaw && typeof structuredRaw === "object") {
    const s = structuredRaw as Record<string, unknown>;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    structured = {
      graduation_year: num(s.graduation_year),
      estimated_age: num(s.estimated_age),
      experience_years: num(s.experience_years),
      ctc_current_estimate: str(s.ctc_current_estimate),
      ctc_expected_estimate: str(s.ctc_expected_estimate),
      notice_period_estimate: str(s.notice_period_estimate),
    };
    // Nothing usable at all -- treat as absent rather than an all-null object.
    if (Object.values(structured).every((v) => v === null)) structured = null;
  }

  return { lines: cleaned, structured };
}
