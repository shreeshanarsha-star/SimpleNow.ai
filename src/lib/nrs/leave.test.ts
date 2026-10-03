// Run: node -r sucrase/register src/lib/nrs/leave.test.ts
import assert from "node:assert/strict";
import {
  checkLeaveRequest,
  computeLeaveBalances,
  engagedWindow,
  leaveDaysInYear,
  roundHalf,
  ruleDays,
  splitWorkingDaysByYear,
  termsForYear,
  type LeaveBalanceInput,
  type LeaveBalances,
} from "./leave";

const MON_FRI = [1, 2, 3, 4, 5];
const cal = { workingDays: MON_FRI, holidays: [] as string[] };

function base(over: Partial<LeaveBalanceInput>): LeaveBalanceInput {
  return {
    year: 2026,
    member: { joined_on: null, left_on: null },
    engagements: [],
    contractTerms: [],
    countryRules: [],
    calendar: cal,
    leave: [],
    ...over,
  };
}

// --- roundHalf ---------------------------------------------------------------
assert.equal(roundHalf(2.24), 2);
assert.equal(roundHalf(2.25), 2.5);
assert.equal(roundHalf(2.74), 2.5);
assert.equal(roundHalf(2.75), 3);
assert.equal(roundHalf(0), 0);

// --- ruleDays ----------------------------------------------------------------
assert.equal(ruleDays({ payroll: { annual: 20, sick: "7" } }, "payroll", "annual"), 20);
assert.equal(ruleDays({ payroll: { annual: 20, sick: "7" } }, "payroll", "sick"), 7);
assert.equal(ruleDays({ payroll: { annual: 20 } }, "payroll", "personal"), 0);
assert.equal(ruleDays({ payroll: { annual: -3 } }, "payroll", "annual"), 0);
assert.equal(ruleDays({}, "payroll", "annual"), 0);
assert.equal(ruleDays(null, "payroll", "annual"), 0);

// --- Consultant: latest VERIFIED terms effective in the year -------------------
{
  const terms = [
    { effective_from: "2025-01-01", effective_to: "2025-12-31", paid_leave_days_per_year: "10.00", verified_at: "2025-01-02T00:00:00Z" },
    { effective_from: "2026-03-01", effective_to: null, paid_leave_days_per_year: "15.00", verified_at: "2026-03-01T00:00:00Z" },
    { effective_from: "2026-06-01", effective_to: null, paid_leave_days_per_year: "30.00", verified_at: null }, // unverified: ignored
  ];
  assert.equal(termsForYear(terms, 2026)?.paid_leave_days_per_year, "15.00");
  assert.equal(termsForYear(terms, 2025)?.paid_leave_days_per_year, "10.00");

  const b = computeLeaveBalances(
    base({
      engagements: [{ type: "consultant", starts_on: "2024-05-01", ends_on: null }],
      contractTerms: terms,
      leave: [
        { type: "annual", starts_on: "2026-02-02", ends_on: "2026-02-06", working_days: "5.00", status: "approved" },
        { type: "annual", starts_on: "2026-04-06", ends_on: "2026-04-07", working_days: 2, status: "pending" },
        { type: "annual", starts_on: "2026-05-04", ends_on: "2026-05-04", working_days: 1, status: "rejected" },
        { type: "unpaid", starts_on: "2026-06-01", ends_on: "2026-06-03", working_days: 3, status: "approved" },
      ],
    })
  );
  assert.equal(b.engagementType, "consultant");
  assert.equal(b.source, "contract");
  assert.equal(b.proRataFactor, 1);
  assert.equal(b.byType.annual.entitlement, 15);
  assert.equal(b.byType.annual.used, 5);
  assert.equal(b.byType.annual.pending, 2);
  assert.equal(b.byType.annual.remaining, 10);
  assert.equal(b.byType.annual.available, 8);
  // other paid types: 0; unpaid / unavailable unlimited
  assert.equal(b.byType.sick.entitlement, 0);
  assert.equal(b.byType.personal.entitlement, 0);
  assert.equal(b.byType.unpaid.entitlement, null);
  assert.equal(b.byType.unpaid.remaining, null);
  assert.equal(b.byType.unpaid.used, 3);
  assert.equal(b.byType.unavailable.entitlement, null);
}

// Consultant without verified terms: nothing to take.
{
  const b = computeLeaveBalances(base({ engagements: [{ type: "consultant", starts_on: "2026-01-01", ends_on: null }] }));
  assert.equal(b.source, "none");
  assert.equal(b.byType.annual.entitlement, 0);
}

// --- Payroll: latest country rule effective in the year ------------------------
{
  const b = computeLeaveBalances(
    base({
      engagements: [{ type: "payroll", starts_on: "2020-01-01", ends_on: null }],
      countryRules: [
        { effective_from: "2024-01-01", leave_rules: { payroll: { annual: 15, sick: 5 } } },
        { effective_from: "2026-01-01", leave_rules: { payroll: { annual: 20, sick: 7, personal: 2 }, consultant: {} } },
        { effective_from: "2027-01-01", leave_rules: { payroll: { annual: 25 } } }, // next year: ignored
      ],
      leave: [
        { type: "sick", starts_on: "2026-03-02", ends_on: "2026-03-03", working_days: 2, status: "approved" },
        { type: "annual", starts_on: "2026-07-06", ends_on: "2026-07-10", working_days: 5, status: "approved" },
      ],
    })
  );
  assert.equal(b.source, "country_rules");
  assert.equal(b.byType.annual.entitlement, 20);
  assert.equal(b.byType.annual.remaining, 15);
  assert.equal(b.byType.sick.entitlement, 7);
  assert.equal(b.byType.sick.remaining, 5);
  assert.equal(b.byType.personal.entitlement, 2);
  assert.equal(b.byType.personal.remaining, 2);
}

// --- Pro-rata ------------------------------------------------------------------
// Joiner on Jul 1 2026 (184 of 365 days): 20 * 184/365 = 10.08 -> 10; 7 * 0.504 = 3.53 -> 3.5
{
  const b = computeLeaveBalances(
    base({
      engagements: [{ type: "payroll", starts_on: "2026-07-01", ends_on: null }],
      countryRules: [{ effective_from: "2026-01-01", leave_rules: { payroll: { annual: 20, sick: 7 } } }],
    })
  );
  assert.deepEqual(b.window, { from: "2026-07-01", to: "2026-12-31" });
  assert.equal(b.byType.annual.entitlement, 10);
  assert.equal(b.byType.annual.fullEntitlement, 20);
  assert.equal(b.byType.sick.entitlement, 3.5);
}
// Leaver on Mar 31 2026 (90 days): 15 * 90/365 = 3.70 -> 3.5 (consultant)
{
  const b = computeLeaveBalances(
    base({
      engagements: [{ type: "consultant", starts_on: "2025-01-01", ends_on: "2026-03-31" }],
      contractTerms: [{ effective_from: "2025-01-01", effective_to: null, paid_leave_days_per_year: 15, verified_at: "2025-01-01" }],
    })
  );
  assert.equal(b.byType.annual.entitlement, 3.5);
}
// No engagement rows: member joined_on / left_on decide the window.
{
  const w = engagedWindow({ year: 2026, member: { joined_on: "2026-10-01", left_on: null }, engagements: [] }, null);
  assert.deepEqual(w, { from: "2026-10-01", to: "2026-12-31" });
  const none = engagedWindow({ year: 2026, member: { joined_on: "2027-02-01", left_on: null }, engagements: [] }, null);
  assert.equal(none, null);
}
// Back-to-back engagements of the same type are merged.
{
  const w = engagedWindow(
    {
      year: 2026,
      member: { joined_on: null, left_on: null },
      engagements: [
        { type: "payroll", starts_on: "2026-02-01", ends_on: "2026-05-31" },
        { type: "payroll", starts_on: "2026-06-01", ends_on: null },
      ],
    },
    "payroll"
  );
  assert.deepEqual(w, { from: "2026-02-01", to: "2026-12-31" });
}

// --- Cross-year leave ----------------------------------------------------------
// Mon 2026-12-28 .. Fri 2027-01-08 = 10 working days: 4 in 2026 (28-31), 6 in 2027 (1, 4-8).
{
  const calSet = { workingDays: MON_FRI, holidays: new Set<string>() };
  const row = { starts_on: "2026-12-28", ends_on: "2027-01-08", working_days: 10 };
  assert.equal(leaveDaysInYear(row, 2026, calSet), 4);
  assert.equal(leaveDaysInYear(row, 2027, calSet), 6);
  // with a Jan 1 holiday the 2027 part is 5
  assert.equal(leaveDaysInYear({ ...row, working_days: 9 }, 2027, { workingDays: MON_FRI, holidays: new Set(["2027-01-01"]) }), 5);
  assert.deepEqual(Array.from(splitWorkingDaysByYear("2026-12-28", "2027-01-08", calSet).entries()), [
    [2026, 4],
    [2027, 6],
  ]);

  const input = base({
    engagements: [{ type: "payroll", starts_on: "2020-01-01", ends_on: null }],
    countryRules: [{ effective_from: "2020-01-01", leave_rules: { payroll: { annual: 20 } } }],
    leave: [{ type: "annual", ...row, status: "approved" }],
  });
  const y26 = computeLeaveBalances(input);
  assert.equal(y26.byType.annual.used, 4);
  assert.equal(y26.byType.annual.remaining, 16);
  const y27 = computeLeaveBalances({ ...input, year: 2027 });
  assert.equal(y27.byType.annual.used, 6);
  assert.equal(y27.byType.annual.remaining, 14);
}

// --- checkLeaveRequest -----------------------------------------------------------
{
  const mk = (available: number): LeaveBalances =>
    ({
      byType: {
        annual: { type: "annual", entitlement: 10, fullEntitlement: 10, used: 0, pending: 0, remaining: available, available },
      },
    }) as unknown as LeaveBalances;
  const balances = new Map<number, LeaveBalances>([
    [2026, mk(3)],
    [2027, mk(10)],
  ]);
  assert.equal(checkLeaveRequest("annual", new Map([[2026, 3]]), balances), null);
  assert.deepEqual(checkLeaveRequest("annual", new Map([[2026, 4]]), balances), { year: 2026, requested: 4, available: 3 });
  assert.deepEqual(
    checkLeaveRequest("annual", new Map([[2026, 2], [2027, 11]]), balances),
    { year: 2027, requested: 11, available: 10 }
  );
  assert.equal(checkLeaveRequest("unpaid", new Map([[2026, 50]]), balances), null);
  assert.equal(checkLeaveRequest("unavailable", new Map([[2026, 50]]), balances), null);
  // a year with no balance at all: nothing available
  assert.deepEqual(checkLeaveRequest("annual", new Map([[2028, 1]]), balances), { year: 2028, requested: 1, available: 0 });
}

console.log("leave.test.ts: all assertions passed");
