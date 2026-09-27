// One-line AI Q&A about a specific candidate -- the "Ask about this
// candidate" box in Smart Source.ai's evaluation panel (e.g. "what's the
// turnover of the company he's currently at?", "what does he sell?",
// "how many employees does that company have?"). Mirrors
// smartSourceSummary.ts's pattern: profile/resume text goes straight to
// the model for anything about the person, and a live SerpApi search
// scoped to the candidate's current company backs up anything about the
// employer (revenue, headcount, products, industry) that the profile
// text itself wouldn't contain.
//
// The answer is always a single short line and is explicitly AI output
// from web-search snippets, not a verified fact -- the caller renders it
// with a caveat, same as the 5-line summary's CTC line. Not persisted
// (unlike ai_summary): every ask is a fresh call, scoped to whatever's
// already on the candidate row.

import { callTextModel, AI_TIMEOUT_MS } from "@/lib/aiClient";
import { searchGoogle } from "@/lib/publicContactLookup";

export type AskInput = {
  name: string | null;
  designation: string | null;
  company: string | null;
  location: string | null;
  experience_years: number | null;
  qualification: string | null;
  raw_text: string | null; // resume_text, or the extension's raw scraped LinkedIn text
  question: string;
};

const ASK_PROMPT_HEADER = `You are helping a recruiter get a quick answer to a specific question about a candidate. Answer ONLY the question below, in ONE short sentence (about 30 words max, no line breaks).

Use the candidate profile/resume text for anything about the person themselves (their role, what they've sold or built, their career history, their skills). Use the market/company search snippets (if provided) for facts about their current or most recent employer -- revenue, employee count, products, industry -- these are general web-search results, not verified financial filings, so phrase any numbers as approximate ("around", "roughly", "est."). If you genuinely don't have enough information to answer, say so plainly in one short line rather than guessing confidently.

Return ONLY the one-line answer as plain text -- no JSON, no markdown, no quotes, no preamble.
`;

export async function askAboutCandidate(input: AskInput): Promise<string> {
  const question = input.question.trim();
  if (!question) throw new Error("Ask a question first.");

  const parts: string[] = [];
  if (input.name) parts.push(`Name: ${input.name}`);
  if (input.designation) parts.push(`Current/most recent role: ${input.designation}`);
  if (input.company) parts.push(`Current/most recent company: ${input.company}`);
  if (input.location) parts.push(`Location: ${input.location}`);
  if (typeof input.experience_years === "number") parts.push(`Estimated total experience so far (years): ${input.experience_years}`);
  if (input.qualification) parts.push(`Qualification on file: ${input.qualification}`);
  if (input.raw_text) {
    parts.push(`Profile / resume text:\n${input.raw_text.slice(0, 6000)}`);
  }
  if (!parts.length) {
    throw new Error("Not enough profile information on file to answer questions about this candidate yet.");
  }

  // Best-effort live search scoped to the candidate's company -- covers
  // "what's their turnover", "how many employees", "what do they make"
  // style questions the profile text itself won't answer. Same SerpApi +
  // snippet pattern used for the 5-line summary's CTC line.
  let searchBlock = "";
  if (process.env.SERPAPI_KEY && input.company) {
    const query = `${input.company} ${question}`;
    try {
      const search = await searchGoogle(query);
      if (search.ok && search.results.length) {
        searchBlock =
          "\n\nMARKET / COMPANY SEARCH SNIPPETS (general web results about the company, not verified filings):\n" +
          search.results.slice(0, 5).map((r, i) => `[${i}] ${r.title}: ${r.snippet}`).join("\n");
      }
    } catch {
      // Search is best-effort -- fall through without it.
    }
  }

  const prompt = `${ASK_PROMPT_HEADER}\nQUESTION: ${question}\n\nCANDIDATE PROFILE:\n${parts.join("\n")}${searchBlock}`;
  const raw = await callTextModel(prompt, 180, Math.min(AI_TIMEOUT_MS, 20_000));

  const answer = raw.split("\n").map((l) => l.trim()).filter(Boolean)[0] || raw.trim();
  if (!answer) throw new Error("The model didn't return a usable answer.");
  return answer;
}
