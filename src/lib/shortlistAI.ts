import { callTextModel } from "@/lib/aiClient";
import { createHash } from "crypto";

// Shortlist.ai's AI layer. Same "strict JSON only, never invent a fact
// the source document doesn't state" discipline as talentAI.ts, reused
// deliberately rather than re-derived -- this is the same underlying
// problem (classify a document, extract structured recruiting fields,
// score a candidate against a role) at a Personal Tool scope instead of
// an org-wide ATS scope.
function parseJsonResponse(text: string) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

export function hashText(text: string): string {
  // Normalize whitespace before hashing so trivial re-saves of the same
  // JD/CV (different line endings, extra blank lines) still count as the
  // same document for duplicate detection.
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
  return createHash("sha256").update(normalized).digest("hex");
}

export function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}

// --- classification -------------------------------------------------
export type DocKind = "jd" | "cv" | "unknown";

const CLASSIFY_PROMPT = `You classify a recruiting document. Read the text and decide if it is:
- "jd": a job description / job posting / role requirement document (describes a role an employer is hiring for)
- "cv": a candidate resume / CV (describes one person's work history, skills, education)
- "unknown": neither of the above, or unreadable/too short to tell

Respond as JSON only (no markdown fences, no prose):
{ "kind": "jd" or "cv" or "unknown", "confidence": "high" or "medium" or "low", "reason": string (~10 words) }`;

export async function classifyDocument(text: string): Promise<{ kind: DocKind; confidence: string; reason: string }> {
  if (!text || text.trim().length < 30) {
    return { kind: "unknown", confidence: "low", reason: "Not enough readable text in this document." };
  }
  const snippet = text.slice(0, 6000);
  const raw = await callTextModel(`${CLASSIFY_PROMPT}\n\n--- Document text ---\n${snippet}`, 150);
  const parsed = parseJsonResponse(raw);
  const kind: DocKind = parsed.kind === "jd" || parsed.kind === "cv" ? parsed.kind : "unknown";
  return {
    kind,
    confidence: typeof parsed.confidence === "string" ? parsed.confidence : "low",
    reason: typeof parsed.reason === "string" ? parsed.reason : "",
  };
}

// --- JD extraction -------------------------------------------------
export type ExtractedJob = {
  title: string | null;
  company: string | null;
  job_ref: string | null;
  department: string | null;
  location: string | null;
  work_mode: string | null;
  experience_required: string | null;
  min_experience_years: number | null;
  qualification: string | null;
  required_skills: string[];
  preferred_skills: string[];
  industry: string | null;
  comp_min: number | null;
  comp_max: number | null;
  comp_currency: string | null;
  notice_period_requirement: string | null;
  other_requirements: string | null;
  role_summary: string;
};

const JD_EXTRACT_PROMPT = `You extract structured job/role details from a raw job description document for
a recruiting shortlist tool. Respond as JSON only (no markdown fences, no prose):
{
  "title": string or null,
  "company": string or null,
  "job_ref": string or null (a job/req ID or reference code, only if explicitly present),
  "department": string or null,
  "location": string or null,
  "work_mode": "remote" or "hybrid" or "onsite" or null,
  "experience_required": string or null (as stated, e.g. "5-8 years"),
  "min_experience_years": number or null,
  "qualification": string or null (minimum required degree/certification, only if explicitly stated),
  "required_skills": array of short strings (max 12, atomic industry terms, not sentence fragments),
  "preferred_skills": array of short strings (max 8, "nice to have" skills),
  "industry": string or null,
  "comp_min": number or null,
  "comp_max": number or null,
  "comp_currency": string or null (e.g. "INR", "USD" -- only if a figure is stated),
  "notice_period_requirement": string or null,
  "other_requirements": string or null (other non-negotiables not covered above),
  "role_summary": string (~40 words, factual, what the role actually does per the document)
}
Extract only what is explicitly stated -- never invent a location, comp figure, or requirement that isn't
written there. Do not estimate market-rate compensation. Use null/[] where information isn't present.`;

export async function extractJob(jdText: string): Promise<ExtractedJob> {
  const text = await callTextModel(`${JD_EXTRACT_PROMPT}\n\n--- Job description text ---\n${jdText.slice(0, 12000)}`, 900);
  const p = parseJsonResponse(text);
  return {
    title: p.title ?? null,
    company: p.company ?? null,
    job_ref: p.job_ref ?? null,
    department: p.department ?? null,
    location: p.location ?? null,
    work_mode: p.work_mode ?? null,
    experience_required: p.experience_required ?? null,
    min_experience_years: typeof p.min_experience_years === "number" ? p.min_experience_years : null,
    qualification: p.qualification ?? null,
    required_skills: Array.isArray(p.required_skills) ? p.required_skills.filter((s: unknown) => typeof s === "string") : [],
    preferred_skills: Array.isArray(p.preferred_skills) ? p.preferred_skills.filter((s: unknown) => typeof s === "string") : [],
    industry: p.industry ?? null,
    comp_min: typeof p.comp_min === "number" ? p.comp_min : null,
    comp_max: typeof p.comp_max === "number" ? p.comp_max : null,
    comp_currency: p.comp_currency ?? null,
    notice_period_requirement: p.notice_period_requirement ?? null,
    other_requirements: p.other_requirements ?? null,
    role_summary: typeof p.role_summary === "string" ? p.role_summary : "",
  };
}

// --- CV extraction -------------------------------------------------
export type ExtractedCandidate = {
  name: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  current_company: string | null;
  previous_companies: string[];
  total_experience_years: number | null;
  relevant_experience_years: number | null;
  qualification: string | null;
  skills: string[];
  location: string | null;
  preferred_location: string | null;
  current_compensation: string | null;
  expected_compensation: string | null;
  notice_period: string | null;
  summary: string;
};

const CV_EXTRACT_PROMPT = `You extract structured candidate details from a raw resume/CV text for a
recruiting shortlist tool. Respond as JSON only (no markdown fences, no prose):
{
  "name": string or null,
  "email": string or null,
  "phone": string or null,
  "linkedin_url": string or null,
  "current_company": string or null,
  "previous_companies": array of short strings (max 6, prior employers named in the resume),
  "total_experience_years": number or null,
  "relevant_experience_years": number or null (only if the resume itself distinguishes core/relevant vs total),
  "qualification": string or null (highest degree/certification stated),
  "skills": array of short strings (max 15),
  "location": string or null (current location),
  "preferred_location": string or null (only if explicitly stated),
  "current_compensation": string or null (only if explicitly stated),
  "expected_compensation": string or null (only if explicitly stated),
  "notice_period": string or null (only if explicitly stated),
  "summary": string (~40 words, factual, evidence-based)
}
Extract only what is explicitly present in the text -- never invent an email, phone number, company,
compensation figure, or notice period that isn't stated. Never use age, date of birth, or any
age-implying detail. Use null/[] for anything not present -- do not guess.`;

export async function extractCandidate(resumeText: string): Promise<ExtractedCandidate> {
  const text = await callTextModel(`${CV_EXTRACT_PROMPT}\n\n--- Resume text ---\n${resumeText.slice(0, 12000)}`, 900);
  const p = parseJsonResponse(text);
  return {
    name: p.name ?? null,
    email: p.email ?? null,
    phone: p.phone ?? null,
    linkedin_url: p.linkedin_url ?? null,
    current_company: p.current_company ?? null,
    previous_companies: Array.isArray(p.previous_companies) ? p.previous_companies.filter((s: unknown) => typeof s === "string") : [],
    total_experience_years: typeof p.total_experience_years === "number" ? p.total_experience_years : null,
    relevant_experience_years: typeof p.relevant_experience_years === "number" ? p.relevant_experience_years : null,
    qualification: p.qualification ?? null,
    skills: Array.isArray(p.skills) ? p.skills.filter((s: unknown) => typeof s === "string") : [],
    location: p.location ?? null,
    preferred_location: p.preferred_location ?? null,
    current_compensation: p.current_compensation ?? null,
    expected_compensation: p.expected_compensation ?? null,
    notice_period: p.notice_period ?? null,
    summary: typeof p.summary === "string" ? p.summary : "",
  };
}

// --- scoring -------------------------------------------------
export type ScoreDimension = { label: string; score: number; max: number };
export type MatchEvaluation = {
  overall_score: number;
  score_breakdown: ScoreDimension[];
  evaluation: string;
  strengths: string[];
  concerns: string[];
  missing_requirements: string[];
  matching_skills: string[];
};

// Fixed max weights, summing to 100 -- redistributed proportionally when a
// dimension has nothing to judge from (e.g. no comp range stated on the
// JD), same "never penalize missing data" rule talentAI.ts's criteria
// scorer uses. The exact weighting therefore adapts per JD, as the spec
// asks, without needing a bespoke prompt per JD.
const SCORE_PROMPT = `You are scoring how well one candidate matches a job, for a recruiter's shortlist
table. Score using these weighted dimensions (max points shown -- only include a dimension in your
scoring if the job description gives you something to judge it against; otherwise omit it from
score_breakdown entirely and the max points get redistributed proportionally across the rest so the
total still scales to 100):
- Skills match: up to 30 -- semantic relevance of the candidate's actual skills/experience to the
  required (and preferred) skills, judged by substance/synonym, not exact word match.
- Experience relevance: up to 25 -- years AND domain/seniority fit vs experience_required/min_experience_years.
- Industry/domain fit: up to 15.
- Qualification match: up to 10.
- Location fit: up to 10 -- match candidate location/preferred_location against job location/work_mode.
- Compensation fit: up to 5 -- candidate's expected_compensation against the job's comp range, if both given.
- Notice period fit: up to 5 -- candidate's notice_period against the job's requirement, if both given.
Never penalize a dimension for missing data -- omit it instead. Never invent candidate or job facts not
given below.

Respond as JSON only (no markdown fences, no prose):
{
  "score_breakdown": [ { "label": string, "score": number, "max": number }, ... ],
  "overall_score": number (0-100 integer, the weighted sum, rescaled to 100 if dimensions were omitted),
  "evaluation": string (~35 words, recruiter-friendly, cites specifics -- e.g. years of experience,
    named skills, the notice period -- not generic praise),
  "strengths": array of up to 4 short strings, each a specific factual strength,
  "concerns": array of up to 4 short strings, each a specific factual gap or risk,
  "missing_requirements": array of short strings -- required/must-have items from the job the resume
    shows no evidence of,
  "matching_skills": array of short strings -- required/preferred skills the resume does evidence
}`;

export async function scoreCandidateAgainstJob(
  job: {
    title: string | null;
    experience_required: string | null;
    min_experience_years: number | null;
    qualification: string | null;
    required_skills: string[];
    preferred_skills: string[];
    industry: string | null;
    location: string | null;
    work_mode: string | null;
    comp_min: number | null;
    comp_max: number | null;
    comp_currency: string | null;
    notice_period_requirement: string | null;
    other_requirements: string | null;
  },
  candidate: {
    total_experience_years: number | null;
    qualification: string | null;
    skills: string[];
    location: string | null;
    preferred_location: string | null;
    current_company: string | null;
    expected_compensation: string | null;
    notice_period: string | null;
    summary: string | null;
  },
  resumeText: string
): Promise<MatchEvaluation> {
  const context = `Job: ${job.title || "not specified"}
Experience required: ${job.experience_required || job.min_experience_years || "not specified"}
Qualification required: ${job.qualification || "not specified"}
Required skills: ${(job.required_skills || []).join(", ") || "none specified"}
Preferred skills: ${(job.preferred_skills || []).join(", ") || "none specified"}
Industry: ${job.industry || "not specified"}
Location / work mode: ${job.location || "not specified"} / ${job.work_mode || "not specified"}
Compensation range: ${job.comp_min ?? "?"}-${job.comp_max ?? "?"} ${job.comp_currency || ""}
Notice period requirement: ${job.notice_period_requirement || "not specified"}
Other requirements: ${job.other_requirements || "none stated"}

Candidate experience: ${candidate.total_experience_years ?? "not stated"} years
Candidate qualification: ${candidate.qualification || "not stated"}
Candidate skills: ${(candidate.skills || []).join(", ") || "none extracted"}
Candidate location / preferred location: ${candidate.location || "not stated"} / ${candidate.preferred_location || "not stated"}
Candidate current company: ${candidate.current_company || "not stated"}
Candidate expected compensation: ${candidate.expected_compensation || "not stated"}
Candidate notice period: ${candidate.notice_period || "not stated"}
Candidate summary: ${candidate.summary || ""}

--- Full resume text (for anything not captured above) ---
${resumeText.slice(0, 8000)}`;

  const text = await callTextModel(`${SCORE_PROMPT}\n\n${context}`, 900);
  const p = parseJsonResponse(text);
  const breakdown: ScoreDimension[] = Array.isArray(p.score_breakdown)
    ? p.score_breakdown
        .filter((d: unknown) => d && typeof d === "object")
        .map((d: { label?: unknown; score?: unknown; max?: unknown }) => ({
          label: typeof d.label === "string" ? d.label : "",
          score: Math.max(0, Math.round(Number(d.score) || 0)),
          max: Math.max(0, Math.round(Number(d.max) || 0)),
        }))
    : [];
  const overall = Math.max(0, Math.min(100, Math.round(Number(p.overall_score) || 0)));
  return {
    overall_score: overall,
    score_breakdown: breakdown,
    evaluation: typeof p.evaluation === "string" ? p.evaluation : "",
    strengths: Array.isArray(p.strengths) ? p.strengths.filter((s: unknown) => typeof s === "string") : [],
    concerns: Array.isArray(p.concerns) ? p.concerns.filter((s: unknown) => typeof s === "string") : [],
    missing_requirements: Array.isArray(p.missing_requirements) ? p.missing_requirements.filter((s: unknown) => typeof s === "string") : [],
    matching_skills: Array.isArray(p.matching_skills) ? p.matching_skills.filter((s: unknown) => typeof s === "string") : [],
  };
}

export function scoreLabel(score: number): string {
  if (score >= 80) return "Strong Match";
  if (score >= 60) return "Good Match";
  if (score >= 40) return "Partial Match";
  return "Weak Match";
}

// --- duplicate detection -------------------------------------------------
// Exact-content duplicate (same file re-uploaded) is caught upstream via
// resume_hash before any AI call runs. This catches the harder case: a
// DIFFERENT file (e.g. an updated resume) that's plausibly the same
// person, via shared identifiers -- never silently merged, just flagged
// for the recruiter to resolve (merge / keep separate / ignore).
export function findLikelyDuplicate<
  T extends { id: string; email: string | null; phone: string | null; linkedin_url: string | null; name: string | null }
>(candidate: { email: string | null; phone: string | null; linkedin_url: string | null; name: string | null }, existing: T[]): T | null {
  const norm = (s: string | null) => (s || "").trim().toLowerCase();
  const email = norm(candidate.email);
  const phone = (candidate.phone || "").replace(/[^\d]/g, "");
  const linkedin = norm(candidate.linkedin_url).replace(/\/+$/, "");
  const name = norm(candidate.name);

  for (const c of existing) {
    if (email && norm(c.email) === email) return c;
    if (phone && phone.length >= 7 && (c.phone || "").replace(/[^\d]/g, "") === phone) return c;
    if (linkedin && norm(c.linkedin_url).replace(/\/+$/, "") === linkedin) return c;
    if (name && name.length > 3 && norm(c.name) === name) return c;
  }
  return null;
}
