import type { SupabaseClient } from "@supabase/supabase-js";
import { divRoundHalfEven } from "../money";
import type { IsoDate } from "../dates";

// FX lookups against nrs_fx_rates (global table, rate = quote per 1 base).
// Rates stay decimal strings end to end; never parsed into floats.

const SCALE = 10;

/** 1 / rate as a decimal string with 10 places (half-even). */
export function invertRate(rate: string): string {
  const m = /^(\d*)(?:\.(\d*))?$/.exec(rate.trim());
  if (!m) throw new RangeError(`Bad FX rate "${rate}"`);
  const frac = m[2] ?? "";
  const int = BigInt((m[1] || "0") + frac);
  if (int === BigInt(0)) throw new RangeError("FX rate must be positive");
  // 1/(int/10^f) = 10^f/int ; scaled by 10^SCALE
  let num = BigInt(1);
  for (let i = 0; i < frac.length + SCALE; i++) num *= BigInt(10);
  const q = divRoundHalfEven(num, int).toString().padStart(SCALE + 1, "0");
  return `${q.slice(0, q.length - SCALE)}.${q.slice(q.length - SCALE)}`;
}

/**
 * Latest rate on/before `onDate` to convert `from` -> `to`. Tries the direct
 * pair, then the inverse pair. Same currency -> "1". null when none.
 */
export async function lookupFxRate(
  db: SupabaseClient,
  from: string,
  to: string,
  onDate: IsoDate
): Promise<{ rate: string; on_date: IsoDate | null } | null> {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  if (f === t) return { rate: "1", on_date: null };
  const direct = await db
    .from("nrs_fx_rates")
    .select("rate, on_date")
    .eq("base", f)
    .eq("quote", t)
    .lte("on_date", onDate)
    .order("on_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const d = direct.data as { rate: string | number; on_date: string } | null;
  if (d) return { rate: String(d.rate), on_date: d.on_date };
  const inverse = await db
    .from("nrs_fx_rates")
    .select("rate, on_date")
    .eq("base", t)
    .eq("quote", f)
    .lte("on_date", onDate)
    .order("on_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const i = inverse.data as { rate: string | number; on_date: string } | null;
  if (i) return { rate: invertRate(String(i.rate)), on_date: i.on_date };
  return null;
}

/** The org's reporting currency (nrs_org_settings), default USD. */
export async function reportingCurrency(db: SupabaseClient, orgId: string): Promise<string> {
  const { data } = await db.from("nrs_org_settings").select("reporting_currency").eq("org_id", orgId).maybeSingle();
  const c = (data as { reporting_currency: string | null } | null)?.reporting_currency;
  return c && /^[A-Z]{3}$/.test(c) ? c : "USD";
}
