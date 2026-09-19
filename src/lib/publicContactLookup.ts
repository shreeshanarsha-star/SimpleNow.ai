// Public contact lookup for the Smart Source LinkedIn Chrome extension.
// Given a candidate's name/company/profile URL, runs one general web search
// (reusing the same SerpApi key already used by Smart Source's candidate
// search) and asks the model to pull out an email or phone number ONLY if
// it appears verbatim in a public search snippet -- never a guessed or
// pattern-constructed address (e.g. first.last@company.com). That keeps
// this a "surface what's already public" feature, not a people-search /
// data-enrichment guess, which matters both for accuracy and because this
// is third-party (candidate) data, not the recruiter's own.
//
// Same conventions as lib/smartSourceAI.ts: raw SerpApi fetch, same
// JSON-fence-stripped model call via lib/aiClient.

import { callTextModel, AI_TIMEOUT_MS } from "@/lib/aiClient";

function parseJsonResponse(text: string) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

export type PublicContactResult = {
  email: string | null;
  phone: string | null;
  source_url: string | null;
  // Why nothing was found / attempted, for the popup's "no result" copy --
  // never shown as an error, just a reason.
  reason?: "not_configured" | "no_search_results" | "no_contact_found" | "search_failed";
};

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
// Loose international phone match -- 7-15 digits, allowing spaces/dashes/
// parens/leading +. Deliberately permissive since we only use it to
// sanity-check a model-extracted string, not to parse arbitrary text.
const PHONE_RE = /(\+?\d[\d\s().-]{6,}\d)/;

type SerpResult = { title: string; snippet: string; link: string };

async function searchGoogle(query: string): Promise<{ ok: true; results: SerpResult[] } | { ok: false; reason: string }> {
  const key = process.env.SERPAPI_KEY;
  if (!key) return { ok: false, reason: "not_configured" };

  const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&num=10&api_key=${encodeURIComponent(key)}`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return { ok: false, reason: "search_failed" };
  }
  if (!res.ok) return { ok: false, reason: "search_failed" };

  const data = await res.json().catch(() => null);
  if (!data || data.error) return { ok: false, reason: "search_failed" };

  const organic = (data.organic_results || []) as Array<{ title?: string; snippet?: string; link?: string }>;
  const results: SerpResult[] = organic
    .filter((r) => r.link)
    .slice(0, 8)
    .map((r) => ({ title: r.title || "", snippet: r.snippet || "", link: r.link as string }));

  return { ok: true, results };
}

const EXTRACT_PROMPT_HEADER = `You are given Google search result snippets about a person. Your ONLY job is to check whether an email address or phone number for THIS SPECIFIC PERSON already appears verbatim in the text below.

STRICT RULES:
- Only report a value if it is written out, character-for-character, in the snippets below. Never guess, infer, or construct one (e.g. never build "first.last@company.com" from a name and a company domain).
- If the snippets are about a different person with the same name, or don't contain a real contact detail, return nulls.
- If nothing qualifies, return nulls -- returning nothing is the correct, expected result most of the time.

Return JSON only (no markdown fences, no prose):
{
  "email": string or null (copied verbatim from the snippets),
  "phone": string or null (copied verbatim from the snippets),
  "source_url": string or null (the "link" value of whichever result the value came from)
}

Search snippets:
`;

export async function findPublicContact({
  name,
  company,
  profileUrl,
}: {
  name: string | null | undefined;
  company: string | null | undefined;
  profileUrl: string | null | undefined;
}): Promise<PublicContactResult> {
  const cleanName = (name || "").trim();
  if (!cleanName) return { email: null, phone: null, source_url: null, reason: "no_search_results" };
  if (!process.env.SERPAPI_KEY) return { email: null, phone: null, source_url: null, reason: "not_configured" };

  const query = company ? `"${cleanName}" "${company}" (email OR contact OR "@")` : `"${cleanName}" (email OR contact OR "@")`;

  const search = await searchGoogle(query);
  if (!search.ok) return { email: null, phone: null, source_url: null, reason: search.reason as PublicContactResult["reason"] };
  if (!search.results.length) return { email: null, phone: null, source_url: null, reason: "no_search_results" };

  const snippetBlock = search.results
    .map((r, i) => `[${i}] title: ${r.title}\n    snippet: ${r.snippet}\n    link: ${r.link}`)
    .join("\n\n");

  let raw: string;
  try {
    raw = await callTextModel(EXTRACT_PROMPT_HEADER + snippetBlock, 200, Math.min(AI_TIMEOUT_MS, 12_000));
  } catch {
    return { email: null, phone: null, source_url: null, reason: "search_failed" };
  }

  let parsed: { email?: unknown; phone?: unknown; source_url?: unknown };
  try {
    parsed = parseJsonResponse(raw);
  } catch {
    return { email: null, phone: null, source_url: null, reason: "no_contact_found" };
  }

  // Defense-in-depth: never trust the model's word alone. The value must
  // both look like a real email/phone AND actually appear verbatim
  // somewhere in the snippets we sent it -- otherwise treat it as not found.
  const haystack = snippetBlock.toLowerCase();
  let email: string | null = null;
  if (typeof parsed.email === "string" && EMAIL_RE.test(parsed.email) && haystack.includes(parsed.email.toLowerCase())) {
    email = parsed.email.match(EMAIL_RE)?.[0] || null;
  }
  let phone: string | null = null;
  if (typeof parsed.phone === "string" && PHONE_RE.test(parsed.phone) && haystack.includes(parsed.phone.toLowerCase())) {
    phone = parsed.phone.trim();
  }
  const sourceUrl =
    typeof parsed.source_url === "string" && search.results.some((r) => r.link === parsed.source_url)
      ? (parsed.source_url as string)
      : (email || phone ? search.results[0]?.link || null : null);

  if (!email && !phone) return { email: null, phone: null, source_url: null, reason: "no_contact_found" };
  return { email, phone, source_url: sourceUrl };
}
