import { callTextModel } from "@/lib/aiClient";

// Shared with the two Smart Screen.ai AI calls (structure + score). Text
// generation is delegated to lib/aiClient.ts (OpenAI), never a silent
// empty result.
function parseJsonResponse(text: string) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

export type Criteria = {
  role_title: string;
  min_years_experience: number | null;
  ctc_budget: string | null;
  must_have_skills: string[];
  good_to_have_skills: string[];
  other_notes: string | null;
};

// Turns a raw JD into structured screening criteria — same shape whether
// the JD came from a paste or (later) a linked Job Postings.ai posting, so
// scoring never has to branch by source downstream.
const STRUCTURE_PROMPT = `You structure a raw job description into screening criteria.
Read the JD text and extract, as JSON only (no markdown fences, no prose):
{
  "role_title": string,
  "min_years_experience": number or null,
  "ctc_budget": string or null (only if explicitly stated, e.g. "up to 60L" -- never invented),
  "must_have_skills": array of short strings,
  "good_to_have_skills": array of short strings,
  "other_notes": string or null (non-negotiables like location/relocation, if stated)
}
Never fabricate a CTC figure or requirement that isn't in the text -- use null if it's not stated.`;

export async function structureCriteria(jdText: string): Promise<Criteria> {
  const text = await callTextModel(`${STRUCTURE_PROMPT}\n\n--- JD text ---\n${jdText}`, 800);
  return parseJsonResponse(text);
}

export type ScreenResult = {
  fit_score: number;
  met_skills: string[];
  missing_skills: string[];
  justification: string;
  red_flags: string[];
  achievement: string | null;
  interview_questions: string[];
  next_action: { label: string; tier: "go" | "screen" | "hold" | "pass" };
  profile: {
    name: string | null;
    email: string | null;
    phone: string | null;
    current_company: string | null;
    current_designation: string | null;
    location: string | null;
    years_experience: number | null;
    current_ctc: string | null;
    expected_ctc: string | null;
    notice_period: string | null;
  };
};

// Scored honestly -- neither inflated to be agreeable nor deflated to seem
// rigorous, since this ranks real people for a recruiter. fit_score is kept
// strictly about role fit; red flags and achievements are separate visible
// fields so a red flag never silently drags the number down.
const SCREEN_PROMPT = `You are screening one candidate's CV against a role's criteria for a bulk
CV-screening tool. Score fit_score out of 10 from these weighted dimensions (role-fit only):
- Must-have skills match AND semantic relevance of actual experience to the role (judge by
  meaning, not shared vocabulary): up to 3.5
- Experience relevance -- years AND domain/seniority fit, not just a number: up to 1.5
- Qualification match, exact or equivalent: up to 1
- Career stability, judged relative to career stage: up to 1
- Good-to-have skills: up to 1
- CTC fit within the stated budget: up to 1
- Notice period / location / other stated non-negotiables: up to 1
If a dimension has no information to judge, exclude it and redistribute its weight proportionally
across the rest so the total still scales to 10 -- never penalize missing data as a negative signal.

red_flags: MAJOR issues only (repeated short stints under 6 months especially senior, unexplained
multi-year gaps, overlapping full-time dates, unexplained downward title trajectory). Do NOT flag
typos, formatting, short gaps under ~2 months, or normal early-career changes. Empty array if none.

achievement: one standout, concretely-evidenced accomplishment if the CV genuinely shows one,
otherwise null -- never manufactured from generic responsibilities.

interview_questions: exactly 2, tailored to this specific candidate.

next_action: { "label": short actionable string, "tier": "go" | "screen" | "hold" | "pass" }.
"go" = strong fit (~8+) no major red flags. "screen" = real gap worth a conversation. "hold" =
reasonable fit but a practical blocker. "pass" = weak fit (~5 or below).

Never use age, date of birth, or any age-implying detail as a scoring or red-flag factor.

Respond as JSON only (no markdown fences, no prose):
{
  "fit_score": number (1-10, one decimal place),
  "met_skills": array of strings,
  "missing_skills": array of strings,
  "justification": string (~80 words, evidence-based, specific to this candidate),
  "red_flags": array of strings,
  "achievement": string or null,
  "interview_questions": array of exactly 2 strings,
  "next_action": { "label": string, "tier": "go" | "screen" | "hold" | "pass" },
  "profile": {
    "name": string or null, "email": string or null, "phone": string or null,
    "current_company": string or null, "current_designation": string or null,
    "location": string or null, "years_experience": number or null,
    "current_ctc": string or null, "expected_ctc": string or null,
    "notice_period": string or null
  }
}`;

export async function screenCandidate(
  criteria: Criteria,
  resumeText: string
): Promise<ScreenResult> {
  const context = `Role: ${criteria.role_title || "not specified"}
Minimum years of experience: ${criteria.min_years_experience ?? "not specified"}
CTC budget (max): ${criteria.ctc_budget || "not specified"}
Must-have skills: ${(criteria.must_have_skills || []).join(", ") || "none specified"}
Good-to-have skills: ${(criteria.good_to_have_skills || []).join(", ") || "none specified"}
Other notes / non-negotiables: ${criteria.other_notes || "none stated"}

--- Candidate resume text ---
${resumeText}`;

  const text = await callTextModel(`${SCREEN_PROMPT}\n\n${context}`, 1400);
  return parseJsonResponse(text);
}
