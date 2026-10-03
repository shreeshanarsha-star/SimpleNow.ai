import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCountryCalendar } from "../dates";
import { convertMinor } from "../money";
import { lookupFxRate } from "./fx";
import type { ExpenseDto } from "./types";

// Server helpers for expenses (limits, country currency, DTO mapping).

export const EXPENSE_COLUMNS =
  "id, spent_on, category, description, amount_minor, currency, fx_rate, reporting_amount_minor, receipt_path, over_limit, status, invoice_id, created_at";

export interface ExpenseRow {
  id: string;
  spent_on: string;
  category: ExpenseDto["category"];
  description: string;
  amount_minor: number | string;
  currency: string;
  fx_rate: string | number | null;
  reporting_amount_minor: number | string | null;
  receipt_path: string | null;
  over_limit: boolean;
  status: ExpenseDto["status"];
  invoice_id: string | null;
  created_at: string;
}

export function toExpenseDto(r: ExpenseRow): ExpenseDto {
  return {
    id: r.id,
    spent_on: r.spent_on,
    category: r.category,
    description: r.description,
    amount_minor: Number(r.amount_minor),
    currency: r.currency,
    fx_rate: r.fx_rate == null ? null : String(r.fx_rate),
    reporting_amount_minor: r.reporting_amount_minor == null ? null : Number(r.reporting_amount_minor),
    has_receipt: !!r.receipt_path,
    over_limit: r.over_limit,
    status: r.status,
    invoice_id: r.invoice_id,
    created_at: r.created_at,
  };
}

export async function countryCurrency(db: SupabaseClient, orgId: string, code: string): Promise<string | null> {
  const { data } = await db.from("nrs_countries").select("currency").eq("org_id", orgId).eq("code", code).maybeSingle();
  return (data as { currency: string } | null)?.currency ?? null;
}

/** Numeric per-category limits from a country rule's expense_limits JSON. */
export function numericLimits(raw: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    if (Number.isSafeInteger(n) && n >= 0) out[k] = n;
  }
  return out;
}

/**
 * Is the expense above the country's per-category limit (latest rule on or
 * before the spend date)? Limits are in the country currency; other
 * currencies are converted with the FX table. No rule / no rate -> false.
 */
export async function isOverLimit(
  db: SupabaseClient,
  orgId: string,
  homeCountry: string,
  spentOn: string,
  category: string,
  amountMinor: number,
  currency: string
): Promise<boolean> {
  const cal = await loadCountryCalendar(db, orgId, homeCountry, spentOn, spentOn);
  const limit = numericLimits(cal.expenseLimits)[category];
  if (limit == null) return false;
  const cc = await countryCurrency(db, orgId, homeCountry);
  if (!cc || cc === currency) return amountMinor > limit;
  const fx = await lookupFxRate(db, currency, cc, spentOn);
  if (!fx) return false;
  return convertMinor(amountMinor, fx.rate, currency, cc) > limit;
}
