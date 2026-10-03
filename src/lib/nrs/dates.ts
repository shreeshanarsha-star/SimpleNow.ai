import type { SupabaseClient } from "@supabase/supabase-js";

// NR Synergy calendar helpers. Dates are plain "yyyy-mm-dd" strings (the
// Postgres `date` wire format) and all arithmetic is done in UTC so a
// server's own timezone never shifts a day.

export type IsoDate = string; // yyyy-mm-dd
/** ISO weekday: 1 = Monday ... 7 = Sunday (matches nrs_country_rules.working_days). */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const DEFAULT_WORKING_DAYS: number[] = [1, 2, 3, 4, 5];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseIsoDate(d: IsoDate): Date {
  if (!DATE_RE.test(d)) throw new RangeError(`Expected yyyy-mm-dd, got "${d}"`);
  const t = Date.parse(`${d}T00:00:00Z`);
  if (Number.isNaN(t)) throw new RangeError(`Invalid date "${d}"`);
  return new Date(t);
}

export function formatIsoDate(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: IsoDate, n: number): IsoDate {
  const t = parseIsoDate(d);
  t.setUTCDate(t.getUTCDate() + n);
  return formatIsoDate(t);
}

export function isoWeekday(d: IsoDate): IsoWeekday {
  const js = parseIsoDate(d).getUTCDay(); // 0 = Sunday
  return (js === 0 ? 7 : js) as IsoWeekday;
}

/** Every date from start to end, inclusive. Empty when end < start. */
export function eachDay(start: IsoDate, end: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  const last = parseIsoDate(end).getTime();
  for (let cur = parseIsoDate(start); cur.getTime() <= last; cur.setUTCDate(cur.getUTCDate() + 1)) {
    out.push(formatIsoDate(cur));
  }
  return out;
}

/**
 * Working days between start and end, both inclusive: days whose ISO
 * weekday is in `workingDays` and that are not in `holidays`.
 */
export function workingDaysBetween(
  start: IsoDate,
  end: IsoDate,
  opts: { workingDays: number[]; holidays: Set<IsoDate> }
): number {
  const working = new Set(opts.workingDays);
  let count = 0;
  for (const day of eachDay(start, end)) {
    if (working.has(isoWeekday(day)) && !opts.holidays.has(day)) count++;
  }
  return count;
}

/** The calendar date ("yyyy-mm-dd") it currently is in an IANA timezone. */
export function localDateInTz(tz: string, date: Date = new Date()): IsoDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export interface CountryHoliday {
  day: IsoDate;
  name: string;
}

export interface CountryCalendar {
  countryCode: string;
  workingDays: number[];
  stdHoursPerDay: number;
  leaveRules: Record<string, unknown>;
  expenseLimits: Record<string, unknown>;
  /** effective_from of the rule row used; null when no rule exists (Mon-Fri default). */
  ruleEffectiveFrom: IsoDate | null;
  holidays: Set<IsoDate>;
  holidayList: CountryHoliday[];
}

/**
 * Working rules + holidays for one country over [from, to]. Uses the latest
 * nrs_country_rules row with effective_from <= from; falls back to Mon-Fri,
 * 8h when the country has no rule yet. Works with either the user (RLS)
 * client or the service-role client.
 */
export async function loadCountryCalendar(
  supabase: SupabaseClient,
  orgId: string,
  countryCode: string,
  from: IsoDate,
  to: IsoDate
): Promise<CountryCalendar> {
  const [rulesRes, holidaysRes] = await Promise.all([
    supabase
      .from("nrs_country_rules")
      .select("effective_from, working_days, std_hours_per_day, leave_rules, expense_limits")
      .eq("org_id", orgId)
      .eq("country_code", countryCode)
      .lte("effective_from", from)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("nrs_holidays")
      .select("day, name")
      .eq("org_id", orgId)
      .eq("country_code", countryCode)
      .gte("day", from)
      .lte("day", to)
      .order("day", { ascending: true }),
  ]);
  if (rulesRes.error) throw new Error(`Country rules: ${rulesRes.error.message}`);
  if (holidaysRes.error) throw new Error(`Holidays: ${holidaysRes.error.message}`);

  const rule = rulesRes.data as {
    effective_from: string;
    working_days: number[] | null;
    std_hours_per_day: number | string | null;
    leave_rules: Record<string, unknown> | null;
    expense_limits: Record<string, unknown> | null;
  } | null;
  const holidayList = ((holidaysRes.data ?? []) as CountryHoliday[]).map((h) => ({ day: h.day, name: h.name }));

  return {
    countryCode,
    workingDays: rule?.working_days?.length ? rule.working_days.map(Number) : DEFAULT_WORKING_DAYS,
    stdHoursPerDay: rule?.std_hours_per_day != null ? Number(rule.std_hours_per_day) : 8,
    leaveRules: rule?.leave_rules ?? {},
    expenseLimits: rule?.expense_limits ?? {},
    ruleEffectiveFrom: rule?.effective_from ?? null,
    holidays: new Set(holidayList.map((h) => h.day)),
    holidayList,
  };
}
