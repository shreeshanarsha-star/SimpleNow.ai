// NR Synergy · Leave balance strings (English). Placeholders use {name}.

export const leave = {
  balancesHeading: "Leave balance {year}",
  balancesHint: "Calendar year. Remaining = entitlement − used. Pending requests are held until they're decided.",
  balancesError: "We couldn't load your leave balance right now.",
  types: {
    annual: "Annual leave",
    sick: "Sick leave",
    personal: "Personal leave",
    unavailable: "Unavailable",
    unpaid: "Unpaid leave",
  },
  consultantAnnual: "Paid days off",
  entitlement: "Entitlement",
  used: "Used",
  pending: "Pending",
  remaining: "Remaining",
  available: "Available",
  daysShort: "{n} d",
  days: "{n} days",
  dayOne: "1 day",
  ofEntitlement: "{remaining} of {entitlement} days left",
  barLabel: "{type}: {used} used, {pending} pending, {remaining} remaining of {entitlement} days",
  proRata: "Pro-rated for {from} – {to} (full year {full} days).",
  notEntitled: "No allowance for this type.",
  unpaidNote: "Unpaid leave is not limited by a balance. It is deducted from pay or your invoice.",
  unavailableNote: "Marking yourself unavailable is not limited by a balance.",
  sourceContract: "From your verified contract.",
  sourceCountry: "From your country's leave rules.",
  sourceNone: "HR hasn't set an allowance for you yet.",

  formRemaining: "{type}: {available} of {entitlement} days available",
  formRemainingPending: "({pending} pending)",
  formUnlimited: "{type} is not limited by a balance.",
  formExceeds: "This request needs {requested} days but only {available} are available in {year}.",
  formNoAllowance: "You have no {type} allowance for {year}.",

  serverExceeds: "Not enough {type} left: this request needs {requested} working days in {year} but {available} are available.",

  team: {
    heading: "Team leave balances",
    hint: "Direct reports · {year}. Remaining after approved leave; pending shown separately.",
    hintHr: "Everyone in the organisation · {year}. Remaining after approved leave; pending shown separately.",
    empty: "You don't have any direct reports yet.",
    emptyHr: "No active members yet.",
    error: "We couldn't load team leave balances.",
    member: "Team member",
    engagement: { consultant: "Consultant", payroll: "Payroll", none: "No engagement" },
    remainingOf: "{remaining} / {entitlement}",
    pendingTag: "{n} pending",
    noAllowance: "—",
    unpaidUsed: "Unpaid taken",
  },
} as const;

export function fillLeave(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** "2.5" not "2.50"; whole numbers without decimals. */
export function fmtDays(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}
