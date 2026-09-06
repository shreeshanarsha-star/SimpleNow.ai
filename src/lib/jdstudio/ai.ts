import { callTextModel } from "@/lib/aiClient";
import type { ExtractedRow, JdDraft, BiasFlag, UploadKind } from "./types";

// JD Studio.ai's AI layer -- same "strict JSON only, never invent a fact"
// discipline as shortlistAI.ts / talentAI.ts, reused deliberately.
function parseJsonResponse(text: string) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

// --- 1. classify the dropped document -------------------------------
const CLASSIFY_PROMPT = `You classify a document dropped into an HR tool. Decide if it is:
- "master_data": a spreadsheet/table of multiple people with columns like name, email, department, role/title -- a hiring/requisition tracker
- "email_list": a simple list of names and/or email addresses with little other structure
- "sample_jd": a single job description document (one role, responsibilities, requirements)
- "unknown": none of the above, or unreadable

Respond as JSON only (no markdown fences, no prose):
{ "kind": "master_data" or "email_list" or "sample_jd" or "unknown", "confidence": "high" or "medium" or "low", "reason": string (~12 words) }`;

export async function classifyUpload(
  text: string
): Promise<{ kind: UploadKind; confidence: string; reason: string }> {
  if (!text || text.trim().length < 10) {
    return { kind: "unknown", confidence: "low", reason: "Not enough readable content." };
  }
  const raw = await callTextModel(`${CLASSIFY_PROMPT}\n\n--- Content ---\n${text.slice(0, 6000)}`, 150);
  const parsed = parseJsonResponse(raw);
  const kind: UploadKind = ["master_data", "email_list", "sample_jd"].includes(parsed.kind)
    ? parsed.kind
    : "unknown";
  return {
    kind,
    confidence: typeof parsed.confidence === "string" ? parsed.confidence : "low",
    reason: typeof parsed.reason === "string" ? parsed.reason : "",
  };
}

// --- 2. extract recipient rows from master_data / email_list --------
const EXTRACT_ROWS_PROMPT = `Extract every person listed in this document as a JSON array. For a spreadsheet-like
document, use the header row to find name/email/department/job-title style columns. For a plain
email list, department and job_title will usually be null. Never invent an email address --
if a row has no valid email, omit that row entirely.

Respond as JSON only (no markdown fences, no prose):
{ "rows": [ { "name": string|null, "email": string, "department": string|null, "job_title": string|null } ] }`;

export async function extractRecipientRows(text: string): Promise<ExtractedRow[]> {
  const raw = await callTextModel(`${EXTRACT_ROWS_PROMPT}\n\n--- Content ---\n${text.slice(0, 12000)}`, 2000);
  const parsed = parseJsonResponse(raw);
  const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
  return rows
    .filter((r: unknown): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r: Record<string, unknown>) => ({
      name: typeof r.name === "string" ? r.name.trim() : null,
      email: typeof r.email === "string" ? r.email.trim() : "",
      department: typeof r.department === "string" ? r.department.trim() : null,
      job_title: typeof r.job_title === "string" ? r.job_title.trim() : null,
    }))
    .filter((r: ExtractedRow) => !!r.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email));
}

// --- 3. sample_jd -> a pre-filled answer set (used to extract key details
//        when a dropped document is a raw JD or unstructured notes) --------
const JD_TO_ANSWERS_PROMPT = `This document contains a job description, notes, or role specification.
Extract its key architectural facts into the JSON shape below.
Never invent a fact the document doesn't state -- use null/[] where genuinely absent.

Respond as JSON only:
{
  "job_title": string|null,
  "department": string|null,
  "band_grade": string|null,
  "location": string|null,
  "experience_level": string|null,
  "comp_range": string|null,
  "kras": string[] (up to 5 key responsibilities / result areas),
  "must_have": string[] (top 3 non-negotiable qualifications/skills without which we will not hire),
  "additional_strengths": string[] (certifications, bonus skills)
}`;

export async function draftAnswersFromSampleJd(text: string) {
  const raw = await callTextModel(`${JD_TO_ANSWERS_PROMPT}\n\n--- JD text ---\n${text.slice(0, 8000)}`, 1000);
  return parseJsonResponse(raw);
}

// --- 4. draft both Internal and External formats from manager answers ----
const DRAFT_JD_PROMPT = `You are the People Architecture & Job Description Engine.
You take structured inputs from a hiring manager (title, band/grade, department, location, experience, Top 5 KRAs, Top 3 non-negotiable strengths, and additional strengths/certifications).

You must generate TWO standardized architectural formats simultaneously:
1. "internal": The People Architecture Blueprint (for internal governance, performance reviews, role clarity, and leveling).
2. "external": The Market-Facing Job Description (compelling, candidate-facing, attracting top talent while filtering dealbreakers).

Respond as JSON only (no markdown fences):
{
  "internal": {
    "role_title": string,
    "department": string,
    "band_grade": string,
    "location": string,
    "experience_level": string,
    "role_purpose": string (2-3 sentences on why this seat exists and where it drives the org),
    "kras": string[] (exactly 5 key result areas detailing the core deliverables of this role),
    "performance_metrics": string[] (5 measurable OKRs / KPIs used to evaluate this seat in quarterly reviews and promotions),
    "functional_interfaces": string[] (3-4 explicit cross-functional collaboration points and boundary lines),
    "core_competencies": string[] (the non-negotiable baseline competencies and leveling criteria),
    "additional_strengths": string[] (certifications and specialized high-value strengths)
  },
  "external": {
    "role_title": string,
    "department": string,
    "location_mode": string,
    "employment_type": string,
    "experience_level": string,
    "about_role": string (an inspiring, professional pitch of the role, opportunity, and mission),
    "responsibilities": string[] (action-oriented "What You'll Do" translated from the 5 KRAs),
    "must_have_qualifications": string[] (the top 3 non-negotiables: education, years in specific tech/domain, core proficiency),
    "preferred_qualifications": string[] (additional strengths, certifications, and bonus skills),
    "compensation_range": string|null
  }
}`;

export async function draftJobDescription(answers: Record<string, string>): Promise<JdDraft> {
  const raw = await callTextModel(
    `${DRAFT_JD_PROMPT}\n\n--- Manager Inputs (JSON) ---\n${JSON.stringify(answers)}`,
    1800
  );
  const parsed = parseJsonResponse(raw);

  const internal = parsed.internal || {};
  const external = parsed.external || {};

  const extResponsibilities = Array.isArray(external.responsibilities) ? external.responsibilities : [];
  const extMustHave = Array.isArray(external.must_have_qualifications) ? external.must_have_qualifications : [];
  const extGoodToHave = Array.isArray(external.preferred_qualifications) ? external.preferred_qualifications : [];

  return {
    internal: {
      role_title: typeof internal.role_title === "string" ? internal.role_title : (answers.role_title || answers.job_title || ""),
      department: typeof internal.department === "string" ? internal.department : (answers.department || "General"),
      band_grade: typeof internal.band_grade === "string" ? internal.band_grade : (answers.band_grade || "Standard"),
      location: typeof internal.location === "string" ? internal.location : (answers.location || "Flexible"),
      experience_level: typeof internal.experience_level === "string" ? internal.experience_level : (answers.experience_level || ""),
      role_purpose: typeof internal.role_purpose === "string" ? internal.role_purpose : "",
      kras: Array.isArray(internal.kras) ? internal.kras : [],
      performance_metrics: Array.isArray(internal.performance_metrics) ? internal.performance_metrics : [],
      functional_interfaces: Array.isArray(internal.functional_interfaces) ? internal.functional_interfaces : [],
      core_competencies: Array.isArray(internal.core_competencies) ? internal.core_competencies : [],
      additional_strengths: Array.isArray(internal.additional_strengths) ? internal.additional_strengths : [],
    },
    external: {
      role_title: typeof external.role_title === "string" ? external.role_title : (answers.role_title || answers.job_title || ""),
      department: typeof external.department === "string" ? external.department : (answers.department || "General"),
      location_mode: typeof external.location_mode === "string" ? external.location_mode : (answers.location || "Hybrid / Flexible"),
      employment_type: typeof external.employment_type === "string" ? external.employment_type : "Full-time",
      experience_level: typeof external.experience_level === "string" ? external.experience_level : (answers.experience_level || ""),
      about_role: typeof external.about_role === "string" ? external.about_role : "",
      responsibilities: extResponsibilities,
      must_have_qualifications: extMustHave,
      preferred_qualifications: extGoodToHave,
      compensation_range: typeof external.compensation_range === "string" ? external.compensation_range : null,
    },
    // Backward compatibility mappings:
    summary: typeof external.about_role === "string" ? external.about_role : "",
    responsibilities: extResponsibilities,
    must_have_skills: extMustHave,
    good_to_have_skills: extGoodToHave,
    qualifications: extMustHave.join("; "),
    experience: typeof external.experience_level === "string" ? external.experience_level : (answers.experience_level || ""),
    location_mode: typeof external.location_mode === "string" ? external.location_mode : (answers.location || ""),
    employment_type: typeof external.employment_type === "string" ? external.employment_type : "Full-time",
    compensation_range: typeof external.compensation_range === "string" ? external.compensation_range : null,
  };
}

// --- 5. bias / clarity check on the draft ----------------------------
const BIAS_CHECK_PROMPT = `Review this job description draft for: biased or exclusionary wording (gendered language,
age-coded phrases, ableist terms), and unrealistic requirements (e.g. "10 years experience" for
an entry role, or contradictory must-haves). Flag only real issues -- an empty array is a fine
answer for a clean draft.

Respond as JSON only:
{ "flags": [ { "type": "biased_wording" or "unrealistic_requirement" or "unclear", "text": string (the flagged phrase), "suggestion": string } ] }`;

export async function checkBiasAndClarity(draft: JdDraft): Promise<BiasFlag[]> {
  const targetToCheck = draft.external || draft;
  const raw = await callTextModel(`${BIAS_CHECK_PROMPT}\n\n--- Draft (JSON) ---\n${JSON.stringify(targetToCheck)}`, 600);
  const parsed = parseJsonResponse(raw);
  const flags = Array.isArray(parsed.flags) ? parsed.flags : [];
  return flags
    .filter((f: unknown): f is Record<string, unknown> => !!f && typeof f === "object")
    .map((f: Record<string, unknown>) => ({
      type: ["biased_wording", "unrealistic_requirement", "unclear"].includes(f.type as string)
        ? (f.type as BiasFlag["type"])
        : "unclear",
      text: typeof f.text === "string" ? f.text : "",
      suggestion: typeof f.suggestion === "string" ? f.suggestion : "",
    }));
}
