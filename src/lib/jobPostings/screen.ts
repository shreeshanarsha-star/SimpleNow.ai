import { callTextModel } from "@/lib/aiClient";

// Screens one candidate against one job posting. Ported from the old
// askshree-app repo's lib/aiScreen.js screenCandidate(). Structured,
// evidence-based -- the prompt forces evidence citation rather than
// free-form judgment, and scores honestly rather than inflating to be
// agreeable (this score gates whether the employer ever sees the
// candidate at all, via the questionnaire shortlist step).
const SCREEN_PROMPT = `You are screening a candidate against a job's requirements for a recruiting
platform. You will be given the job's must-have skills, good-to-have skills, qualification
requirement, and minimum experience, followed by the candidate's resume text. Score honestly --
do not inflate scores to be agreeable.

Respond as JSON only:
{
  "match_score": integer 0-100,
  "matched_skills": array of strings (skills from the job's lists that the resume evidences),
  "missing_skills": array of strings (must-have skills NOT evidenced in the resume),
  "evidence": string (1-2 sentences citing specific things in the resume that justify the score),
  "cover_note": string (a short, specific 2-3 sentence note on why this candidate could be a fit,
    written for the employer -- no generic filler, must reference something concrete from the resume)
}
If the resume doesn't evidence enough of the must-haves to be a real candidate, still return a low
match_score honestly rather than a generic one.

--- Job ---
`;

export interface JobForScreening {
  title: string;
  company: string | null;
  must_have_skills: string[] | null;
  good_to_have_skills: string[] | null;
  qualification: string | null;
  min_years_experience: number | null;
}

export interface ScreenResult {
  match_score: number;
  matched_skills: string[];
  missing_skills: string[];
  evidence: string;
  cover_note: string;
}

export async function screenCandidate(job: JobForScreening, resumeText: string): Promise<ScreenResult> {
  const jobContext = `Job: ${job.title} at ${job.company || "Confidential"}
Must-have skills: ${(job.must_have_skills || []).join(", ") || "not specified"}
Good-to-have skills: ${(job.good_to_have_skills || []).join(", ") || "not specified"}
Qualification required: ${job.qualification || "not specified"}
Minimum years of experience: ${job.min_years_experience ?? "not specified"}

--- Candidate resume text ---
${resumeText}`;

  const raw = await callTextModel(`${SCREEN_PROMPT}${jobContext}`, 1000);
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned) as Partial<ScreenResult>;

  return {
    match_score: typeof parsed.match_score === "number" ? Math.max(0, Math.min(100, parsed.match_score)) : 0,
    matched_skills: Array.isArray(parsed.matched_skills) ? parsed.matched_skills : [],
    missing_skills: Array.isArray(parsed.missing_skills) ? parsed.missing_skills : [],
    evidence: parsed.evidence || "",
    cover_note: parsed.cover_note || "",
  };
}

const PARSE_CANDIDATE_PROMPT = `Extract structured contact/profile info from this resume text.
Respond as JSON only: { "name": string, "email": string or null, "phone": string or null,
"location": string or null, "years_experience": number or null, "skills": array of strings }

--- Resume text ---
`;

export interface ParsedCandidate {
  name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  years_experience: number | null;
  skills: string[];
}

export async function parseCandidateProfile(resumeText: string): Promise<ParsedCandidate> {
  try {
    const raw = await callTextModel(`${PARSE_CANDIDATE_PROMPT}${resumeText}`, 500);
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned) as Partial<ParsedCandidate>;
    return {
      name: parsed.name || "Unknown",
      email: parsed.email ?? null,
      phone: parsed.phone ?? null,
      location: parsed.location ?? null,
      years_experience: typeof parsed.years_experience === "number" ? parsed.years_experience : null,
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
    };
  } catch {
    return { name: "Unknown", email: null, phone: null, location: null, years_experience: null, skills: [] };
  }
}
