import type { SupabaseClient } from "@supabase/supabase-js";
import type { NrsContext, NrsMember } from "@/lib/nrs/member";
import { addDays } from "@/lib/nrs/dates";
import { PROJECT_COLUMNS, isUpdateOverdue, normaliseProject, type ProjectRow } from "./_lib";

// Server-only Projects loaders, shared by the Projects pages, Home ("Needs
// you today") and Team. Aggregates that only read ids and time stamps use
// the service-role client so "overdue" is the same for every viewer.

function validTz(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** country code -> IANA timezone for the org. */
export async function countryTzMap(client: SupabaseClient, orgId: string): Promise<Map<string, string>> {
  const { data } = await client.from("nrs_countries").select("code, timezone").eq("org_id", orgId);
  const out = new Map<string, string>();
  for (const c of (data ?? []) as { code: string; timezone: string }[]) if (validTz(c.timezone)) out.set(c.code, c.timezone);
  return out;
}

export interface MemberInfo {
  id: string;
  full_name: string;
  designation: string | null;
  home_country: string;
  manager_id: string | null;
  tz: string;
}

/** Name, manager and home timezone for the given member ids. */
export async function memberInfo(admin: SupabaseClient, orgId: string, ids: (string | null | undefined)[]): Promise<Map<string, MemberInfo>> {
  const unique = Array.from(new Set(ids.filter((v): v is string => !!v)));
  const out = new Map<string, MemberInfo>();
  if (!unique.length) return out;
  const [{ data }, tzs] = await Promise.all([
    admin.from("nrs_members").select("id, full_name, designation, home_country, manager_id").eq("org_id", orgId).in("id", unique),
    countryTzMap(admin, orgId),
  ]);
  for (const m of (data ?? []) as Omit<MemberInfo, "tz">[]) out.set(m.id, { ...m, tz: tzs.get(m.home_country) ?? "UTC" });
  return out;
}

/** Latest update time per project over the last ~10 days (enough to judge "this week"). */
export async function latestUpdates(admin: SupabaseClient, projectIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!projectIds.length) return out;
  const since = `${addDays(new Date().toISOString().slice(0, 10), -10)}T00:00:00Z`;
  for (let i = 0; i < projectIds.length; i += 200) {
    const { data, error } = await admin
      .from("nrs_project_updates")
      .select("project_id, created_at")
      .in("project_id", projectIds.slice(i, i + 200))
      .gte("created_at", since)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    for (const u of (data ?? []) as { project_id: string; created_at: string }[]) {
      if (!out.has(u.project_id)) out.set(u.project_id, u.created_at);
    }
  }
  return out;
}

export interface ProjectWithMeta extends ProjectRow {
  ownerName: string;
  overdue: boolean;
  lastUpdateAt: string | null;
}

/** Attach owner name, last update and the overdue flag (owner's timezone). */
export async function withMeta(admin: SupabaseClient, orgId: string, list: ProjectRow[]): Promise<ProjectWithMeta[]> {
  if (!list.length) return [];
  const [people, last] = await Promise.all([
    memberInfo(
      admin,
      orgId,
      list.map((p) => p.owner_member_id)
    ),
    latestUpdates(
      admin,
      list.filter((p) => p.approval_status === "approved").map((p) => p.id)
    ),
  ]);
  const now = new Date();
  return list.map((p) => {
    const owner = people.get(p.owner_member_id);
    const lastUpdateAt = last.get(p.id) ?? null;
    return {
      ...p,
      ownerName: owner?.full_name ?? "—",
      lastUpdateAt,
      overdue: isUpdateOverdue(p, lastUpdateAt, owner?.tz ?? "UTC", now),
    };
  });
}

/** Approved, live projects of the org (RLS client: what the viewer may see). */
export async function loadApprovedProjects(supabase: SupabaseClient, orgId: string, limit = 500): Promise<ProjectRow[]> {
  const { data, error } = await supabase
    .from("nrs_projects")
    .select(PROJECT_COLUMNS)
    .eq("org_id", orgId)
    .eq("approval_status", "approved")
    .is("archived_at", null)
    .order("name", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as ProjectRow[]).map(normaliseProject);
}

export interface Submission extends ProjectRow {
  submittedAt: string | null;
  approverName: string | null;
  comment: string | null;
  waitingOn: string | null;
}

/** The caller's own not-yet-approved projects with the latest approver comment. */
export async function loadMySubmissions(admin: SupabaseClient, member: NrsMember): Promise<Submission[]> {
  const { data, error } = await admin
    .from("nrs_projects")
    .select(PROJECT_COLUMNS)
    .eq("org_id", member.org_id)
    .eq("created_by_member", member.id)
    .neq("approval_status", "approved")
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  const list = ((data ?? []) as ProjectRow[]).map(normaliseProject);
  if (!list.length) return [];

  const { data: reqData } = await admin
    .from("nrs_requests")
    .select("id, subject_id, created_at")
    .eq("kind", "project")
    .in(
      "subject_id",
      list.map((p) => p.id)
    );
  const requests = (reqData ?? []) as { id: string; subject_id: string; created_at: string }[];
  const bySubject = new Map(requests.map((r) => [r.subject_id, r]));
  const steps = requests.length
    ? (((
        await admin
          .from("nrs_request_steps")
          .select("request_id, status, comment, decided_by_member, approver_member_id, approver_role, decided_at")
          .in(
            "request_id",
            requests.map((r) => r.id)
          )
      ).data ?? []) as {
        request_id: string;
        status: string;
        comment: string | null;
        decided_by_member: string | null;
        approver_member_id: string | null;
        approver_role: string | null;
        decided_at: string | null;
      }[])
    : [];
  const names = await memberInfo(admin, member.org_id, [
    ...steps.map((s) => s.decided_by_member),
    ...steps.map((s) => s.approver_member_id),
  ]);

  return list.map((p) => {
    const req = bySubject.get(p.id);
    const mine = steps.filter((s) => s.request_id === req?.id);
    const decided = mine
      .filter((s) => s.decided_at && s.comment)
      .sort((a, b) => (b.decided_at ?? "").localeCompare(a.decided_at ?? ""))[0];
    const pending = mine.find((s) => s.status === "pending");
    return {
      ...p,
      submittedAt: req?.created_at ?? p.created_at,
      approverName: decided?.decided_by_member ? names.get(decided.decided_by_member)?.full_name ?? null : null,
      comment: decided?.comment ?? null,
      waitingOn: pending
        ? pending.approver_member_id
          ? names.get(pending.approver_member_id)?.full_name ?? null
          : pending.approver_role === "hr_admin"
            ? "HR"
            : pending.approver_role
        : null,
    };
  });
}

/** Managers (of the owner or the creator) and HR may edit fields and archive. */
export async function canManageProject(
  admin: SupabaseClient,
  ctx: NrsContext,
  project: Pick<ProjectRow, "org_id" | "owner_member_id" | "created_by_member">
): Promise<boolean> {
  if (ctx.isHr) return true;
  const me = ctx.member?.id;
  if (!me) return false;
  const people = await memberInfo(admin, project.org_id, [project.owner_member_id, project.created_by_member]);
  return [project.owner_member_id, project.created_by_member].some((id) => !!id && people.get(id)?.manager_id === me);
}

/** Member ids on the project (owner first). */
export async function projectMemberIds(client: SupabaseClient, project: Pick<ProjectRow, "id" | "owner_member_id">): Promise<string[]> {
  const { data } = await client.from("nrs_project_members").select("member_id").eq("project_id", project.id);
  const ids = ((data ?? []) as { member_id: string }[]).map((r) => r.member_id).filter((id) => id !== project.owner_member_id);
  return [project.owner_member_id, ...ids];
}

export interface FormOptions {
  people: { id: string; full_name: string; designation: string | null }[];
  countries: { code: string; name: string; currency: string }[];
  currencies: string[];
  divisions: string[];
}

const COMMON_CURRENCIES = ["INR", "USD", "EUR", "GBP"];

/** Pickers for the project form: people, countries, currencies, known divisions. */
export async function loadFormOptions(supabase: SupabaseClient, orgId: string): Promise<FormOptions> {
  const [peopleRes, countriesRes, divRes] = await Promise.all([
    supabase
      .from("nrs_members")
      .select("id, full_name, designation, division")
      .eq("org_id", orgId)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("full_name", { ascending: true }),
    supabase.from("nrs_countries").select("code, name, currency").eq("org_id", orgId).order("name", { ascending: true }),
    supabase.from("nrs_projects").select("division").eq("org_id", orgId).not("division", "is", null).limit(500),
  ]);
  if (peopleRes.error) throw new Error(peopleRes.error.message);
  const people = (peopleRes.data ?? []) as { id: string; full_name: string; designation: string | null; division: string | null }[];
  const countries = (countriesRes.data ?? []) as { code: string; name: string; currency: string }[];
  const currencies = Array.from(new Set([...COMMON_CURRENCIES, ...countries.map((c) => c.currency.toUpperCase())])).sort();
  const divisions = Array.from(
    new Set(
      [...people.map((p) => p.division), ...((divRes.data ?? []) as { division: string | null }[]).map((d) => d.division)].filter(
        (d): d is string => !!d && !!d.trim()
      )
    )
  ).sort((a, b) => a.localeCompare(b));
  return {
    people: people.map(({ id, full_name, designation }) => ({ id, full_name, designation })),
    countries,
    currencies,
    divisions,
  };
}
