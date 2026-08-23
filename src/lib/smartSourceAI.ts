import { callTextModel } from "@/lib/aiClient";
import type { SupabaseClient } from "@supabase/supabase-js";

// Shared JSON-fence stripper, same convention as lib/smartScreen.ts.
function parseJsonResponse(text: string) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

export type InputMode = "jd" | "describe" | "manual";

export type SearchCriteria = {
  role_title: string | null;
  company: string | null;
  location: string | null;
  skills: string[];
  min_experience_years: number | null;
  domain: string | null;
  keywords: string | null;
};

// --- Stage 1: extraction -----------------------------------------------
// Three input modes feed the same downstream shape so query-building and
// scoring never have to branch by how the recruiter described the role.
// "manual" mode skips the AI call entirely -- the recruiter already gave
// structured fields, so re-inferring them would only risk overwriting a
// deliberate choice with a guess.

const JD_EXTRACT_PROMPT = `Read this job description and extract, as JSON only (no markdown fences, no prose):
{
  "role_title": string or null,
  "company": string or null (the hiring company's name, only if explicitly named in the JD -- never the recruiter's own org),
  "location": string or null (city/region if mentioned),
  "skills": array of 3-6 short strings -- the most important technical/functional skills,
  "min_experience_years": number or null,
  "domain": string or null (industry/vertical, e.g. "animal feed additives", only if clearly implied),
  "keywords": string or null (one short extra phrase worth including in a search, if any stands out)
}
Never invent a company, location, or experience figure that isn't stated -- use null.`;

const DESCRIBE_EXTRACT_PROMPT = `A recruiter described, in their own words, the kind of candidate they're
looking for (not a formal job description). Read it and extract, as JSON only (no markdown fences, no prose):
{
  "role_title": string or null,
  "company": string or null (only if a specific target company was named),
  "location": string or null,
  "skills": array of 3-6 short strings,
  "min_experience_years": number or null (e.g. "6+ years" -> 6),
  "domain": string or null (industry/vertical, e.g. "feed additives and acidifiers"),
  "keywords": string or null (a distinctive phrase from the description worth searching on)
}
Never invent detail that isn't stated or clearly implied -- use null.`;

export async function extractSearchCriteria(mode: "jd" | "describe", text: string): Promise<SearchCriteria> {
  const prompt = mode === "jd" ? JD_EXTRACT_PROMPT : DESCRIBE_EXTRACT_PROMPT;
  const raw = await callTextModel(`${prompt}\n\n--- Input text ---\n${text}`, 600);
  const parsed = parseJsonResponse(raw);
  return {
    role_title: parsed.role_title ?? null,
    company: parsed.company ?? null,
    location: parsed.location ?? null,
    skills: Array.isArray(parsed.skills) ? parsed.skills : [],
    min_experience_years: parsed.min_experience_years ?? null,
    domain: parsed.domain ?? null,
    keywords: parsed.keywords ?? null,
  };
}

// --- Stage 2: X-ray query builder ---------------------------------------
// Fixed term order: company > role > location > skills > keywords/domain.
// Quote a term if it's 4 words or fewer (exact phrase), otherwise truncate
// to the first 4 words unquoted. Never shown/edited by the recruiter --
// they see the plain-language "AI understood this as" summary instead.

function addTerm(parts: string[], term: string | null | undefined) {
  if (!term) return;
  const words = String(term).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return;
  if (words.length <= 4) {
    parts.push(`"${words.join(" ")}"`);
  } else {
    parts.push(words.slice(0, 4).join(" "));
  }
}

export function buildSearchQuery(c: SearchCriteria): string {
  const parts = ["site:linkedin.com/in"];
  addTerm(parts, c.company);
  addTerm(parts, c.role_title);
  addTerm(parts, c.location);
  (c.skills || []).slice(0, 3).forEach((s) => addTerm(parts, s));
  addTerm(parts, c.keywords || c.domain);
  return parts.join(" ");
}

export function buildFallbackQueries(c: SearchCriteria): string[] {
  const queries: string[] = [];
  const primaryTerm = c.company || c.role_title || (c.skills || [])[0];
  if (!primaryTerm) return queries;

  const level1 = ["site:linkedin.com/in"];
  addTerm(level1, c.company);
  addTerm(level1, c.role_title);
  addTerm(level1, c.location);
  if (level1.length > 1) queries.push(level1.join(" "));

  const level2 = ["site:linkedin.com/in"];
  addTerm(level2, c.company);
  addTerm(level2, c.role_title);
  if (level2.length > 1) queries.push(level2.join(" "));

  const level3 = ["site:linkedin.com/in"];
  addTerm(level3, primaryTerm);
  queries.push(level3.join(" "));

  return queries;
}

// --- Stage 3: SerpApi search ---------------------------------------------

type RawResult = { title: string; snippet: string; link: string };
type SearchOutcome =
  | { ok: true; results: RawResult[]; rawCount: number }
  | { ok: false; reason: string; status?: number; detail?: string; results: [] };

async function searchSerpApi(query: string, { num = 100, start = 0 } = {}): Promise<SearchOutcome> {
  const key = process.env.SERPAPI_KEY;
  if (!key) return { ok: false, reason: "no_serpapi_key_configured", results: [] };

  const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&num=${num}&start=${start}&api_key=${encodeURIComponent(key)}`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    return { ok: false, reason: "serpapi_request_failed", detail: err instanceof Error ? err.message : String(err), results: [] };
  }
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    return { ok: false, reason: "serpapi_request_failed", status: res.status, detail: bodyText.slice(0, 300), results: [] };
  }
  const data = await res.json();
  if (data.error) {
    return { ok: false, reason: "serpapi_request_failed", status: 200, detail: data.error, results: [] };
  }
  const organicRaw = data.organic_results || [];
  const organic: RawResult[] = organicRaw
    .filter((r: { link?: string }) => r.link && r.link.includes("linkedin.com/in"))
    .map((r: { title: string; snippet?: string; link: string }) => ({ title: r.title, snippet: r.snippet || "", link: r.link }));
  return { ok: true, results: organic, rawCount: organicRaw.length };
}

const TARGET_RESULT_COUNT = 200;
const PAGE_COUNT = 2;

async function searchSerpApiMultiPage(query: string): Promise<SearchOutcome> {
  const pages = await Promise.all(
    Array.from({ length: PAGE_COUNT }, (_, page) => searchSerpApi(query, { num: 100, start: page * 100 }))
  );
  const firstFailed = pages.find((p) => !p.ok);
  if (firstFailed && !pages.some((p) => p.ok && p.results.length > 0)) return firstFailed;

  const seen = new Map<string, RawResult>();
  let rawCount = 0;
  for (const p of pages) {
    if (!p.ok) continue;
    rawCount += p.rawCount || 0;
    for (const r of p.results) {
      if (!seen.has(r.link)) seen.set(r.link, r);
    }
  }
  return { ok: true, results: Array.from(seen.values()).slice(0, TARGET_RESULT_COUNT), rawCount };
}

// Runs the primary query, then progressively broadens until a query
// returns at least one result or options run out.
export async function searchWithFallback(criteria: SearchCriteria): Promise<SearchOutcome & { queryUsed?: string }> {
  const primaryQuery = buildSearchQuery(criteria);
  let result = await searchSerpApiMultiPage(primaryQuery);
  if (!result.ok) return result;
  if (result.results.length > 0) return { ...result, queryUsed: primaryQuery };

  for (const q of buildFallbackQueries(criteria)) {
    const attempt = await searchSerpApiMultiPage(q);
    if (!attempt.ok) return attempt;
    if (attempt.results.length > 0) return { ...attempt, queryUsed: q };
    result = attempt;
  }
  return { ...result, queryUsed: primaryQuery };
}

// --- Stage 4: scoring + evaluation ----------------------------------------
// Replaces the old single-line match_reason with a structured evaluation
// (summary + strengths + unconfirmed gaps) so the UI can render an
// expandable "why this candidate" panel instead of one terse sentence.

export type ScoredCandidate = {
  name: string | null;
  designation: string | null;
  company: string | null;
  location: string | null;
  profile_url: string;
  match_score: number;
  qualification: string | null;
  current_ctc: string | null;
  expected_ctc: string | null;
  notice_period: string | null;
  experience_years: number | null;
  skills: string[];
  evaluation_summary: string;
  evaluation_strengths: string[];
  evaluation_gaps: string[];
};

const SCORE_PROMPT = `You're helping a recruiter source candidates from Google search results over public
LinkedIn profile pages. For each result (title + snippet + link), extract what you can and score how well
it matches the target role. Be honest -- most snippets are thin, so a low score for insufficient evidence
is correct and expected, not a failure. Search snippets rarely mention qualification, CTC, or notice
period -- leave those null rather than guessing.

For every candidate also produce a structured evaluation of why they're a fit:
- evaluation_summary: one or two sentences, specific to what's actually in the snippet, not generic praise.
- evaluation_strengths: array of short strings, concrete evidence-backed reasons this candidate fits
  (e.g. "5 years in talent acquisition at a similar-stage startup"). Empty array if the snippet gives
  nothing concrete.
- evaluation_gaps: array of short strings, things that are unconfirmed or missing from the snippet
  (e.g. "No Bengaluru signal in the snippet", "Skills not visible from title alone") -- phrase these as
  "unconfirmed," never as a confirmed negative, since a thin snippet is absence of evidence, not evidence
  of absence.

Respond as JSON only: { "candidates": [
  { "name": string or null, "designation": string or null, "company": string or null,
    "location": string or null, "profile_url": string, "match_score": integer 0-100,
    "qualification": string or null, "current_ctc": string or null, "expected_ctc": string or null,
    "notice_period": string or null, "experience_years": number or null, "skills": array of strings,
    "evaluation_summary": string, "evaluation_strengths": array of strings, "evaluation_gaps": array of strings }
] }`;

// Smaller than a plain match-score batch would need -- each candidate now
// carries a structured evaluation (summary + strengths + gaps), which
// roughly doubles output tokens per candidate versus a single-line
// match_reason, so a smaller batch keeps each call comfortably inside
// its timeout instead of risking a large batch getting cut off.
const SCORE_BATCH_SIZE = 15;

async function scoreBatch(batch: RawResult[], criteria: SearchCriteria): Promise<ScoredCandidate[]> {
  const context = `Target company: ${criteria.company || "not specified"}
Target role: ${criteria.role_title || "not specified"}
Target skills: ${(criteria.skills || []).join(", ") || "not specified"}
Target location: ${criteria.location || "not specified"}
Target minimum experience: ${criteria.min_experience_years ?? "not specified"}
Target domain: ${criteria.domain || "not specified"}

--- Search results ---
${batch.map((r, i) => `${i + 1}. Title: ${r.title}\nSnippet: ${r.snippet || ""}\nLink: ${r.link}`).join("\n\n")}`;

  // 45s, not the default 25s -- a 15-candidate batch with full evaluations
  // (summary + strengths + gaps each) is a large structured completion and
  // routinely needs more than the default budget; the route's maxDuration
  // (90s) has headroom for this since batches run concurrently, not in series.
  const raw = await callTextModel(`${SCORE_PROMPT}\n\n${context}`, 4000, 45_000);
  const parsed = parseJsonResponse(raw);
  return parsed.candidates || [];
}

export async function scoreResults(results: RawResult[], criteria: SearchCriteria): Promise<ScoredCandidate[]> {
  if (!results.length) return [];
  const batches: RawResult[][] = [];
  for (let i = 0; i < results.length; i += SCORE_BATCH_SIZE) {
    batches.push(results.slice(i, i + SCORE_BATCH_SIZE));
  }
  const batchResults = await Promise.all(batches.map((b) => scoreBatch(b, criteria)));
  const merged = batchResults.flat();
  return merged.sort((a, b) => (b.match_score || 0) - (a.match_score || 0));
}

// --- Stage 5: internal database cross-match --------------------------------
// "View CV" is only offered when the candidate cross-matches a record the
// org already has in its own database (talent_people), never a third-party
// premium DB. Matched by LinkedIn URL first (exact, cheap), falling back to
// a normalized name+company match when no LinkedIn URL overlap exists.

export type InternalMatch = {
  profile_url: string;
  internal_person_id: string;
  already_in_pipeline: boolean;
};

function normalize(s: string | null | undefined): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function crossMatchInternal(
  supabase: SupabaseClient,
  orgId: string,
  candidates: ScoredCandidate[]
): Promise<InternalMatch[]> {
  const { data: people } = await supabase
    .from("talent_people")
    .select("id, name, current_company, linkedin_url")
    .eq("org_id", orgId);
  if (!people || !people.length) return [];

  const byLinkedIn = new Map<string, { id: string }>();
  const byNameCompany = new Map<string, { id: string }>();
  for (const p of people as { id: string; name: string | null; current_company: string | null; linkedin_url: string | null }[]) {
    if (p.linkedin_url) byLinkedIn.set(p.linkedin_url.split("?")[0].replace(/\/$/, ""), { id: p.id });
    if (p.name) byNameCompany.set(`${normalize(p.name)}|${normalize(p.current_company)}`, { id: p.id });
  }

  const personIds = candidates
    .map((c) => {
      const cleanUrl = c.profile_url?.split("?")[0]?.replace(/\/$/, "");
      const direct = cleanUrl ? byLinkedIn.get(cleanUrl) : undefined;
      if (direct) return { profile_url: c.profile_url, internal_person_id: direct.id };
      const byName = byNameCompany.get(`${normalize(c.name)}|${normalize(c.company)}`);
      if (byName && c.name) return { profile_url: c.profile_url, internal_person_id: byName.id };
      return null;
    })
    .filter((x): x is { profile_url: string; internal_person_id: string } => !!x);

  if (!personIds.length) return [];

  const ids = Array.from(new Set(personIds.map((p) => p.internal_person_id)));
  const { data: candidateRows } = await supabase
    .from("talent_candidates")
    .select("person_id")
    .in("person_id", ids);
  const inPipeline = new Set((candidateRows || []).map((r: { person_id: string }) => r.person_id));

  return personIds.map((p) => ({
    ...p,
    already_in_pipeline: inPipeline.has(p.internal_person_id),
  }));
}
