import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_WORKING_DAYS, type IsoDate } from "@/lib/nrs/dates";
import {
  computeLeaveBalances,
  ruleForYear,
  yearBounds,
  type BalanceContractTerms,
  type BalanceCountryRule,
  type BalanceEngagement,
  type BalanceLeaveRow,
  type LeaveBalances,
} from "@/lib/nrs/leave";

// Loads everything computeLeaveBalances() needs for one or more members and
// leave years. Uses the service-role client (contract terms are not readable
// by managers), always scoped to orgId; callers authorise WHICH members.

export interface BalanceMember {
  id: string;
  home_country: string;
  joined_on: IsoDate | null;
  left_on: IsoDate | null;
}

type Row<T> = T & { member_id: string };

function group<T>(rows: Row<T>[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) m.set(r.member_id, [...(m.get(r.member_id) ?? []), r]);
  return m;
}

export async function loadLeaveBalances(
  admin: SupabaseClient,
  orgId: string,
  members: BalanceMember[],
  years: number[]
): Promise<Map<string, Map<number, LeaveBalances>>> {
  const out = new Map<string, Map<number, LeaveBalances>>();
  if (!members.length || !years.length) return out;
  const ids = members.map((m) => m.id);
  const countries = Array.from(new Set(members.map((m) => m.home_country)));
  const yMin = Math.min(...years);
  const yMax = Math.max(...years);
  const from = yearBounds(yMin).from;
  const to = yearBounds(yMax).to;

  const [engRes, termsRes, rulesRes, holRes, leaveRes] = await Promise.all([
    admin
      .from("nrs_engagements")
      .select("member_id, type, starts_on, ends_on")
      .eq("org_id", orgId)
      .in("member_id", ids)
      .is("deleted_at", null),
    admin
      .from("nrs_contract_terms")
      .select("member_id, effective_from, effective_to, paid_leave_days_per_year, verified_at")
      .eq("org_id", orgId)
      .in("member_id", ids)
      .not("verified_at", "is", null),
    admin
      .from("nrs_country_rules")
      .select("country_code, effective_from, working_days, leave_rules")
      .eq("org_id", orgId)
      .in("country_code", countries)
      .lte("effective_from", to),
    admin
      .from("nrs_holidays")
      .select("country_code, day")
      .eq("org_id", orgId)
      .in("country_code", countries)
      .gte("day", from)
      .lte("day", to),
    admin
      .from("nrs_leave_requests")
      .select("member_id, type, starts_on, ends_on, working_days, status")
      .eq("org_id", orgId)
      .in("member_id", ids)
      .in("status", ["approved", "pending"])
      .lte("starts_on", to)
      .gte("ends_on", from),
  ]);
  for (const r of [engRes, termsRes, rulesRes, holRes, leaveRes]) {
    if (r.error) throw new Error(`Leave balances: ${r.error.message}`);
  }

  const engagements = group((engRes.data ?? []) as Row<BalanceEngagement>[]);
  const terms = group((termsRes.data ?? []) as Row<BalanceContractTerms>[]);
  const leave = group((leaveRes.data ?? []) as Row<BalanceLeaveRow>[]);

  const rulesByCountry = new Map<string, (BalanceCountryRule & { working_days: number[] | null })[]>();
  for (const r of (rulesRes.data ?? []) as (BalanceCountryRule & { country_code: string; working_days: number[] | null })[]) {
    rulesByCountry.set(r.country_code, [...(rulesByCountry.get(r.country_code) ?? []), r]);
  }
  const holidaysByCountry = new Map<string, IsoDate[]>();
  for (const h of (holRes.data ?? []) as { country_code: string; day: IsoDate }[]) {
    holidaysByCountry.set(h.country_code, [...(holidaysByCountry.get(h.country_code) ?? []), h.day]);
  }

  for (const m of members) {
    const perYear = new Map<number, LeaveBalances>();
    const rules = rulesByCountry.get(m.home_country) ?? [];
    for (const year of years) {
      const rule = ruleForYear(rules, year) as (BalanceCountryRule & { working_days: number[] | null }) | null;
      const { from: y0, to: y1 } = yearBounds(year);
      perYear.set(
        year,
        computeLeaveBalances({
          year,
          member: { joined_on: m.joined_on, left_on: m.left_on },
          engagements: engagements.get(m.id) ?? [],
          contractTerms: terms.get(m.id) ?? [],
          countryRules: rules,
          calendar: {
            workingDays: rule?.working_days?.length ? rule.working_days.map(Number) : DEFAULT_WORKING_DAYS,
            holidays: (holidaysByCountry.get(m.home_country) ?? []).filter((d) => d >= y0 && d <= y1),
          },
          leave: leave.get(m.id) ?? [],
        })
      );
    }
    out.set(m.id, perYear);
  }
  return out;
}

/** Balances for one member and one year. */
export async function loadMemberBalance(
  admin: SupabaseClient,
  orgId: string,
  member: BalanceMember,
  year: number
): Promise<LeaveBalances> {
  const map = await loadLeaveBalances(admin, orgId, [member], [year]);
  const b = map.get(member.id)?.get(year);
  if (!b) throw new Error("Leave balances: nothing computed");
  return b;
}
