// Contracts & eSign -- shared types. Personal Tools feature, isolated from
// every other tool's types (no imports from/into talentAI.ts, smartScreen.ts,
// etc). Mirrors the shape of the contracts_* tables exactly.

export type EnvelopeStatus =
  | "draft"
  | "processing"
  | "waiting_for_signature"
  | "in_progress"
  | "completed"
  | "declined"
  | "expired"
  | "failed";

export type RecipientRole = "signer" | "cc";

export type RecipientStatus =
  | "pending"
  | "sent"
  | "opened"
  | "signed"
  | "declined"
  | "copy_sent"
  | "expired";

export type FieldType = "signature" | "date" | "name" | "location";

export type FieldStatus = "pending" | "needs_review" | "completed";

export type SignatureType = "typed" | "drawn" | "uploaded";

export interface FieldPosition {
  // Fractional page coordinates, origin top-left (0..1), computed per
  // document -- never a hardcoded pixel constant.
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ContractEnvelope {
  id: string;
  owner_id: string;
  name: string;
  original_file_path: string;
  original_file_name: string;
  original_mime_type: string;
  working_file_path: string | null;
  final_file_path: string | null;
  page_count: number | null;
  status: EnvelopeStatus;
  current_signing_order: number;
  ai_confidence: "ok" | "needs_review";
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface ContractRecipient {
  id: string;
  envelope_id: string;
  name: string;
  email: string;
  role: RecipientRole;
  signing_order: number | null;
  token: string;
  status: RecipientStatus;
  sent_at: string | null;
  opened_at: string | null;
  signed_at: string | null;
  expires_at: string | null;
  signature_type: SignatureType | null;
  signature_data: string | null;
  created_at: string;
}

export interface ContractField {
  id: string;
  envelope_id: string;
  recipient_id: string;
  field_type: FieldType;
  page: number;
  position: FieldPosition;
  status: FieldStatus;
  value: string | null;
  confidence: "high" | "low";
  created_at: string;
}

// Link expiry for a signer/cc token -- 30 days, generous for a real
// signing cycle without leaving links live indefinitely.
export const SIGN_LINK_TTL_DAYS = 30;

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB, matches the bucket limit
export const ALLOWED_UPLOAD_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};
