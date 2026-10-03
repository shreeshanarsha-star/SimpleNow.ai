// DTOs shared by the Money / Admin API routes and their client pages.

import type { BillingBasis } from "./calc";

export const EXPENSE_CATEGORIES = ["travel", "meals", "lodging", "client_entertainment", "trade_fair", "other"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export type ExpenseStatus = "draft" | "submitted" | "approved" | "rejected" | "sent_back" | "invoiced" | "reimbursed";
export type TravelStatus = "pending" | "approved" | "rejected" | "cancelled" | "sent_back";
export type InvoiceStatus =
  | "draft"
  | "submitted"
  | "manager_approved"
  | "hr_approved"
  | "finance_approved"
  | "paid"
  | "rejected"
  | "sent_back"
  | "cancelled";

export interface ExpenseDto {
  id: string;
  spent_on: string;
  category: ExpenseCategory;
  description: string;
  amount_minor: number;
  currency: string;
  fx_rate: string | null;
  reporting_amount_minor: number | null;
  has_receipt: boolean;
  over_limit: boolean;
  status: ExpenseStatus;
  invoice_id: string | null;
  created_at: string;
}

export interface TravelDto {
  id: string;
  destination: string;
  purpose: string;
  starts_on: string;
  ends_on: string;
  estimated_minor: number | null;
  currency: string | null;
  status: TravelStatus;
  created_at: string;
}

export interface MoneyProfileDto {
  memberId: string;
  fullName: string;
  homeCountry: string;
  countryCurrency: string;
  reportingCurrency: string;
  engagementType: "consultant" | "payroll" | null;
  isFinance: boolean;
  hasSignature: boolean;
  hasVerifiedTerms: boolean;
  /** Per-category limits in country currency minor units. */
  expenseLimits: Record<string, number>;
}

export interface InvoiceLineDto {
  id: string;
  sort: number;
  kind: "fee" | "proration" | "leave_deduction" | "expense" | "adjustment";
  description: string;
  quantity: string;
  unit_minor: number;
  amount_minor: number;
  source: Record<string, unknown>;
}

export interface InvoiceDto {
  id: string;
  member_id: string;
  member_name?: string;
  number: string;
  period_start: string;
  period_end: string;
  currency: string;
  subtotal_minor: number;
  expenses_minor: number;
  total_minor: number;
  status: InvoiceStatus;
  signed_at: string | null;
  paid_at: string | null;
  payment_ref: string | null;
  has_pdf: boolean;
  created_at: string;
  lines?: InvoiceLineDto[];
  calc_snapshot?: Record<string, unknown>;
}

export interface ExtractedField<T> {
  value: T | null;
  /** 0..1 */
  confidence: number;
  evidence: string | null;
  clause: string | null;
}

export interface ContractExtraction {
  basis: ExtractedField<BillingBasis>;
  /** Decimal string in the contract currency, e.g. "8500.00". */
  fee_amount: ExtractedField<string>;
  fee_minor: ExtractedField<number>;
  currency: ExtractedField<string>;
  paid_leave_days_per_year: ExtractedField<string>;
  reimbursables: ExtractedField<string[]>;
  tax: ExtractedField<Record<string, unknown>>;
  notice_days: ExtractedField<number>;
  effective_from: ExtractedField<string>;
  effective_to: ExtractedField<string>;
  notes: string | null;
  model: string;
  provider: "anthropic" | "openai";
  extracted_at: string;
}

export type ContractStatus = "uploaded" | "extracting" | "review" | "verified" | "superseded" | "failed";

export interface ContractDto {
  id: string;
  member_id: string;
  member_name: string;
  file_name: string | null;
  status: ContractStatus;
  extraction: (ContractExtraction | { error: string }) | null;
  verified_at: string | null;
  created_at: string;
  is_demo: boolean;
}

export interface ContractTermsDto {
  id: string;
  contract_id: string;
  member_id: string;
  effective_from: string;
  effective_to: string | null;
  basis: BillingBasis;
  fee_minor: number;
  currency: string;
  paid_leave_days_per_year: string;
  reimbursables: string[];
  tax: Record<string, unknown>;
  notice_days: number | null;
  clause_refs: Record<string, unknown>;
  verified_at: string | null;
}
