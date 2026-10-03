// DTOs for the NR Synergy admin API.

export const NRS_ROLES = [
  "employee",
  "manager",
  "hr_admin",
  "finance",
  "super_admin",
  "travel_desk",
  "it_agent",
  "hr_agent",
] as const;
export type AdminRole = (typeof NRS_ROLES)[number];

export interface AdminMemberDto {
  id: string;
  full_name: string;
  email: string;
  designation: string | null;
  department: string | null;
  division: string | null;
  home_country: string;
  manager_id: string | null;
  joined_on: string | null;
  status: "active" | "inactive";
  linked: boolean;
  /** Linked but the invite hasn't been accepted yet (never confirmed or signed in). */
  pending?: boolean;
  is_demo: boolean;
  roles: AdminRole[];
  /** Explicit per-member overrides only. */
  features: Record<string, boolean>;
  engagement: { type: "consultant" | "payroll"; country_code: string; starts_on: string } | null;
}

export interface FeatureDto {
  key: string;
  name: string;
  default_on: boolean;
}

export interface CountryDto {
  code: string;
  name: string;
  timezone: string;
  currency: string;
}

export interface CountryRuleDto {
  id: string;
  country_code: string;
  effective_from: string;
  working_days: number[];
  std_hours_per_day: string;
  leave_rules: Record<string, unknown>;
  expense_limits: Record<string, unknown>;
}

export interface HolidayDto {
  id: string;
  country_code: string;
  day: string;
  name: string;
}

export interface ChainDto {
  id: string;
  kind: string;
  effective_from: string;
  applies_to: string;
  steps: unknown;
}

export const CONTENT_KINDS = ["posts", "events", "documents", "values", "quick_links"] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

export interface DocumentVersionDto {
  id: string;
  document_id: string;
  version: string;
  effective_from: string;
  summary: string | null;
  body_markdown: string | null;
  published_at: string | null;
  created_at: string;
}
