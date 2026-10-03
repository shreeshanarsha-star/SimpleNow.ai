import { workingDaysBetween, type IsoDate } from "./dates";

// NR Synergy leave balances. PURE: no I/O, no clock. A loader gathers the
// member's engagements, verified contract terms (consultants), country
// leave rules (payroll), the country calendar and leave rows, then calls
// computeLeaveBalances(). The leave year is the calendar year.
//
// Rules
//  * Consultant: "annual" = paid_leave_days_per_year from the latest
//    VERIFIED nrs_contract_terms row effective in the year. Other paid
//    types get 0. Unpaid / unavailable are unlimited.
//  * Payroll: nrs_country_rules.leave_rules.payroll[type] from the latest
//    rule row effective in the year for the member's home country.
//  * Pro-rata for joiners / leavers: the full entitlement times the share
//    of calendar days of the year the member was engaged (engagement
//    starts_on/ends_on, else member joined_on/left_on), rounded to 0.5.
//  * Used = approved leave working days inside the year; pending = pending
//    requests. Leave that crosses Dec 31 / Jan 1 is split by working days.
//  * Remaining = entitlement - used. Available = remaining - pending (what a
//    new request can still take).

export type LeaveType = "annual" | "sick" | "personal" | "unavailable" | "unpaid";
export type EngagementType = "consultant" | "payroll";

export const LEAVE_TYPES: readonly LeaveType[] = ["annual", "sick", "personal", "unavailable", "unpaid"];
/** Types with a counted allowance (shown as balance cards). */
export const BALANCE_TYPES: readonly LeaveType[] = ["annual", "sick", "personal"];
/** Types never limited by a balance. */
export const UNLIMITED_TYPES: readonly LeaveType[] = ["unpaid", "unavailable"];

export function isLeaveType(v: unknown): v is LeaveType {
  return typeof v === "string" && (LEAVE_TYPES as readonly string[]).includes(v);
}

export function isUnlimitedType(t: LeaveType): boolean {
  return UNLIMITED_TYPES.includes(t);
}

export interface BalanceEngagement {
  type: EngagementType;
  starts_on: IsoDate;
  ends_on: IsoDate | null;
}

export interface BalanceContractTerms {
  effective_from: IsoDate;
  effective_to: IsoDate | null;
  paid_leave_days_per_year: number | string;
  verified_at: string | null;
}

export interface BalanceCountryRule {
  effective_from: IsoDate;
  leave_rules: Record<string, unknown> | null;
}

export interface BalanceLeaveRow {
  type: string;
  starts_on: IsoDate;
  ends_on: IsoDate;
  working_days: number | string;
  status: string;
}

export interface LeaveBalanceInput {
  year: number;
  member: { joined_on: IsoDate | null; left_on: IsoDate | null };
  engagements: BalanceEngagement[];
  contractTerms: BalanceContractTerms[];
  /** Rule rows of the member's home country (any order). */
  countryRules: BalanceCountryRule[];
  /** Working days + holidays of the home country inside the year (for splitting cross-year leave). */
  calendar: { workingDays: number[]; holidays: Iterable<IsoDate> };
  leave: BalanceLeaveRow[];
}

export interface LeaveTypeBalance {
  type: LeaveType;
  /** null = unlimited (unpaid / unavailable). */
  entitlement: number | null;
  /** Full-year entitlement before pro-rata (null = unlimited). */
  fullEntitlement: number | null;
  used: number;
  pending: number;
  /** entitlement - used; null when unlimited. Can go negative after HR overrides. */
  remaining: number | null;
  /** remaining - pending; null when unlimited. */
  available: number | null;
}

export interface LeaveBalances {
  year: number;
  engagementType: EngagementType | null;
  source: "contract" | "country_rules" | "none";
  /** Share of the year the member is engaged, 0..1. */
  proRataFactor: number;
  /** Engaged window inside the year, or null when not engaged in the year. */
  window: { from: IsoDate; to: IsoDate } | null;
  byType: Record<LeaveType, LeaveTypeBalance>;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export function yearBounds(year: number): { from: IsoDate; to: IsoDate } {
  const y = String(year).padStart(4, "0");
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

function daysInYear(year: number): number {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

function dayDiff(a: IsoDate, b: IsoDate): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

const maxDate = (a: IsoDate, b: IsoDate) => (a > b ? a : b);
const minDate = (a: IsoDate, b: IsoDate) => (a < b ? a : b);

/** Round to the nearest half day (2.24 -> 2, 2.25 -> 2.5). */
export function roundHalf(n: number): number {
  return Math.round(n * 2 + 1e-9) / 2;
}

/** Two-decimal tidy-up for sums of numeric(5,2) values. */
function tidy(n: number): number {
  return Math.round(n * 100) / 100;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/** Engagement overlaps [from, to]? */
function overlaps(e: { starts_on: IsoDate; ends_on: IsoDate | null }, from: IsoDate, to: IsoDate): boolean {
  return e.starts_on <= to && (e.ends_on == null || e.ends_on >= from);
}

/** Engagement in force for the year: the latest-starting one that overlaps it. */
export function engagementForYear(engagements: BalanceEngagement[], year: number): BalanceEngagement | null {
  const { from, to } = yearBounds(year);
  const hits = engagements.filter((e) => overlaps(e, from, to));
  hits.sort((a, b) => b.starts_on.localeCompare(a.starts_on));
  return hits[0] ?? null;
}

/**
 * Engaged window inside the year. Contiguous engagements of the same type
 * are merged; falls back to member joined_on / left_on.
 */
export function engagedWindow(
  input: Pick<LeaveBalanceInput, "year" | "member" | "engagements">,
  type: EngagementType | null
): { from: IsoDate; to: IsoDate } | null {
  const { from: y0, to: y1 } = yearBounds(input.year);
  const same = input.engagements.filter((e) => (type ? e.type === type : true) && overlaps(e, y0, y1));
  let start: IsoDate | null;
  let end: IsoDate | null;
  if (same.length) {
    start = same.reduce((m, e) => (e.starts_on < m ? e.starts_on : m), same[0].starts_on);
    end = same.some((e) => e.ends_on == null)
      ? null
      : same.reduce((m, e) => ((e.ends_on as IsoDate) > m ? (e.ends_on as IsoDate) : m), same[0].ends_on as IsoDate);
    if (input.member.joined_on && input.member.joined_on > start) start = input.member.joined_on;
    if (input.member.left_on && (end == null || input.member.left_on < end)) end = input.member.left_on;
  } else {
    start = input.member.joined_on;
    end = input.member.left_on;
  }
  const from = start ? maxDate(start, y0) : y0;
  const to = end ? minDate(end, y1) : y1;
  return from <= to ? { from, to } : null;
}

/** Latest verified contract terms effective at any point in the year. */
export function termsForYear(terms: BalanceContractTerms[], year: number): BalanceContractTerms | null {
  const { from, to } = yearBounds(year);
  const hits = terms.filter(
    (t) => !!t.verified_at && t.effective_from <= to && (t.effective_to == null || t.effective_to >= from)
  );
  hits.sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  return hits[0] ?? null;
}

/** Latest country rule effective on or before Dec 31 of the year. */
export function ruleForYear(rules: BalanceCountryRule[], year: number): BalanceCountryRule | null {
  const { to } = yearBounds(year);
  const hits = rules.filter((r) => r.effective_from <= to);
  hits.sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  return hits[0] ?? null;
}

/** Full-year days for a type from leave_rules[engagement][type]; 0 when not set. */
export function ruleDays(leaveRules: Record<string, unknown> | null | undefined, engagement: EngagementType, type: LeaveType): number {
  const block = leaveRules?.[engagement];
  if (!block || typeof block !== "object" || Array.isArray(block)) return 0;
  const n = toNumber((block as Record<string, unknown>)[type]);
  return n != null && n > 0 ? n : 0;
}

/**
 * Working days of a leave row that fall inside the year. Rows wholly inside
 * the year use their stored working_days; rows crossing a year boundary are
 * counted on the calendar for the in-year part (capped at the stored total).
 */
export function leaveDaysInYear(
  row: Pick<BalanceLeaveRow, "starts_on" | "ends_on" | "working_days">,
  year: number,
  calendar: { workingDays: number[]; holidays: Set<IsoDate> }
): number {
  const { from, to } = yearBounds(year);
  if (row.ends_on < from || row.starts_on > to) return 0;
  const stored = toNumber(row.working_days) ?? 0;
  if (row.starts_on >= from && row.ends_on <= to) return stored;
  const part = workingDaysBetween(maxDate(row.starts_on, from), minDate(row.ends_on, to), calendar);
  return Math.min(part, stored);
}

/** Working days of [start, end] per calendar year (a request can cross Dec 31). */
export function splitWorkingDaysByYear(
  start: IsoDate,
  end: IsoDate,
  calendar: { workingDays: number[]; holidays: Set<IsoDate> }
): Map<number, number> {
  const out = new Map<number, number>();
  const y0 = Number(start.slice(0, 4));
  const y1 = Number(end.slice(0, 4));
  for (let y = y0; y <= y1; y++) {
    const { from, to } = yearBounds(y);
    const n = workingDaysBetween(maxDate(start, from), minDate(end, to), calendar);
    if (n > 0) out.set(y, n);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main calculation
// ---------------------------------------------------------------------------

export function computeLeaveBalances(input: LeaveBalanceInput): LeaveBalances {
  const { year } = input;
  const engagement = engagementForYear(input.engagements, year);
  const engagementType = engagement?.type ?? null;
  const window = engagedWindow(input, engagementType);
  const proRataFactor = window ? (dayDiff(window.from, window.to) + 1) / daysInYear(year) : 0;
  const prorated = (full: number) => (full > 0 ? roundHalf(full * proRataFactor) : 0);

  let source: LeaveBalances["source"] = "none";
  const full: Record<LeaveType, number | null> = { annual: 0, sick: 0, personal: 0, unavailable: null, unpaid: null };

  if (engagementType === "consultant") {
    const terms = termsForYear(input.contractTerms, year);
    if (terms) {
      source = "contract";
      full.annual = Math.max(0, toNumber(terms.paid_leave_days_per_year) ?? 0);
    }
  } else if (engagementType === "payroll") {
    const rule = ruleForYear(input.countryRules, year);
    if (rule) {
      source = "country_rules";
      for (const t of BALANCE_TYPES) full[t] = ruleDays(rule.leave_rules, "payroll", t);
    }
  }

  const calendar = { workingDays: input.calendar.workingDays, holidays: new Set(input.calendar.holidays) };
  const used: Record<LeaveType, number> = { annual: 0, sick: 0, personal: 0, unavailable: 0, unpaid: 0 };
  const pending: Record<LeaveType, number> = { annual: 0, sick: 0, personal: 0, unavailable: 0, unpaid: 0 };
  for (const row of input.leave) {
    if (!isLeaveType(row.type)) continue;
    if (row.status !== "approved" && row.status !== "pending") continue;
    const days = leaveDaysInYear(row, year, calendar);
    if (!days) continue;
    if (row.status === "approved") used[row.type] += days;
    else pending[row.type] += days;
  }

  const byType = {} as Record<LeaveType, LeaveTypeBalance>;
  for (const t of LEAVE_TYPES) {
    const fullDays = full[t];
    const entitlement = fullDays == null ? null : prorated(fullDays);
    const u = tidy(used[t]);
    const p = tidy(pending[t]);
    const remaining = entitlement == null ? null : tidy(entitlement - u);
    byType[t] = {
      type: t,
      entitlement,
      fullEntitlement: fullDays,
      used: u,
      pending: p,
      remaining,
      available: remaining == null ? null : tidy(remaining - p),
    };
  }

  return { year, engagementType, source, proRataFactor, window, byType };
}

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

export interface LeaveShortfall {
  year: number;
  requested: number;
  available: number;
}

/**
 * Does a new request of `type` fit the balances? `daysByYear` comes from
 * splitWorkingDaysByYear(); `balancesByYear` must hold every year in it.
 * Returns null when it fits (always for unpaid / unavailable), else the
 * first year that is short.
 */
export function checkLeaveRequest(
  type: LeaveType,
  daysByYear: Map<number, number>,
  balancesByYear: Map<number, LeaveBalances>
): LeaveShortfall | null {
  if (isUnlimitedType(type)) return null;
  for (const [year, requested] of Array.from(daysByYear.entries()).sort((a, b) => a[0] - b[0])) {
    const bal = balancesByYear.get(year)?.byType[type];
    const available = bal?.available ?? 0;
    if (requested > available + 1e-9) return { year, requested, available: Math.max(0, available) };
  }
  return null;
}

/** Leave types a member can pick, by engagement. Consultants: paid days, unavailable and unpaid. */
export function requestableTypes(engagementType: EngagementType | null): LeaveType[] {
  return engagementType === "payroll" ? ["annual", "sick", "personal", "unpaid"] : ["annual", "unavailable", "unpaid"];
}
