import { callTextModel } from "@/lib/aiClient";

// Structures a raw JD into a listing. Ported from the old askshree-app
// repo's lib/aiScreen.js structureJD(). Deliberately exactly 3 must-have +
// 3 good-to-have skills (not 5) — kept short and forced-priority rather
// than a padded-out five.
const STRUCTURE_PROMPT = `You structure a raw job description into a listing for a job board.
Read the JD text and extract, as JSON only (no markdown fences, no prose):
{
  "title": string,
  "company": string,
  "company_url": string or null (only if explicitly present in the text, never invented),
  "location": string,
  "must_have_skills": array of exactly 3 short strings — the single most important, truly
    non-negotiable technical skills. If the JD lists more than 3, pick the 3 most critical.
    If it lists fewer, infer the most reasonable adjacent ones from context.
  "good_to_have_skills": array of exactly 3 short strings — same rule, for nice-to-haves.
  "qualification": string (one line — the required degree/qualification),
  "min_years_experience": number or null (minimum years of experience required, if stated
    or clearly implied — e.g. "5+ years" -> 5; leave null if genuinely not indicated),
  "industry": string or null (the industry/domain this role sits in, if the JD indicates one —
    e.g. "FMCG", "SaaS", "Healthcare"; null if not clear),
  "ctc_budget": string or null (compensation/budget for the role, only if explicitly stated in
    the JD text — never invented, null if not mentioned)
}
Never fabricate a company name, URL, or location that isn't in the text. If company_url truly
isn't present, use null.

--- Job description text ---
`;

export interface StructuredJD {
  title: string;
  company: string;
  company_url: string | null;
  location: string;
  must_have_skills: string[];
  good_to_have_skills: string[];
  qualification: string;
  min_years_experience: number | null;
  industry: string | null;
  ctc_budget: string | null;
}

export async function structureJD(jdText: string): Promise<StructuredJD> {
  const raw = await callTextModel(`${STRUCTURE_PROMPT}${jdText}`, 1200);
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned) as Partial<StructuredJD>;

  return {
    title: parsed.title || "Untitled role",
    company: parsed.company || "Confidential",
    company_url: parsed.company_url ?? null,
    location: parsed.location || "Not specified",
    must_have_skills: Array.isArray(parsed.must_have_skills) ? parsed.must_have_skills.slice(0, 3) : [],
    good_to_have_skills: Array.isArray(parsed.good_to_have_skills)
      ? parsed.good_to_have_skills.slice(0, 3)
      : [],
    qualification: parsed.qualification || "Not specified",
    min_years_experience:
      typeof parsed.min_years_experience === "number" ? parsed.min_years_experience : null,
    industry: parsed.industry ?? null,
    ctc_budget: parsed.ctc_budget ?? null,
  };
}
