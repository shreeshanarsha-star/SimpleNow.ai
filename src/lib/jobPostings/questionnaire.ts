import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { callTextModel } from "@/lib/aiClient";

// Stage 2 of the matching pipeline: a candidate who cleared the CV-based
// screen (screenCandidate in screen.ts) gets sent this structured
// questionnaire. Stage 3 (verifyQuestionnaireAnswers below) checks their
// self-reported answers against the JD before the job poster ever sees
// them. Ported from the old askshree-app repo's lib/questionnaire.js.
export async function createQuestionnaire(applicationId: string) {
  const admin = createAdminClient();
  const token = crypto.randomBytes(24).toString("hex");
  const { data, error } = await admin
    .from("application_questionnaires")
    .insert({ application_id: applicationId, token, status: "sent" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

const FUZZY_MATCH_PROMPT = `Compare a candidate's self-reported qualification and current industry
against a job's stated requirements. Judge on substance, not exact wording (e.g. "B.Tech CS" should
match a requirement of "Bachelor's in Engineering or related field"; "SaaS" should match "Software").
Respond as JSON only:
{
  "qualification_match": boolean,
  "industry_match": boolean,
  "reasoning": string (1-2 sentences, plain language, for an internal log -- not shown to the candidate)
}
If the job doesn't state a requirement for one of these (null/empty), treat that one as a match by
default (nothing to fail against).

`;

export interface JobForVerification {
  min_years_experience: number | null;
  location: string | null;
  qualification: string | null;
  industry: string | null;
}

export interface QuestionnaireAnswers {
  technical_skill_answers: Array<{ skill: string; has_it: boolean }>;
  good_to_have_answers: Array<{ skill: string; has_it: boolean }>;
  location: string | null;
  ctc: string | null;
  total_experience: number | null;
  qualification: string | null;
  current_industry: string | null;
  open_to_relocation: boolean;
}

// Deterministic checks (skills, experience, location/relocation) plus one
// AI judgment call for the two fuzzy fields (qualification, industry --
// phrasing varies too much for exact string matching).
export async function verifyQuestionnaireAnswers(
  job: JobForVerification,
  answers: QuestionnaireAnswers
): Promise<{ passed: boolean; reasoning: string }> {
  const reasons: string[] = [];

  const skillsOk =
    (answers.technical_skill_answers || []).length > 0 &&
    (answers.technical_skill_answers || []).every((s) => s.has_it === true);
  if (!skillsOk) reasons.push("Did not confirm all mandatory technical skills.");

  let experienceOk = true;
  if (job.min_years_experience != null && answers.total_experience != null) {
    experienceOk = Number(answers.total_experience) >= Number(job.min_years_experience);
    if (!experienceOk)
      reasons.push(`Experience (${answers.total_experience}y) below the required ${job.min_years_experience}y.`);
  }

  let locationOk = true;
  if (job.location && answers.location) {
    const sameLocation = job.location.trim().toLowerCase() === answers.location.trim().toLowerCase();
    locationOk = sameLocation || !!answers.open_to_relocation;
    if (!locationOk) reasons.push("Location does not match and not open to relocation.");
  }

  let qualificationOk = true;
  let industryOk = true;
  let fuzzyReasoning = "";
  try {
    const context = `Job qualification requirement: ${job.qualification || "not specified"}
Job industry: ${job.industry || "not specified"}

Candidate's stated qualification: ${answers.qualification || "not provided"}
Candidate's stated current industry: ${answers.current_industry || "not provided"}`;
    const raw = await callTextModel(`${FUZZY_MATCH_PROMPT}${context}`, 400);
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned) as {
      qualification_match?: boolean;
      industry_match?: boolean;
      reasoning?: string;
    };
    qualificationOk = parsed.qualification_match !== false;
    industryOk = parsed.industry_match !== false;
    fuzzyReasoning = parsed.reasoning || "";
    if (!qualificationOk) reasons.push("Qualification does not match requirement.");
    if (!industryOk) reasons.push("Industry does not match requirement.");
  } catch {
    fuzzyReasoning = "Qualification/industry AI check unavailable -- not used to block.";
  }

  const passed = skillsOk && experienceOk && locationOk && qualificationOk && industryOk;
  const reasoning = passed
    ? `All requirements confirmed.${fuzzyReasoning ? ` ${fuzzyReasoning}` : ""}`
    : `${reasons.join(" ")}${fuzzyReasoning ? ` ${fuzzyReasoning}` : ""}`;

  return { passed, reasoning };
}
