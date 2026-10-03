import type { SupabaseClient } from "@supabase/supabase-js";
import type { NrsContext } from "@/lib/nrs/member";
import { SUBJECT_TABLES, type NrsApproverRole, type NrsRequestKind } from "@/lib/nrs/approvals";
import { addDays, localDateInTz } from "@/lib/nrs/dates";
import { formatMoney } from "@/lib/nrs/money";
import { team as s } from "@/lib/nrs/i18n/en/team";
import { formatDay, formatTimeInTz, isValidTimeZone } from "../../time/_lib/tz";

// Server-side loaders for the Team tab and its export route.

export type TeamScope = "reports" | "all";

export interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  designation: string | null;
  home_country: string;
  timezone: string;
}

export interface QueueDetail {
  label: string;
  value: string;
}

export interface QueueItem {
  stepId: string;
  stepNo: number;
  kind: NrsRequestKind;
  title: string;
  createdAt: string;
  requesterName: string;
  requesterRole: string | null;
  requesterCountry: string | null;
  actingFor: string | null;
  asRole: NrsApproverRole | null;
  details: QueueDetail[];
}

export interface TodayRow {
  memberId: string;
  name: string;
  designation: string | null;
  status: "in" | "out" | "leave" | "none";
  time: string | null;
  mode: string | null;
  city: string | null;
  isTravel: boolean;
}

export interface TeamLeaveRow {
  id: string;
  name: string;
  type: string;
  startsOn: string;
  endsOn: string;
  workingDays: number;
  status: string;
}

export interface TeamUpdateRow {
  id: string;
  name: string;
  project: string;
  weekOf: string;
  status: string;
  progress: string;
  challenges: string | null;
}

export function canUseTeam(ctx: NrsContext): boolean {
  return ctx.isManager || ctx.isHr;
}

export function resolveScope(ctx: NrsContext, raw: string | null | undefined): TeamScope {
  if (raw === "all" && ctx.isHr) return "all";
  if (!ctx.member && ctx.isHr) return "all";
  return "reports";
}

export async function countryTimezones(supabase: SupabaseClient, orgId: string): Promise<Map<string, string>> {
  const { data } = await supabase.from("nrs_countries").select("code, timezone").eq("org_id", orgId);
  const map = new Map<string, string>();
  for (const c of (data ?? []) as { code: string; timezone: string }[]) {
    if (isValidTimeZone(c.timezone)) map.set(c.code, c.timezone);
  }
  return map;
}

export async function loadTeamMembers(
  supabase: SupabaseClient,
  ctx: NrsContext,
  scope: TeamScope
): Promise<TeamMember[]> {
  const orgId = ctx.orgId;
  if (!orgId) return [];
  if (scope === "reports" && !ctx.member) return [];
  let q = supabase
    .from("nrs_members")
    .select("id, full_name, email, designation, home_country")
    .eq("org_id", orgId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("full_name", { ascending: true });
  if (scope === "reports" && ctx.member) q = q.eq("manager_id", ctx.member.id);
  const [{ data, error }, tzs] = await Promise.all([q, countryTimezones(supabase, orgId)]);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Omit<TeamMember, "timezone">[]).map((m) => ({
    ...m,
    timezone: tzs.get(m.home_country) ?? "UTC",
  }));
}

// ---------------------------------------------------------------------------
// Approvals queue
// ---------------------------------------------------------------------------

interface StepLite {
  id: string;
  request_id: string;
  step_no: number;
  approver_type: "manager" | "role" | "member";
  approver_role: NrsApproverRole | null;
  approver_member_id: string | null;
}

interface RequestLite {
  id: string;
  kind: NrsRequestKind;
  subject_id: string;
  member_id: string;
  title: string;
  summary: string | null;
  amount_minor: number | null;
  currency: string | null;
  current_step: number;
  created_at: string;
}

type SubjectRow = Record<string, unknown>;

function sv(row: SubjectRow | undefined, key: string): string | null {
  const v = row?.[key];
  if (v == null || v === "") return null;
  return typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : null;
}

function nv(row: SubjectRow | undefined, key: string): number | null {
  const v = row?.[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function range(a: string | null, b: string | null): string | null {
  if (!a) return null;
  return b && b !== a ? `${formatDay(a)} – ${formatDay(b)}` : formatDay(a);
}

function money(minor: number | null, currency: string | null): string | null {
  if (minor == null || !currency) return null;
  try {
    return formatMoney(minor, currency);
  } catch {
    return `${minor} ${currency}`;
  }
}

function detailsFor(kind: NrsRequestKind, row: SubjectRow | undefined, req: RequestLite, tz: string): QueueDetail[] {
  const out: (QueueDetail | null)[] = [];
  const add = (label: string, value: string | null) => out.push(value ? { label, value } : null);
  if (kind === "leave") {
    const type = sv(row, "type");
    add(s.fieldType, type && type in s.leaveTypes ? s.leaveTypes[type as keyof typeof s.leaveTypes] : type);
    add(s.fieldDates, range(sv(row, "starts_on"), sv(row, "ends_on")));
    add(s.fieldWorkingDays, sv(row, "working_days"));
    add(s.fieldNote, sv(row, "note"));
  } else if (kind === "correction") {
    add(s.fieldDay, sv(row, "day") ? formatDay(sv(row, "day") as string) : null);
    const pin = sv(row, "proposed_check_in");
    const pout = sv(row, "proposed_check_out");
    add(s.fieldProposedIn, pin ? `${formatTimeInTz(pin, tz)} (${tz})` : null);
    add(s.fieldProposedOut, pout ? `${formatTimeInTz(pout, tz)} (${tz})` : null);
    add(s.fieldReason, sv(row, "reason"));
  } else if (kind === "expense") {
    add(s.fieldSpentOn, sv(row, "spent_on") ? formatDay(sv(row, "spent_on") as string) : null);
    add(s.fieldCategory, sv(row, "category")?.replace(/_/g, " ") ?? null);
    add(s.fieldDescription, sv(row, "description"));
    add(s.fieldAmount, money(nv(row, "amount_minor"), sv(row, "currency")));
    if (row?.over_limit === true) add(s.fieldOverLimit, s.yes);
  } else if (kind === "travel") {
    add(s.fieldDestination, sv(row, "destination"));
    add(s.fieldPurpose, sv(row, "purpose"));
    add(s.fieldDates, range(sv(row, "starts_on"), sv(row, "ends_on")));
    add(s.fieldAmount, money(nv(row, "estimated_minor"), sv(row, "currency")));
  } else if (kind === "invoice") {
    add(s.fieldNumber, sv(row, "number"));
    add(s.fieldPeriod, range(sv(row, "period_start"), sv(row, "period_end")));
    add(s.fieldAmount, money(nv(row, "total_minor"), sv(row, "currency")));
  }
  if (!out.some(Boolean)) {
    add(s.fieldAmount, money(req.amount_minor, req.currency));
    add(s.fieldSummary, req.summary);
  }
  return out.filter((d): d is QueueDetail => !!d);
}

/**
 * Pending steps the caller can act on right now: steps addressed to them,
 * to someone who delegated to them today, or to a role they hold. Read with
 * the service role and filtered here (decide() re-checks with the RPC).
 */
export async function loadApprovalQueue(admin: SupabaseClient, ctx: NrsContext): Promise<QueueItem[]> {
  const orgId = ctx.orgId;
  if (!orgId) return [];
  const me = ctx.member?.id ?? null;
  const today = new Date().toISOString().slice(0, 10);

  const [stepsRes, delRes] = await Promise.all([
    admin
      .from("nrs_request_steps")
      .select("id, request_id, step_no, approver_type, approver_role, approver_member_id")
      .eq("org_id", orgId)
      .eq("status", "pending"),
    me
      ? admin
          .from("nrs_delegations")
          .select("member_id")
          .eq("org_id", orgId)
          .eq("delegate_member_id", me)
          .lte("starts_on", today)
          .gte("ends_on", today)
      : Promise.resolve({ data: [] as { member_id: string }[], error: null }),
  ]);
  if (stepsRes.error) throw new Error(stepsRes.error.message);
  const delegators = new Set(((delRes.data ?? []) as { member_id: string }[]).map((d) => d.member_id));
  const superish = ctx.isPlatformAdmin || ctx.roles.includes("super_admin");

  const mine = ((stepsRes.data ?? []) as StepLite[]).filter((st) => {
    if (st.approver_member_id && (st.approver_member_id === me || delegators.has(st.approver_member_id))) return true;
    if (st.approver_type === "role" && st.approver_role) return superish || ctx.roles.includes(st.approver_role);
    return false;
  });
  if (!mine.length) return [];

  const { data: reqData, error: reqErr } = await admin
    .from("nrs_requests")
    .select("id, kind, subject_id, member_id, title, summary, amount_minor, currency, current_step, created_at")
    .in("id", Array.from(new Set(mine.map((st) => st.request_id))))
    .eq("status", "pending");
  if (reqErr) throw new Error(reqErr.message);
  const requests = new Map(((reqData ?? []) as RequestLite[]).map((r) => [r.id, r]));

  const live = mine.filter((st) => {
    const r = requests.get(st.request_id);
    return !!r && r.current_step === st.step_no && r.member_id !== me;
  });
  if (!live.length) return [];

  const memberIds = new Set<string>();
  for (const st of live) {
    memberIds.add(requests.get(st.request_id)!.member_id);
    if (st.approver_member_id) memberIds.add(st.approver_member_id);
  }
  const { data: memData } = await admin
    .from("nrs_members")
    .select("id, full_name, designation, home_country")
    .in("id", Array.from(memberIds));
  const members = new Map(
    ((memData ?? []) as { id: string; full_name: string; designation: string | null; home_country: string }[]).map((m) => [m.id, m])
  );

  const byKind = new Map<NrsRequestKind, string[]>();
  for (const st of live) {
    const r = requests.get(st.request_id)!;
    byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), r.subject_id]);
  }
  const subjects = new Map<string, SubjectRow>();
  await Promise.all(
    Array.from(byKind.entries()).map(async ([kind, ids]) => {
      const { data } = await admin.from(SUBJECT_TABLES[kind]).select("*").in("id", ids);
      for (const row of (data ?? []) as SubjectRow[]) {
        if (typeof row.id === "string") subjects.set(row.id, row);
      }
    })
  );
  const tzs = await countryTimezones(admin, orgId);

  return live
    .map((st): QueueItem => {
      const r = requests.get(st.request_id)!;
      const requester = members.get(r.member_id);
      const tz = tzs.get(requester?.home_country ?? "") ?? "UTC";
      const actingFor =
        st.approver_member_id && st.approver_member_id !== me ? members.get(st.approver_member_id)?.full_name ?? null : null;
      return {
        stepId: st.id,
        stepNo: st.step_no,
        kind: r.kind,
        title: r.title,
        createdAt: r.created_at,
        requesterName: requester?.full_name ?? "—",
        requesterRole: requester?.designation ?? null,
        requesterCountry: requester?.home_country ?? null,
        actingFor,
        asRole: st.approver_type === "role" ? st.approver_role : null,
        details: detailsFor(r.kind, subjects.get(r.subject_id), r, tz),
      };
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// ---------------------------------------------------------------------------
// My team
// ---------------------------------------------------------------------------

interface LogLite {
  member_id: string;
  day: string;
  check_in_at: string;
  check_out_at: string | null;
  timezone: string;
  mode: string;
  city: string | null;
  is_travel: boolean;
}

interface LeaveLite {
  id: string;
  member_id: string;
  type: string;
  starts_on: string;
  ends_on: string;
  working_days: number | string;
  status: string;
}

export async function loadTeamOverview(
  supabase: SupabaseClient,
  members: TeamMember[]
): Promise<{ today: TodayRow[]; leave: TeamLeaveRow[]; updates: TeamUpdateRow[] }> {
  if (!members.length) return { today: [], leave: [], updates: [] };
  const ids = members.map((m) => m.id);
  const utcToday = new Date().toISOString().slice(0, 10);
  const from = addDays(utcToday, -1);
  const horizon = addDays(utcToday, 30);

  const [logsRes, leaveRes, updRes] = await Promise.all([
    supabase
      .from("nrs_work_logs")
      .select("member_id, day, check_in_at, check_out_at, timezone, mode, city, is_travel")
      .in("member_id", ids)
      .gte("day", from)
      .lte("day", addDays(utcToday, 1))
      .order("check_in_at", { ascending: false }),
    supabase
      .from("nrs_leave_requests")
      .select("id, member_id, type, starts_on, ends_on, working_days, status")
      .in("member_id", ids)
      .in("status", ["pending", "approved"])
      .lte("starts_on", horizon)
      .gte("ends_on", from)
      .order("starts_on", { ascending: true }),
    supabase
      .from("nrs_project_updates")
      .select("id, project_id, member_id, week_of, status, progress, challenges, created_at")
      .in("member_id", ids)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  if (logsRes.error) throw new Error(logsRes.error.message);
  if (leaveRes.error) throw new Error(leaveRes.error.message);
  if (updRes.error) throw new Error(updRes.error.message);

  const logs = (logsRes.data ?? []) as LogLite[];
  const leaves = (leaveRes.data ?? []) as LeaveLite[];
  const byId = new Map(members.map((m) => [m.id, m]));

  const today: TodayRow[] = members.map((m) => {
    const localToday = localDateInTz(m.timezone);
    const log = logs.find((l) => l.member_id === m.id && l.day === localToday);
    const onLeave = leaves.some(
      (l) => l.member_id === m.id && l.status === "approved" && l.starts_on <= localToday && l.ends_on >= localToday
    );
    const base = { memberId: m.id, name: m.full_name, designation: m.designation };
    if (log) {
      const open = !log.check_out_at;
      return {
        ...base,
        status: open ? "in" : "out",
        time: formatTimeInTz(open ? log.check_in_at : (log.check_out_at as string), log.timezone),
        mode: log.mode,
        city: log.city,
        isTravel: log.is_travel,
      };
    }
    return { ...base, status: onLeave ? "leave" : "none", time: null, mode: null, city: null, isTravel: false };
  });

  const leave: TeamLeaveRow[] = leaves
    .filter((l) => l.ends_on >= utcToday)
    .map((l) => ({
      id: l.id,
      name: byId.get(l.member_id)?.full_name ?? "—",
      type: l.type,
      startsOn: l.starts_on,
      endsOn: l.ends_on,
      workingDays: Number(l.working_days),
      status: l.status,
    }));

  const upd = (updRes.data ?? []) as {
    id: string;
    project_id: string;
    member_id: string;
    week_of: string;
    status: string;
    progress: string;
    challenges: string | null;
  }[];
  let projectNames = new Map<string, string>();
  if (upd.length) {
    const { data: projData } = await supabase
      .from("nrs_projects")
      .select("id, name")
      .in("id", Array.from(new Set(upd.map((u) => u.project_id))));
    projectNames = new Map(((projData ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
  }
  const updates: TeamUpdateRow[] = upd.map((u) => ({
    id: u.id,
    name: byId.get(u.member_id)?.full_name ?? "—",
    project: projectNames.get(u.project_id) ?? "—",
    weekOf: u.week_of,
    status: u.status,
    progress: u.progress,
    challenges: u.challenges,
  }));

  return { today, leave, updates };
}
