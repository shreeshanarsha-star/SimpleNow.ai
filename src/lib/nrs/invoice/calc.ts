import { convertMinor, divRoundHalfEven, sumMinor, type MinorUnits } from "../money";
import { eachDay, isoWeekday, type IsoDate } from "../dates";

// NR Synergy consultant invoice calculator. PURE: no I/O, no clock, no
// floats for money. The API route loads verified terms, the country
// calendar, approved leave, work-log days and approved unbilled expenses,
// then calls calculateInvoice(); the result (lines + snapshot) is stored
// as-is so any invoice can be reproduced from its calc_snapshot.
//
// Day counts that can be fractional (paid leave allowance, e.g. 12.5) are
// carried as integer hundredths of a day ("centidays").

export type BillingBasis = "monthly_retainer" | "pro_rata_working_days" | "day_rate";
export type InvoiceLineKind = "fee" | "proration" | "leave_deduction" | "expense" | "adjustment";

export interface CalcTerms {
  id: string;
  basis: BillingBasis;
  /** Monthly fee (retainer / pro-rata) or day rate (day_rate), minor units. */
  fee_minor: MinorUnits;
  currency: string;
  /** Decimal string or number, e.g. "12.5". */
  paid_leave_days_per_year: string | number;
  reimbursables: string[];
  clause_refs: Record<string, unknown>;
  effective_from: IsoDate;
  effective_to: IsoDate | null;
}

export interface CalcLeave {
  id: string;
  type: string;
  starts_on: IsoDate;
  ends_on: IsoDate;
}

export interface CalcExpense {
  id: string;
  spent_on: IsoDate;
  category: string;
  description: string;
  amount_minor: MinorUnits;
  currency: string;
  /** Units of invoice currency per 1 unit of expense currency; required when currencies differ. */
  rate_to_invoice_currency?: string | null;
}

export interface CalcInput {
  periodStart: IsoDate;
  periodEnd: IsoDate;
  terms: CalcTerms;
  calendar: {
    countryCode: string;
    workingDays: number[];
    /** Holidays covering at least Jan 1 of the period's year through periodEnd's month end. */
    holidays: IsoDate[];
  };
  /** Approved leave of the member that overlaps [Jan 1 of the year, periodEnd]. */
  approvedLeave: CalcLeave[];
  /** Distinct days with a work log in the period (used by day_rate). */
  workLogDays: IsoDate[];
  /** Approved, not-yet-invoiced expenses. */
  expenses: CalcExpense[];
}

export interface CalcLine {
  sort: number;
  kind: InvoiceLineKind;
  description: string;
  /** Decimal string with 2 places (numeric(10,2) column). */
  quantity: string;
  unit_minor: MinorUnits;
  amount_minor: MinorUnits;
  source: Record<string, unknown>;
}

export interface CalcSkipped {
  expense_id: string;
  reason: "currency_without_rate" | "not_reimbursable" | "after_period";
}

export interface CalcResult {
  currency: string;
  lines: CalcLine[];
  subtotal_minor: MinorUnits;
  expenses_minor: MinorUnits;
  total_minor: MinorUnits;
  /** Expense ids that became invoice lines. */
  expense_ids: string[];
  snapshot: Record<string, unknown>;
}

export class InvoiceCalcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvoiceCalcError";
  }
}

const H = BigInt(100);

/** "12.5" -> 1250 centidays. Rejects negatives and more than 2 decimals of precision are rounded half-even. */
export function toCentidays(v: string | number): number {
  const s = typeof v === "number" ? String(v) : v.trim();
  const m = /^(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (!m[1] && !m[2])) throw new InvoiceCalcError(`Not a day count: "${s}"`);
  const whole = BigInt(m[1] || "0");
  const fracRaw = m[2] ?? "";
  const frac3 = (fracRaw + "000").slice(0, 3);
  const thousandths = whole * BigInt(1000) + BigInt(frac3 || "0");
  return Number(divRoundHalfEven(thousandths, BigInt(10)));
}

/** 1250 -> "12.50" */
export function centidaysToString(c: number): string {
  const neg = c < 0;
  const a = Math.abs(c);
  return `${neg ? "-" : ""}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}

function dayCountString(days: number): string {
  return centidaysToString(days * 100);
}

export function monthBounds(d: IsoDate): { start: IsoDate; end: IsoDate } {
  const [y, m] = d.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

/** The calendar month before `today` (default period for "Generate invoice"). */
export function previousMonth(today: IsoDate): { start: IsoDate; end: IsoDate } {
  const [y, m] = today.split("-").map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return monthBounds(`${py}-${String(pm).padStart(2, "0")}-01`);
}

/** NRS-{YYYY}{MM}-{last 8 of member id, upper case}. */
export function invoiceNumber(periodStart: IsoDate, memberId: string): string {
  const [y, m] = periodStart.split("-");
  const suffix = memberId.replace(/[^0-9a-zA-Z]/g, "").slice(-8).toUpperCase().padStart(8, "0");
  return `NRS-${y}${m}-${suffix}`;
}

function workingDaySet(start: IsoDate, end: IsoDate, workingDays: number[], holidays: Set<IsoDate>): IsoDate[] {
  if (end < start) return [];
  const wd = new Set(workingDays);
  return eachDay(start, end).filter((d) => wd.has(isoWeekday(d)) && !holidays.has(d));
}

function clip(aStart: IsoDate, aEnd: IsoDate, bStart: IsoDate, bEnd: IsoDate): [IsoDate, IsoDate] | null {
  const s = aStart > bStart ? aStart : bStart;
  const e = aEnd < bEnd ? aEnd : bEnd;
  return s <= e ? [s, e] : null;
}

const LEAVE_TYPES = new Set(["annual", "sick", "personal", "unavailable", "unpaid"]);

export function calculateInvoice(input: CalcInput): CalcResult {
  const { periodStart, periodEnd, terms, calendar } = input;
  if (periodEnd < periodStart) throw new InvoiceCalcError("Period end is before period start");
  const month = monthBounds(periodStart);
  if (periodEnd > month.end) throw new InvoiceCalcError("An invoice period must stay within one calendar month");
  if (!Number.isSafeInteger(terms.fee_minor) || terms.fee_minor < 0) throw new InvoiceCalcError("Invalid fee");
  if (terms.effective_from > periodEnd || (terms.effective_to && terms.effective_to < periodStart)) {
    throw new InvoiceCalcError("Contract terms are not effective in this period");
  }

  // Terms may start/end inside the period: bill only the covered part.
  const billStart = terms.effective_from > periodStart ? terms.effective_from : periodStart;
  const billEnd = terms.effective_to && terms.effective_to < periodEnd ? terms.effective_to : periodEnd;

  const holidays = new Set(calendar.holidays);
  const monthWd = workingDaySet(month.start, month.end, calendar.workingDays, holidays);
  const billWd = workingDaySet(billStart, billEnd, calendar.workingDays, holidays);
  const monthWdCount = monthWd.length;
  const billWdCount = billWd.length;
  const holidaysInPeriod = calendar.holidays.filter((d) => d >= billStart && d <= billEnd).sort();

  // Leave working days, inside the billed range and earlier in the same year.
  const yearStart = `${periodStart.slice(0, 4)}-01-01`;
  const dayBeforeBill = eachDay(yearStart, billStart).slice(0, -1);
  const priorEnd = dayBeforeBill.length ? dayBeforeBill[dayBeforeBill.length - 1] : null;
  const leaveInPeriod: { id: string; type: string; days: IsoDate[] }[] = [];
  let priorLeaveDays = 0;
  for (const l of input.approvedLeave) {
    if (!LEAVE_TYPES.has(l.type)) continue;
    const inP = clip(l.starts_on, l.ends_on, billStart, billEnd);
    if (inP) {
      const days = workingDaySet(inP[0], inP[1], calendar.workingDays, holidays);
      if (days.length) leaveInPeriod.push({ id: l.id, type: l.type, days });
    }
    if (priorEnd) {
      const pr = clip(l.starts_on, l.ends_on, yearStart, priorEnd);
      if (pr && l.type !== "unpaid") priorLeaveDays += workingDaySet(pr[0], pr[1], calendar.workingDays, holidays).length;
    }
  }
  const leaveDaySet = new Set(leaveInPeriod.flatMap((l) => l.days));
  const unpaidDays = leaveInPeriod.filter((l) => l.type === "unpaid").reduce((n, l) => n + l.days.length, 0);
  const paidTypeDays = leaveDaySet.size - unpaidDays;

  const allowanceCd = toCentidays(terms.paid_leave_days_per_year);
  const remainingCd = Math.max(0, allowanceCd - priorLeaveDays * 100);
  const excessPaidCd = Math.max(0, paidTypeDays * 100 - remainingCd);
  const deductCd = excessPaidCd + unpaidDays * 100;

  const clauses = terms.clause_refs ?? {};
  const lines: CalcLine[] = [];
  const push = (l: Omit<CalcLine, "sort">) => lines.push({ ...l, sort: lines.length + 1 });
  const fee = BigInt(terms.fee_minor);
  const monthWdB = BigInt(Math.max(1, monthWdCount));
  const dailyFromMonthly = Number(divRoundHalfEven(fee, monthWdB));

  if (terms.basis === "monthly_retainer" || terms.basis === "pro_rata_working_days") {
    const fullMonth = billStart === month.start && billEnd === month.end;
    if (terms.basis === "monthly_retainer" && fullMonth) {
      push({
        kind: "fee",
        description: "Monthly retainer",
        quantity: "1.00",
        unit_minor: terms.fee_minor,
        amount_minor: terms.fee_minor,
        source: { basis: terms.basis, terms_id: terms.id, clause: clauses.fee ?? null, month: month.start.slice(0, 7) },
      });
    } else {
      if (monthWdCount === 0) throw new InvoiceCalcError("The month has no working days under the country rules");
      const amount = Number(divRoundHalfEven(fee * BigInt(billWdCount), monthWdB));
      push({
        kind: terms.basis === "monthly_retainer" ? "proration" : "fee",
        description:
          terms.basis === "monthly_retainer"
            ? `Retainer pro-rated: ${billWdCount} of ${monthWdCount} working days`
            : `Fee for ${billWdCount} of ${monthWdCount} working days`,
        quantity: dayCountString(billWdCount),
        unit_minor: dailyFromMonthly,
        amount_minor: amount,
        source: {
          basis: terms.basis,
          terms_id: terms.id,
          clause: clauses.fee ?? clauses.basis ?? null,
          working_days_billed: billWdCount,
          working_days_in_month: monthWdCount,
          monthly_fee_minor: terms.fee_minor,
        },
      });
    }
    if (deductCd > 0) {
      const amount = -Number(divRoundHalfEven(fee * BigInt(deductCd), monthWdB * H));
      push({
        kind: "leave_deduction",
        description:
          unpaidDays > 0 && excessPaidCd > 0
            ? "Leave beyond paid allowance and unpaid leave"
            : unpaidDays > 0
              ? "Unpaid leave"
              : "Leave beyond paid allowance",
        quantity: centidaysToString(deductCd),
        unit_minor: -dailyFromMonthly,
        amount_minor: amount,
        source: {
          clause: clauses.paid_leave ?? clauses.leave ?? null,
          allowance_days: centidaysToString(allowanceCd),
          used_before_period_days: priorLeaveDays,
          remaining_days: centidaysToString(remainingCd),
          leave_days_in_period: leaveDaySet.size,
          unpaid_days: unpaidDays,
          deducted_days: centidaysToString(deductCd),
          leave_ids: leaveInPeriod.map((l) => l.id),
          working_days_in_month: monthWdCount,
        },
      });
    }
  } else {
    // day_rate: pay each distinct logged day in the billed range that is not approved leave.
    const worked = Array.from(new Set(input.workLogDays))
      .filter((d) => d >= billStart && d <= billEnd && !leaveDaySet.has(d))
      .sort();
    push({
      kind: "fee",
      description: `Day rate × ${worked.length} day${worked.length === 1 ? "" : "s"} worked`,
      quantity: dayCountString(worked.length),
      unit_minor: terms.fee_minor,
      amount_minor: Number(fee * BigInt(worked.length)),
      source: { basis: terms.basis, terms_id: terms.id, clause: clauses.fee ?? null, work_log_days: worked },
    });
  }

  // Expenses.
  const allowAll = !terms.reimbursables.length || terms.reimbursables.includes("all");
  const allowed = new Set(terms.reimbursables);
  const skipped: CalcSkipped[] = [];
  const expenseIds: string[] = [];
  const sortedExpenses = [...input.expenses].sort((a, b) => (a.spent_on < b.spent_on ? -1 : a.spent_on > b.spent_on ? 1 : 0));
  for (const e of sortedExpenses) {
    if (e.spent_on > periodEnd) {
      skipped.push({ expense_id: e.id, reason: "after_period" });
      continue;
    }
    if (!allowAll && !allowed.has(e.category)) {
      skipped.push({ expense_id: e.id, reason: "not_reimbursable" });
      continue;
    }
    let amount = e.amount_minor;
    let rate: string | null = null;
    if (e.currency.toUpperCase() !== terms.currency.toUpperCase()) {
      if (!e.rate_to_invoice_currency) {
        skipped.push({ expense_id: e.id, reason: "currency_without_rate" });
        continue;
      }
      rate = e.rate_to_invoice_currency;
      amount = convertMinor(e.amount_minor, rate, e.currency, terms.currency);
    }
    expenseIds.push(e.id);
    push({
      kind: "expense",
      description: `${e.spent_on} · ${e.description}`,
      quantity: "1.00",
      unit_minor: amount,
      amount_minor: amount,
      source: {
        expense_id: e.id,
        category: e.category,
        original_minor: e.amount_minor,
        original_currency: e.currency,
        fx_rate: rate,
        clause: clauses.reimbursables ?? clauses.expenses ?? null,
      },
    });
  }

  const subtotal = sumMinor(lines.filter((l) => l.kind !== "expense").map((l) => l.amount_minor));
  const expensesTotal = sumMinor(lines.filter((l) => l.kind === "expense").map((l) => l.amount_minor));
  const total = sumMinor([subtotal, expensesTotal]);
  if (total < 0) throw new InvoiceCalcError("The invoice total would be negative. Check leave and terms.");

  return {
    currency: terms.currency,
    lines,
    subtotal_minor: subtotal,
    expenses_minor: expensesTotal,
    total_minor: total,
    expense_ids: expenseIds,
    snapshot: {
      version: 1,
      period: { start: periodStart, end: periodEnd, billed_start: billStart, billed_end: billEnd },
      terms: {
        id: terms.id,
        basis: terms.basis,
        fee_minor: terms.fee_minor,
        currency: terms.currency,
        paid_leave_days_per_year: String(terms.paid_leave_days_per_year),
        reimbursables: terms.reimbursables,
        effective_from: terms.effective_from,
        effective_to: terms.effective_to,
        clause_refs: clauses,
      },
      calendar: {
        country: calendar.countryCode,
        working_days: calendar.workingDays,
        working_days_in_month: monthWdCount,
        working_days_billed: billWdCount,
        holidays_in_period: holidaysInPeriod,
      },
      leave: {
        allowance_days: centidaysToString(allowanceCd),
        used_before_period_days: priorLeaveDays,
        in_period: leaveInPeriod.map((l) => ({ id: l.id, type: l.type, days: l.days })),
        deducted_days: centidaysToString(deductCd),
      },
      work_log_days: terms.basis === "day_rate" ? Array.from(new Set(input.workLogDays)).sort() : undefined,
      expenses: { included: expenseIds, skipped },
    },
  };
}
