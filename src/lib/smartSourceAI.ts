import { callTextModel } from "@/lib/aiClient";
import type { SupabaseClient } from "@supabase/supabase-js";

// Shared JSON-fence stripper, same convention as lib/smartScreen.ts.
function parseJsonResponse(text: string) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

export type InputMode = "jd" | "describe" | "manual";

export type SearchCriteria = {
  candidate_name?: string | null;
  role_title: string | null;
  company: string | null;
  target_companies?: string[] | null;
  exclude_companies?: string[] | null;
  location: string | null;
  skills: string[];
  min_experience_years: number | null;
  domain: string | null;
  keywords: string | null;
  lookalike_source?: string | null;
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
  "target_companies": array of strings or null (competitor companies mentioned to target or poach from, if any),
  "exclude_companies": array of strings or null (companies explicitly mentioned as off-limits, if any),
  "location": string or null (city/region if mentioned),
  "skills": array of 2-5 short strings -- the most important technical/functional skills,
  "min_experience_years": number or null,
  "domain": string or null (industry/vertical, e.g. "animal feed additives", only if clearly implied),
  "keywords": string or null (one short extra phrase worth including in a search, if any stands out)
}
CRITICAL RULES:
- "role_title": Standard professional job title only. Never include conversational filler like "candidate", "person", "looking for".
- "location": Clean city, state, or country name only.
- Never invent a company, location, or experience figure that isn't stated -- use null.`;

const DESCRIBE_EXTRACT_PROMPT = `A recruiter described who or what they're looking for on LinkedIn.
Read it, understand their intent, correct any obvious typos or informal spelling, and extract, as JSON only (no markdown fences, no prose):
{
  "candidate_name": string or null (if the query searches for or mentions a specific person's name, e.g. "search for riddhi ramesh from linkedin" -> "Riddhi Ramesh", "find John Doe" -> "John Doe", "riddhi ramesh" -> "Riddhi Ramesh", otherwise null),
  "role_title": string or null (clean standard professional job title e.g. "Sales Representative", "Software Engineer"),
  "company": string or null (target hiring or current company if named),
  "target_companies": array of strings or null (specific companies to target/poach from, e.g. "from Google, Meta or Microsoft" -> ["Google", "Meta", "Microsoft"], "from Razorpay or Swiggy" -> ["Razorpay", "Swiggy"]),
  "exclude_companies": array of strings or null (companies to exclude/off-limits, e.g. "not from TCS or Infosys" -> ["TCS", "Infosys"]),
  "location": string or null (clean city/country/region),
  "skills": array of 2-5 short strings (skills or product specialties),
  "min_experience_years": number or null,
  "domain": string or null (industry/vertical, e.g. "feed additives"),
  "keywords": string or null
}
CRITICAL EXTRACTION RULES:
- "candidate_name": If the user query is or contains a specific person's name (e.g. "search for riddhi ramesh from linkedin" -> "Riddhi Ramesh", "find John Doe" -> "John Doe", "riddhi ramesh" -> "Riddhi Ramesh"), extract that name!
- "role_title": Use a clean, standard professional job title. NEVER include conversational filler words like "candidate", "candidates", "candidateds", "guy", "guys", "person", "people", "someone", "profile", "need", "looking for", "search for".
- "target_companies": Extract target competitor organizations when specified (e.g., "poach from Stripe, Adyen" -> ["Stripe", "Adyen"]).
- "exclude_companies": Extract excluded organizations when specified.
- Strip platform references like "from linkedin", "on linkedin", "in linkedin", "profiles".
- Fix typos and informal phrasing (e.g., "seel" -> "sell" / ignore, "candidateds" -> ignore).
- "location": Clean city, state, or country name only (e.g., "Mexico"). Strip conversational filler like "or around region", "remote or", etc.
- Never invent details that aren't stated or clearly implied -- use null.`;

export function cleanRoleTitle(title: string | null | undefined): string | null {
  if (!title) return null;
  const cleaned = String(title)
    .replace(/\b(candidate|candidates|candidateds|guy|guys|person|people|someone|profile|profiles|individual|individuals)\b/gi, "")
    .replace(/\b(or|and)\s*$/gi, "")
    .replace(/^\s*(or|and)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || null;
}

export function cleanLocation(loc: string | null | undefined): string | null {
  if (!loc) return null;
  const cleaned = String(loc)
    .replace(/\b(or\s+around\s+region|and\s+surrounding|surrounding\s+region|or\s+nearby|area|region|anywhere\s+in)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || null;
}

export function extractCandidateNameFallback(text: string): string | null {
  if (!text) return null;
  const cleaned = text
    .replace(/\b(search\s+for|find|look\s+for|show\s+me|get\s+me)\b/gi, "")
    .replace(/\b(from\s+linkedin|on\s+linkedin|in\s+linkedin|profiles?|linkedin)\b/gi, "")
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 1 && words.length <= 4 && !/[,;:|]/.test(cleaned)) {
    return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }
  return null;
}

export async function extractSearchCriteria(mode: "jd" | "describe", text: string): Promise<SearchCriteria> {
  const prompt = mode === "jd" ? JD_EXTRACT_PROMPT : DESCRIBE_EXTRACT_PROMPT;
  const raw = await callTextModel(`${prompt}\n\n--- Input text ---\n${text}`, 600);
  const parsed = parseJsonResponse(raw);

  let candidateName = parsed.candidate_name ? String(parsed.candidate_name).trim() : null;
  const roleTitle = cleanRoleTitle(parsed.role_title);
  const company = parsed.company ?? null;
  const skills = Array.isArray(parsed.skills) ? parsed.skills.filter(Boolean) : [];

  // Fallback: if no name, role, company or skills were extracted, check if the input is a direct name query
  if (!candidateName && !roleTitle && !company && skills.length === 0 && mode === "describe") {
    candidateName = extractCandidateNameFallback(text);
  }

  const targetCompanies = Array.isArray(parsed.target_companies)
    ? parsed.target_companies.map(String).map((s: string) => s.trim()).filter(Boolean)
    : null;
  const excludeCompanies = Array.isArray(parsed.exclude_companies)
    ? parsed.exclude_companies.map(String).map((s: string) => s.trim()).filter(Boolean)
    : null;

  return {
    candidate_name: candidateName,
    role_title: roleTitle,
    company,
    target_companies: targetCompanies,
    exclude_companies: excludeCompanies,
    location: cleanLocation(parsed.location),
    skills,
    min_experience_years: parsed.min_experience_years ?? null,
    domain: parsed.domain ?? null,
    keywords: parsed.keywords ?? null,
  };
}

// --- Stage 2: X-ray query builder ---------------------------------------
// Fixed term order: name > company > role > location > skills > keywords/domain.
// Terms like skills or exact phrases (2-4 words) are quoted when specified.
// Generic roles and locations remain unquoted so Google can do stemming and flexible ranking.

function addTerm(parts: string[], term: string | null | undefined, quoteMultiWord = false) {
  if (!term) return;
  const cleaned = String(term).replace(/^["']|["']$/g, "").trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (!words.length) return;

  // Multi-word phrases (2-4 words) are quoted if quoteMultiWord is true (e.g. "feed additives")
  // Single words and general roles remain unquoted so Google can match related terms and variations
  const queryChunk = quoteMultiWord && words.length > 1 && words.length <= 4
    ? `"${words.join(" ")}"`
    : words.slice(0, 4).join(" ");

  const lowerChunk = queryChunk.toLowerCase();
  if (!parts.some((p) => p.toLowerCase() === lowerChunk)) {
    parts.push(queryChunk);
  }
}

function addCompanyFilters(parts: string[], targetCompanies?: string[] | null, excludeCompanies?: string[] | null) {
  if (Array.isArray(targetCompanies) && targetCompanies.length > 0) {
    const valid = targetCompanies.map((c) => c.replace(/^["']|["']$/g, "").trim()).filter(Boolean);
    if (valid.length === 1) {
      addTerm(parts, valid[0], true);
    } else if (valid.length > 1) {
      const orChunk = `(${valid.map((c) => `"${c}"`).join(" OR ")})`;
      parts.push(orChunk);
    }
  }
  if (Array.isArray(excludeCompanies) && excludeCompanies.length > 0) {
    for (const ec of excludeCompanies) {
      const clean = ec.replace(/^["'-]|["']$/g, "").trim();
      if (clean) {
        parts.push(`-"${clean}"`);
      }
    }
  }
}

export function buildSearchQuery(c: SearchCriteria): string {
  const parts = ["site:linkedin.com/in"];
  if (c.candidate_name) {
    addTerm(parts, c.candidate_name, true);
  }
  if (c.company && !(c.target_companies || []).length) {
    addTerm(parts, c.company);
  }
  addCompanyFilters(parts, c.target_companies, c.exclude_companies);
  addTerm(parts, c.role_title, false);
  addTerm(parts, c.location, false);
  (c.skills || []).slice(0, 2).forEach((s) => addTerm(parts, s, true));
  if (c.domain && c.domain.toLowerCase() !== (c.role_title || "").toLowerCase()) {
    addTerm(parts, c.domain, true);
  }
  return parts.join(" ");
}

export function buildFallbackQueries(c: SearchCriteria): string[] {
  const queries: string[] = [];
  const primaryRole = c.role_title;
  const name = c.candidate_name;
  // Deduplicate and filter skills that are identical to role_title
  const skills = (c.skills || []).filter(
    (s) => s.toLowerCase() !== (primaryRole || "").toLowerCase()
  );
  const topSkill = skills[0] || c.domain;
  const location = c.location;
  const company = c.company;
  const targetCompanies = c.target_companies;
  const excludeCompanies = c.exclude_companies;

  const candidates: string[] = [];

  // When searching for a specific candidate by name:
  if (name) {
    if (company || primaryRole || location || (targetCompanies || []).length) {
      const fb1 = ["site:linkedin.com/in"];
      addTerm(fb1, name, true);
      if (!(targetCompanies || []).length) addTerm(fb1, company);
      addCompanyFilters(fb1, targetCompanies, excludeCompanies);
      addTerm(fb1, location, false);
      if (fb1.length > 1) candidates.push(fb1.join(" "));
    }
    // Name alone (exact phrase)
    const fbNameExact = ["site:linkedin.com/in"];
    addTerm(fbNameExact, name, true);
    candidates.push(fbNameExact.join(" "));

    // Name unquoted (allows middle names / initial variations)
    const fbNameFlex = ["site:linkedin.com/in"];
    addTerm(fbNameFlex, name, false);
    candidates.push(fbNameFlex.join(" "));
  } else {
    // Fallback 1: Company / Target Companies + Role + Location + top skill
    if (skills.length > 1) {
      const fb1 = ["site:linkedin.com/in"];
      if (!(targetCompanies || []).length) addTerm(fb1, company);
      addCompanyFilters(fb1, targetCompanies, excludeCompanies);
      addTerm(fb1, primaryRole, false);
      addTerm(fb1, location, false);
      addTerm(fb1, topSkill, true);
      if (fb1.length > 1) candidates.push(fb1.join(" "));
    }

    // Fallback 2: Role + top skill (drop location in case profiles don't state location explicitly)
    if (primaryRole && topSkill) {
      const fb2 = ["site:linkedin.com/in"];
      if (!(targetCompanies || []).length) addTerm(fb2, company);
      addCompanyFilters(fb2, targetCompanies, excludeCompanies);
      addTerm(fb2, primaryRole, false);
      addTerm(fb2, topSkill, true);
      if (fb2.length > 1) candidates.push(fb2.join(" "));
    }

    // Fallback 3: Location + top skill (drop role -- captures domain specialists with varying job titles)
    if (location && topSkill) {
      const fb3 = ["site:linkedin.com/in"];
      addCompanyFilters(fb3, targetCompanies, excludeCompanies);
      addTerm(fb3, location, false);
      addTerm(fb3, topSkill, true);
      if (fb3.length > 1) candidates.push(fb3.join(" "));
    }

    // Fallback 4: Role + Location (drop all skills)
    if (primaryRole && location) {
      const fb4 = ["site:linkedin.com/in"];
      if (!(targetCompanies || []).length) addTerm(fb4, company);
      addCompanyFilters(fb4, targetCompanies, excludeCompanies);
      addTerm(fb4, primaryRole, false);
      addTerm(fb4, location, false);
      if (fb4.length > 1) candidates.push(fb4.join(" "));
    }

    // Fallback 5: Top skill alone (niche domain specialists)
    if (topSkill) {
      const fb5 = ["site:linkedin.com/in"];
      addCompanyFilters(fb5, targetCompanies, excludeCompanies);
      addTerm(fb5, topSkill, true);
      if (fb5.length > 1) candidates.push(fb5.join(" "));
    }

    // Fallback 6: Role alone
    if (primaryRole) {
      const fb6 = ["site:linkedin.com/in"];
      addCompanyFilters(fb6, targetCompanies, excludeCompanies);
      addTerm(fb6, primaryRole, false);
      if (fb6.length > 1) candidates.push(fb6.join(" "));
    }
  }

  // Deduplicate queries
  const seen = new Set<string>();
  for (const q of candidates) {
    if (!seen.has(q)) {
      seen.add(q);
      queries.push(q);
    }
  }

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
    const errorStr = typeof data.error === "string" ? data.error : JSON.stringify(data.error);
    // SerpApi returns "Google hasn't returned any results for this query." when Google finds 0 matches.
    // This is a normal empty search result, NOT a fatal API failure.
    if (
      errorStr.toLowerCase().includes("hasn't returned any results") ||
      errorStr.toLowerCase().includes("no results") ||
      data.search_information?.organic_results_state === "Fully empty"
    ) {
      return { ok: true, results: [], rawCount: 0 };
    }
    return { ok: false, reason: "serpapi_request_failed", status: 200, detail: errorStr, results: [] };
  }
  const organicRaw = data.organic_results || [];
  const organic: RawResult[] = organicRaw
    .filter((r: { link?: string }) => r.link && r.link.includes("linkedin.com/in"))
    .map((r: { title: string; snippet?: string; link: string }) => ({ title: r.title, snippet: r.snippet || "", link: r.link }));
  return { ok: true, results: organic, rawCount: organicRaw.length };
}

const TARGET_RESULT_COUNT = 60;
const PAGE_COUNT = 1;

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
  if (result.ok && result.results.length > 0) return { ...result, queryUsed: primaryQuery };

  const fallbacks = buildFallbackQueries(criteria);
  for (const q of fallbacks) {
    if (q === primaryQuery) continue;
    const attempt = await searchSerpApiMultiPage(q);
    if (attempt.ok && attempt.results.length > 0) return { ...attempt, queryUsed: q };
    if (attempt.ok) result = attempt;
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
it matches the target role or named person. If a target candidate name is given, candidates matching that name should be scored high (90-100).
If target competitor companies are specified, candidates currently or previously at those target companies should receive a score bonus (+5 to +15 points) and have that explicitly highlighted in evaluation_strengths (e.g. "Works at targeted competitor: [Company]"). Any candidates from excluded companies should be penalized or scored very low.
Be honest -- most snippets are thin, so a low score for insufficient evidence is correct and expected, not a failure. Search snippets rarely mention qualification, CTC, or notice
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
const MAX_CANDIDATES_TO_SCORE = 30;

async function scoreBatch(batch: RawResult[], criteria: SearchCriteria): Promise<ScoredCandidate[]> {
  const context = `Target candidate name: ${criteria.candidate_name || "not specified"}
Target company: ${criteria.company || "not specified"}
Target competitor companies: ${(criteria.target_companies || []).join(", ") || "not specified"}
Excluded companies: ${(criteria.exclude_companies || []).join(", ") || "none"}
Target role: ${criteria.role_title || "not specified"}
Target skills: ${(criteria.skills || []).join(", ") || "not specified"}
Target location: ${criteria.location || "not specified"}
Target minimum experience: ${criteria.min_experience_years ?? "not specified"}
Target domain: ${criteria.domain || "not specified"}
${criteria.lookalike_source ? `Sourcing lookalike candidates similar to: ${criteria.lookalike_source}` : ""}

--- Search results ---
${batch.map((r, i) => `${i + 1}. Title: ${r.title}\nSnippet: ${r.snippet || ""}\nLink: ${r.link}`).join("\n\n")}`;

  try {
    const raw = await callTextModel(`${SCORE_PROMPT}\n\n${context}`, 4000, 45_000);
    const parsed = parseJsonResponse(raw);
    if (Array.isArray(parsed?.candidates) && parsed.candidates.length > 0) {
      return parsed.candidates;
    }
  } catch (err) {
    console.warn("scoreBatch failed or timed out, using fallback extractor:", err);
  }

  // Graceful fallback if the AI completion times out or JSON parse fails:
  // Still extract candidates so the user sees search results instead of a 502 crash!
  return batch.map((r) => {
    const parts = r.title.replace(/\s*\|\s*LinkedIn$/i, "").split(/\s*[-–—]\s*/);
    const name = parts[0]?.trim() || criteria.candidate_name || null;
    const designation = parts[1]?.trim() || criteria.role_title || null;
    const company = parts[2]?.trim() || criteria.company || null;
    return {
      name,
      designation,
      company,
      location: criteria.location || null,
      profile_url: r.link,
      match_score: criteria.candidate_name ? 90 : 75,
      qualification: null,
      current_ctc: null,
      expected_ctc: null,
      notice_period: null,
      experience_years: null,
      skills: criteria.skills || [],
      evaluation_summary: r.snippet || "Public LinkedIn profile matching query criteria.",
      evaluation_strengths: [],
      evaluation_gaps: ["Detailed evaluation unconfirmed from snippet"],
    };
  });
}

export async function scoreResults(results: RawResult[], criteria: SearchCriteria): Promise<ScoredCandidate[]> {
  if (!results.length) return [];
  const candidateSlice = results.slice(0, MAX_CANDIDATES_TO_SCORE);
  const batches: RawResult[][] = [];
  for (let i = 0; i < candidateSlice.length; i += SCORE_BATCH_SIZE) {
    batches.push(candidateSlice.slice(i, i + SCORE_BATCH_SIZE));
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
  orgId: string | null | undefined,
  candidates: ScoredCandidate[]
): Promise<InternalMatch[]> {
  if (!orgId) return [];
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
