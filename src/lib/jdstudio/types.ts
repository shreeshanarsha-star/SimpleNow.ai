// Isolated types file for JD Studio.ai -- mirrors the DB tables exactly.
// Same pattern as src/lib/contracts/types.ts.

export type UploadKind = "master_data" | "email_list" | "sample_jd" | "unknown";
export type UploadStatus =
  | "uploaded"
  | "classifying"
  | "classified"
  | "awaiting_review"
  | "executing"
  | "completed"
  | "failed";

export type RequestMode = "auto" | "manual";
export type RequestStatus =
  | "queued"
  | "pending_review"
  | "sent"
  | "opened"
  | "responded"
  | "drafting"
  | "pending_approval"
  | "approved"
  | "published"
  | "expired"
  | "failed";

export type ApproverMode = "self" | "route";
export type JdTemplate = "internal" | "external" | "both" | "standard" | "compact" | "branded";
export type QuestionSection = "role_context" | "must_have" | "good_to_have";
export type QuestionType = "text" | "textarea";

export interface JdQuestion {
  id: string;
  section: QuestionSection;
  label: string;
  type: QuestionType;
  required: boolean;
}

export interface JdStudioUpload {
  id: string;
  owner_id: string;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  mode: RequestMode;
  kind: UploadKind | null;
  status: UploadStatus;
  classification: {
    kind: UploadKind;
    confidence: "high" | "medium" | "low";
    reason: string;
    row_count?: number;
    sample_answers?: Record<string, unknown>;
  } | null;
  extracted_rows: ExtractedRow[] | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExtractedRow {
  name: string | null;
  email: string | null;
  department: string | null;
  job_title: string | null;
  approver_email?: string | null;
  approver_email_2?: string | null;
}

export interface JdStudioQuestionSet {
  id: string;
  owner_id: string | null;
  name: string;
  is_system: boolean;
  questions: JdQuestion[];
  created_at: string;
  updated_at: string;
}

// 1. Internal People Architecture Blueprint
export interface InternalJdFormat {
  role_title: string;
  department: string;
  band_grade: string;
  location: string;
  experience_level: string;
  role_purpose: string;
  kras: string[]; // Top 5 Key Result Areas
  performance_metrics: string[]; // How KRAs are measured / OKRs
  functional_interfaces: string[]; // Collaboration interfaces & boundaries
  core_competencies: string[]; // Top non-negotiable competencies
  additional_strengths: string[]; // Certifications, specialized skills
}

// 2. External Market & Candidate Facing Job Description
export interface ExternalJdFormat {
  role_title: string;
  department: string;
  location_mode: string;
  employment_type: string;
  experience_level: string;
  about_role: string;
  responsibilities: string[]; // What You'll Do
  must_have_qualifications: string[]; // Top 3 Non-Negotiable bars
  preferred_qualifications: string[]; // Additional strengths & certifications
  compensation_range: string | null;
}

export interface JdDraft {
  // Primary Dual Formats
  internal?: InternalJdFormat;
  external?: ExternalJdFormat;

  // Legacy fallback fields for backward compatibility
  summary: string;
  responsibilities: string[];
  must_have_skills: string[];
  good_to_have_skills: string[];
  qualifications: string;
  experience: string;
  location_mode: string;
  employment_type: string;
  compensation_range: string | null;
}

export interface BiasFlag {
  type: "biased_wording" | "unrealistic_requirement" | "unclear";
  text: string;
  suggestion: string;
}

export interface JdStudioRequest {
  id: string;
  owner_id: string;
  upload_id: string | null;
  question_set_id: string | null;
  mode: RequestMode;
  status: RequestStatus;
  recipient_name: string | null;
  recipient_email: string;
  department: string;
  job_title: string | null;
  token: string;
  token_expires_at: string;
  questions_snapshot: JdQuestion[] | null;
  answers: Record<string, string> | null;
  responded_at: string | null;
  ai_draft_json: JdDraft | null;
  bias_flags: BiasFlag[] | null;
  duplicate_of_id: string | null;
  duplicate_score: number | null;
  approver_mode: ApproverMode;
  approver_email: string | null;
  approver_email_2?: string | null;
  approved_by: string | null;
  approved_at: string | null;
  template: JdTemplate;
  final_docx_path: string | null;
  final_internal_docx_path?: string | null;
  final_external_docx_path?: string | null;
  job_posting_id: string | null;
  published_at: string | null;
  reminder_count: number;
  last_reminded_at: string | null;
  escalated_at: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export const JDSTUDIO_BUCKET = "jdstudio";
export const TOKEN_TTL_DAYS = 30;
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const ALLOWED_UPLOAD_TYPES: Record<string, string> = {
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xls",
  "text/csv": "csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/pdf": "pdf",
  "text/plain": "txt",
};
// Nudge a silent recipient after this many days; escalate to the
// requester (owner) if it stays stale this many days beyond that.
export const REMINDER_AFTER_DAYS = 3;
export const ESCALATE_AFTER_DAYS = 7;
