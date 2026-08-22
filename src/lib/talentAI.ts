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
