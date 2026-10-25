export interface RemiPublicWorkspace {
  slug: string;
  name: string;
  assistant_name: string;
  tagline: string;
  industry: string | null;
  about: string | null;
  greeting: string | null;
  default_language: string;
  voice: string;
  kiosk_idle_seconds: number;
  suggested_questions: string[];
  consent_text: string | null;
}

export interface RemiPublicProduct {
  id: string;
  name: string;
  category: string | null;
  summary: string | null;
  key_benefits: string[];
  species: string[];
  applications: string[];
  pack_sizes: string | null;
  price_min: number | null;
  price_max: number | null;
  currency: string;
  price_unit: string | null;
}

export interface RemiSource {
  title: string;
  kind: string;
  evidence_type: string | null;
  source_url: string | null;
}

export interface RemiMessage {
  key: string;
  role: "user" | "assistant";
  text: string;
  pending?: boolean;
  hidden?: boolean;
  justification?: string | null;
  sources?: RemiSource[];
  language?: { code: string; name: string };
  messageId?: number | null;
  handoff?: boolean;
  error?: boolean;
}

export const EVIDENCE_LABEL: Record<string, string> = {
  peer_reviewed: "Peer-reviewed study",
  field_trial: "Field trial",
  in_house: "In-house study",
  regulatory: "Regulatory",
  technical: "Technical data",
  testimonial: "Customer testimonial",
  marketing: "Product literature",
  other: "Reference",
};
