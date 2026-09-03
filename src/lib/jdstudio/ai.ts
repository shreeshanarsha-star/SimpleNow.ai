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

// --- 3. sample_jd -> a pre-filled answer set (used to skip questions
//        when the dropped document is already a full JD) --------------
const JD_TO_ANSWERS_PROMPT = `This document is a job description. Extract its key facts into the JSON shape below.
Never invent a fact the document doesn't state -- use null/[] where genuinely absent.

Respond as JSON only:
{
  "job_title": string|null, "department": string|null, "location_mode": string|null,
  "employment_headcount": string|null, "years_experience": string|null, "comp_range": string|null,
  "top_responsibilities": string|null, "must_have": string[], "good_to_have": string[]
}`;

export async function draftAnswersFromSampleJd(text: string) {
  const raw = await callTextModel(`${JD_TO_ANSWERS_PROMPT}\n\n--- JD text ---\n${text.slice(0, 8000)}`, 800);
  return parseJsonResponse(raw);
}

// --- 4. draft the final JD from the recipient's submitted answers ----
const DRAFT_JD_PROMPT = `You are drafting a professional job description from a hiring stakeholder's answers to an
intake form. Write clearly and concretely; do not invent facts beyond what's given, but you may
phrase things professionally. Return 3-6 responsibility bullets and use the given must-have /
good-to-have skills verbatim as separate array entries (clean up minor typos only).

Respond as JSON only:
{
  "summary": string (2-3 sentence role summary),
  "responsibilities": string[],
  "must_have_skills": string[],
  "good_to_have_skills": string[],
  "qualifications": string,
  "experience": string,
  "location_mode": string,
  "employment_type": string,
  "compensation_range": string|null
}`;

export async function draftJobDescription(answers: Record<string, string>): Promise<JdDraft> {
  const raw = await callTextModel(
    `${DRAFT_JD_PROMPT}\n\n--- Intake answers (JSON) ---\n${JSON.stringify(answers)}`,
    1200
  );
  const parsed = parseJsonResponse(raw);
  return {
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    responsibilities: Array.isArray(parsed.responsibilities) ? parsed.responsibilities : [],
    must_have_skills: Array.isArray(parsed.must_have_skills) ? parsed.must_have_skills : [],
    good_to_have_skills: Array.isArray(parsed.good_to_have_skills) ? parsed.good_to_have_skills : [],
    qualifications: typeof parsed.qualifications === "string" ? parsed.qualifications : "",
    experience: typeof parsed.experience === "string" ? parsed.experience : "",
    location_mode: typeof parsed.location_mode === "string" ? parsed.location_mode : "",
    employment_type: typeof parsed.employment_type === "string" ? parsed.employment_type : "",
    compensation_range: typeof parsed.compensation_range === "string" ? parsed.compensation_range : null,
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
  const raw = await callTextModel(`${BIAS_CHECK_PROMPT}\n\n--- Draft (JSON) ---\n${JSON.stringify(draft)}`, 600);
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
