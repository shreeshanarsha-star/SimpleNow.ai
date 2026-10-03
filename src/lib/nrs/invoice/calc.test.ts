// Run: node -r sucrase/register src/lib/nrs/invoice/calc.test.ts
import assert from "node:assert/strict";
import { calculateInvoice, invoiceNumber, previousMonth, toCentidays, type CalcInput, type CalcTerms } from "./calc";

const MX_HOLIDAYS = ["2026-09-16"]; // Mexican Independence Day (Wed)
const MON_FRI = [1, 2, 3, 4, 5];

function terms(over: Partial<CalcTerms>): CalcTerms {
  return {
    id: "t1",
    basis: "monthly_retainer",
    fee_minor: 880000, // 8,800.00
    currency: "USD",
    paid_leave_days_per_year: "12",
    reimbursables: [],
    clause_refs: { fee: "5.1", paid_leave: "7.2" },
    effective_from: "2026-01-01",
    effective_to: null,
    ...over,
  };
}

function input(over: Partial<CalcInput>): CalcInput {
  return {
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    terms: terms({}),
    calendar: { countryCode: "MX", workingDays: MON_FRI, holidays: MX_HOLIDAYS },
    approvedLeave: [],
    workLogDays: [],
    expenses: [],
    ...over,
  };
}

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok - ${name}`);
}

// September 2026: 22 weekdays, minus 16 Sep holiday = 21 working days.

test("monthly_retainer full month = fee, no deduction within allowance", () => {
  const r = calculateInvoice(
    input({ approvedLeave: [{ id: "l1", type: "annual", starts_on: "2026-09-07", ends_on: "2026-09-08" }] })
  );
  assert.equal(r.lines.length, 1);
  assert.equal(r.lines[0].kind, "fee");
  assert.equal(r.total_minor, 880000);
  assert.equal((r.snapshot.calendar as { working_days_in_month: number }).working_days_in_month, 21);
});

test("monthly_retainer deducts leave beyond remaining allowance", () => {
  // 11 days used earlier in the year, 3 days in September -> 2 excess days.
  const r = calculateInvoice(
    input({
      approvedLeave: [
        { id: "a", type: "annual", starts_on: "2026-03-02", ends_on: "2026-03-16" }, // 11 working days
        { id: "b", type: "annual", starts_on: "2026-09-14", ends_on: "2026-09-17" }, // 14,15,(16 hol),17 = 3
      ],
    })
  );
  const ded = r.lines.find((l) => l.kind === "leave_deduction");
  assert.ok(ded, "deduction line expected");
  assert.equal(ded.quantity, "2.00");
  // 880000 * 2 / 21 = 83809.52 -> 83810
  assert.equal(ded.amount_minor, -83810);
  assert.equal(r.total_minor, 880000 - 83810);
});

test("unpaid leave is always deducted", () => {
  const r = calculateInvoice(
    input({ approvedLeave: [{ id: "u", type: "unpaid", starts_on: "2026-09-21", ends_on: "2026-09-21" }] })
  );
  const ded = r.lines.find((l) => l.kind === "leave_deduction");
  assert.equal(ded?.amount_minor, -41905); // 880000/21 = 41904.76
});

test("pro_rata_working_days for a partial engagement month", () => {
  const r = calculateInvoice(input({ terms: terms({ basis: "pro_rata_working_days", effective_from: "2026-09-21" }) }));
  // 21..30 Sep: 21,22,23,24,25,28,29,30 = 8 working days of 21
  assert.equal(r.lines[0].quantity, "8.00");
  assert.equal(r.lines[0].amount_minor, 335238); // 880000*8/21 = 335238.09
  assert.equal(r.total_minor, 335238);
});

test("pro_rata full month equals the fee exactly", () => {
  const r = calculateInvoice(input({ terms: terms({ basis: "pro_rata_working_days" }) }));
  assert.equal(r.total_minor, 880000);
});

test("day_rate counts distinct logged days, excluding approved leave", () => {
  const r = calculateInvoice(
    input({
      terms: terms({ basis: "day_rate", fee_minor: 45000, currency: "EUR" }),
      workLogDays: ["2026-09-01", "2026-09-02", "2026-09-02", "2026-09-03", "2026-09-04", "2026-10-01"],
      approvedLeave: [{ id: "x", type: "annual", starts_on: "2026-09-04", ends_on: "2026-09-04" }],
    })
  );
  assert.equal(r.lines[0].quantity, "3.00");
  assert.equal(r.total_minor, 135000);
  assert.equal(r.currency, "EUR");
});

test("expenses: same currency, FX converted, not reimbursable, missing rate", () => {
  const r = calculateInvoice(
    input({
      terms: terms({ reimbursables: ["travel", "lodging"] }),
      expenses: [
        { id: "e1", spent_on: "2026-09-10", category: "travel", description: "Taxi", amount_minor: 4550, currency: "USD" },
        { id: "e2", spent_on: "2026-09-11", category: "lodging", description: "Hotel", amount_minor: 180000, currency: "MXN", rate_to_invoice_currency: "0.0550000000" },
        { id: "e3", spent_on: "2026-09-12", category: "meals", description: "Lunch", amount_minor: 2000, currency: "USD" },
        { id: "e4", spent_on: "2026-09-12", category: "travel", description: "Train", amount_minor: 3000, currency: "EUR" },
      ],
    })
  );
  assert.deepEqual(r.expense_ids, ["e1", "e2"]);
  assert.equal(r.expenses_minor, 4550 + 9900);
  assert.equal(r.total_minor, 880000 + 14450);
  const skipped = (r.snapshot.expenses as { skipped: { expense_id: string; reason: string }[] }).skipped;
  assert.deepEqual(skipped.map((s) => s.reason), ["not_reimbursable", "currency_without_rate"]);
  for (const l of r.lines) assert.ok(Number.isSafeInteger(l.amount_minor) && l.source && typeof l.source === "object");
});

test("helpers", () => {
  assert.equal(invoiceNumber("2026-09-01", "6b1f2c3d-aaaa-bbbb-cccc-12345678ab9f"), "NRS-202609-5678AB9F");
  assert.deepEqual(previousMonth("2026-01-15"), { start: "2025-12-01", end: "2025-12-31" });
  assert.equal(toCentidays("12.5"), 1250);
  assert.throws(() => calculateInvoice(input({ periodEnd: "2026-10-02" })));
});

console.log(`\n${passed} tests passed`);
