import { callTextModel } from "@/lib/aiClient";

// Talent.AI's AI layer. Strict JSON-only output, never a silent empty
// result. Text generation is delegated to lib/aiClient.ts (OpenAI).
function parseJsonResponse(text: string) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

async function callClaude(prompt: string, maxTokens: number): Promise<string> {
  return callTextModel(prompt, maxTokens);
}

export type ParsedCandidate = {
  name: string | null;
  email: string | null;
  phone: string | null;
  current_company: string | null;
  current_designation: string | null;
  location: string | null;
  years_experience: number | null;
  qualification: string | null;
  linkedin_url: string | null;
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
  "qualification": string or null (highest education/degree stated, e.g. "MBA", "B.Tech Computer Science"),
  "linkedin_url": string or null (a linkedin.com/in/... URL if present in the text),
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

export type MatchScore = {
  score: number;
  note: string;
};

// A fast, AI-estimated fit signal for the candidate table -- not a
// replacement for the human scorecards under talent_scorecards, which
// remain the authoritative hiring-decision record. This is deliberately
// narrower and cheaper than Smart Screen.ai's full screen (no red flags,
// interview questions, etc.) since its only job is to help a recruiter
// triage a long candidate list at a glance.
const MATCH_SCORE_PROMPT = `You are estimating how well one candidate's resume matches a role's job
description, for a recruiter scanning a candidate table. Score 0-100 from these weighted dimensions:
- Skills match -- semantic relevance of actual experience to the role, not just shared vocabulary: up to 45
- Experience relevance -- years AND domain/seniority fit: up to 25
- Qualification / education match: up to 15
- Career stability and progression, judged relative to career stage: up to 15
If a dimension has no information to judge from the resume, exclude it and redistribute its weight
proportionally across the rest so the total still scales to 100 -- never penalize missing data as a
negative signal, and never invent experience the resume doesn't state.
Respond as JSON only (no markdown fences, no prose):
{
  "score": number (0-100, integer),
  "note": string (~15 words, the single biggest reason for the score -- a strength or a gap)
}`;

export async function scoreCandidateFit(resumeText: string, jdText: string): Promise<MatchScore> {
  const text = await callClaude(
    `${MATCH_SCORE_PROMPT}\n\n--- Job description ---\n${jdText}\n\n--- Resume text ---\n${resumeText}`,
    300
  );
  const parsed = parseJsonResponse(text);
  const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
  return { score, note: typeof parsed.note === "string" ? parsed.note : "" };
}

export type EligibilityCriteria = {
  role_title: string | null;
  min_years_experience: number | null;
  qualification: string | null;
  must_have_skills: string[];
  good_to_have_skills: string[];
  other_notes: string | null;
};

// Recruiter-defined eligibility criteria, same shape as Smart Screen.ai's
// proven Criteria type -- must-have vs. good-to-have skills, not just raw
// JD text. Auto-pulled from the JD as a starting draft; the recruiter can
// edit every field before it's saved (unlike Smart Screen.ai, where the
// extraction is read-only).
const STRUCTURE_ELIGIBILITY_PROMPT = `You structure a raw job description into recruiter-facing eligibility
criteria for an ATS. Read the JD text (and role title, if given) and extract, as JSON only (no markdown
fences, no prose):
{
  "role_title": string or null,
  "min_years_experience": number or null,
  "qualification": string or null (minimum required degree/certification, only if explicitly stated),
  "must_have_skills": array of short strings (the non-negotiable skills/technologies/experience explicitly
    required),
  "good_to_have_skills": array of short strings (skills mentioned as a plus/preferred, not required),
  "other_notes": string or null (other non-negotiables like location, certification, work authorization,
    if stated)
}
For must_have_skills and good_to_have_skills, rewrite each requirement into the canonical, atomic industry
term a resume would actually use -- NOT a copy of the JD's sentence fragment. Concretely:
- Convert narrative phrasing into the underlying competency/tool name. "Own key account relationships and
  drive renewal outcomes" -> ["account management", "renewals" / "contract renewals"], not
  ["key account relationships", "renewal outcomes"] verbatim.
- Split compound requirements into separate single-concept skills ("5+ years in B2B SaaS sales with
  Salesforce" -> "B2B SaaS sales" + "Salesforce", not one long string).
- Keep each skill to 1-3 words wherever possible, using terminology a candidate's resume would plausibly
  contain (a tool, technique, domain, or role-type), not JD narrative language.
Never fabricate a requirement that isn't in the text -- use null/[] if not stated.`;

export async function structureEligibilityCriteria(
  jdText: string,
  roleTitle?: string
): Promise<EligibilityCriteria> {
  const context = roleTitle ? `Role title: ${roleTitle}\n\n` : "";
  const text = await callClaude(
    `${STRUCTURE_ELIGIBILITY_PROMPT}\n\n${context}--- JD text ---\n${jdText}`,
    700
  );
  const parsed = parseJsonResponse(text);
  return {
    role_title: typeof parsed.role_title === "string" ? parsed.role_title : null,
    min_years_experience: typeof parsed.min_years_experience === "number" ? parsed.min_years_experience : null,
    qualification: typeof parsed.qualification === "string" ? parsed.qualification : null,
    must_have_skills: Array.isArray(parsed.must_have_skills) ? parsed.must_have_skills.filter((s: unknown) => typeof s === "string") : [],
    good_to_have_skills: Array.isArray(parsed.good_to_have_skills) ? parsed.good_to_have_skills.filter((s: unknown) => typeof s === "string") : [],
    other_notes: typeof parsed.other_notes === "string" ? parsed.other_notes : null,
  };
}

export type CriteriaMatchScore = {
  score: number;
  note: string;
  met_must_have_skills: string[];
  missing_must_have_skills: string[];
};

// Criteria-aware match score -- deliberately distinct from scoreCandidateFit
// above (plain JD text). When a requisition has eligibility_criteria set,
// this replaces that call: must-have skills the recruiter explicitly
// flagged carry more than half the weight (55/100), so the % genuinely
// reflects "does this person have what I said I needed", not just general
// JD similarity. A candidate missing a must-have is weighted down hard but
// never hard-gated to 0 -- the recruiter still sees the candidate and why.
const CRITERIA_SCORE_PROMPT = `You are scoring how well one candidate's resume matches a role's
recruiter-defined eligibility criteria, for a candidate table in an ATS. This is NOT plain JD matching --
must-have skills the recruiter explicitly flagged matter far more than general resume similarity to a JD.

Before scoring, silently work through each must-have skill ONE AT A TIME and decide met or missing. For
each one, ask: "does the resume show this underlying competency, tool, or responsibility -- under ANY name,
synonym, related tool, or equivalent phrasing -- even if the exact words differ?" Judge by substance, not
vocabulary match. Examples of what counts as met:
- Must-have "account management" is met by resume evidence of "key account relationships", "client
  relationship management", "enterprise accounts", or similar -- these are the same underlying skill in
  different words.
- Must-have "Salesforce" is met by "SFDC" or "Salesforce CRM".
- Must-have "renewals" is met by "contract renewals", "retention", "renewal targets", or "book of business
  growth" if the resume shows the candidate drove repeat/continued business.
- Must-have "Python" is NOT met by "scripting experience" alone with no language named, and is NOT met by
  "R" or "SQL" -- different tools are different skills, don't over-credit adjacency.
Only mark a must-have missing when the resume genuinely gives no evidence of that competency under any
reasonable equivalent phrasing -- not just because the literal words aren't present.

Score 0-100 from these weighted dimensions:
- Must-have skills coverage -- per the per-skill judgment above: up to 55 total, split evenly across the
  must-have skills given. Weight this dimension proportionally to how many must-haves are actually met --
  a candidate missing some must-haves should score meaningfully lower here, but never let one miss alone
  zero out the whole dimension if others are met.
- Experience relevance -- years (vs min_years_experience if given) AND domain/seniority fit: up to 20
- Qualification match (vs the stated qualification, if any): up to 10
- Good-to-have skills present (same synonym-aware judgment as must-haves): up to 10
- Career stability, judged relative to career stage: up to 5
If a dimension has no information to judge (e.g. no must-have skills were given at all), exclude it and
redistribute its weight proportionally across the rest so the total still scales to 100 -- never penalize
missing data as a negative signal, and never invent experience the resume doesn't state.
Respond as JSON only (no markdown fences, no prose, no reasoning text -- just the final JSON):
{
  "score": number (0-100, integer),
  "note": string (~15 words, the single biggest reason for the score -- a strength or a gap),
  "met_must_have_skills": array of strings (must-have skills from the criteria the resume evidences, by
    their original name from the criteria list -- even when matched via a synonym in the resume),
  "missing_must_have_skills": array of strings (must-have skills from the criteria with genuinely no
    evidence, direct or equivalent, in the resume)
}`;

export async function scoreCandidateAgainstCriteria(
  criteria: EligibilityCriteria,
  resumeText: string
): Promise<CriteriaMatchScore> {
  const context = `Role: ${criteria.role_title || "not specified"}
Minimum years of experience: ${criteria.min_years_experience ?? "not specified"}
Required qualification: ${criteria.qualification || "not specified"}
Must-have skills: ${(criteria.must_have_skills || []).join(", ") || "none specified"}
Good-to-have skills: ${(criteria.good_to_have_skills || []).join(", ") || "none specified"}
Other non-negotiables: ${criteria.other_notes || "none stated"}

--- Candidate resume text ---
${resumeText}`;

  const text = await callClaude(`${CRITERIA_SCORE_PROMPT}\n\n${context}`, 700);
  const parsed = parseJsonResponse(text);
  const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
  return {
    score,
    note: typeof parsed.note === "string" ? parsed.note : "",
    met_must_have_skills: Array.isArray(parsed.met_must_have_skills) ? parsed.met_must_have_skills.filter((s: unknown) => typeof s === "string") : [],
    missing_must_have_skills: Array.isArray(parsed.missing_must_have_skills) ? parsed.missing_must_have_skills.filter((s: unknown) => typeof s === "string") : [],
  };
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

export type ParsedRequisition = {
  title: string | null;
  department: string | null;
  location: string | null;
  work_mode: "remote" | "hybrid" | "onsite" | null;
  employment_type: string | null;
  headcount: number | null;
  job_level: string | null;
  hiring_manager: string | null;
  cost_center: string | null;
  comp_min: number | null;
  comp_max: number | null;
  key_requirements: string[];
  role_summary: string;
};

// Turns an uploaded/pasted job description into structured requisition
// fields so opening a req is "attach the JD, review, submit" instead of
// re-typing everything the JD already says. This extracts role FACTS only
// (title, level, location, comp band if stated, must-have skills) -- it
// never drafts the business justification for the headcount, since that's
// a judgment call for the requisition owner, not something a JD implies.
const JD_PARSE_PROMPT = `You extract structured role details from a raw job description document for an
ATS requisition intake form. Respond as JSON only (no markdown fences, no prose):
{
  "title": string or null,
  "department": string or null,
  "location": string or null,
  "work_mode": "remote" or "hybrid" or "onsite" or null,
  "employment_type": "full-time" or "part-time" or "contract" or "intern" or null,
  "headcount": number or null,
  "job_level": string or null (e.g. "IC3", "Senior", "M2" -- only if the document names a level/grade/band),
  "hiring_manager": string or null,
  "cost_center": string or null,
  "comp_min": number or null,
  "comp_max": number or null,
  "key_requirements": array of short strings (max 8, the must-have qualifications/skills as stated),
  "role_summary": string (~50 words, factual, what the role actually does per the document)
}
Extract only what is explicitly stated in the document -- never invent a location, comp figure,
level, or headcount that isn't written there. Do not estimate market-rate compensation; comp_min/
comp_max should be null unless the document itself states a pay range. Never use age or any
age-implying detail.`;

export async function parseJDToRequisition(jdText: string): Promise<ParsedRequisition> {
  const text = await callClaude(`${JD_PARSE_PROMPT}\n\n--- Job description text ---\n${jdText}`, 900);
  return parseJsonResponse(text);
}
