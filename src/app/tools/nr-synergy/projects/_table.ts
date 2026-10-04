import type { SupabaseClient } from "@supabase/supabase-js";
import type { NrsContext, NrsMember } from "@/lib/nrs/member";
import { addDays, localDateInTz } from "@/lib/nrs/dates";
import { PROJECT_COLUMNS, formatValue, normaliseProject, weekStartInTz, type ProjectRow, type ProjectStatus } from "./_lib";
import { memberInfo } from "./_server";

// Server-side data for the Projects table (My projects / My team / All projects).
// Project rows come through the caller's RLS client; updates, people and the
// pending approval steps are read with the service role and filtered here.

export type ProjectScope = "mine" | "team" | "all";
export type WeekState = "approved" | "pending" | "returned" | "missed" | "none";
export type ReviewStatus = "pending" | "approved" | "rejected" | "sent_back";

export interface TableUpdate {
  id: string;
  week_of: string;
  created_at: string;
  status: ProjectStatus;
  progress: string;
  challenges: string | null;
  plan_of_action: string | null;
  next_steps: string | null;
  review_status: ReviewStatus;
  author: string;
}

export interface PendingAction {
  stepId: string;
  kind: "project" | "project_update";
}

export interface TableRow {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  approvalStatus: ProjectRow["approval_status"];
  ownerId: string;
  ownerName: string;
  division: string | null;
  value: string | null;
  createdByMe: boolean;
  /** Owner / team member of an approved, live project. */
  canPost: boolean;
  /** This week's live update (pending or approved), if any. */
  thisWeek: TableUpdate | null;
  /** Most recent update before this week. */
  previous: TableUpdate | null;
  history: TableUpdate[];
  weeks: { week: string; state: WeekState }[];
  /** Approval step the viewer can decide now (project approval or this week's update). */
  action: PendingAction | null;
  overdue: boolean;
}

const WEEKS = 8;

export async function loadProjectTable(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  ctx: NrsContext,
  member: NrsMember,
  scope: ProjectScope
): Promise<TableRow[]> {
  const { data, error } = await supabase
    .from("nrs_projects")
    .select(PROJECT_COLUMNS)
    .eq("org_id", member.org_id)
    .is("archived_at", null)
    .neq("approval_status", "rejected")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  let projects = ((data ?? []) as ProjectRow[]).map(normaliseProject);

  const { data: myLinks } = await admin.from("nrs_project_members").select("project_id").eq("member_id", member.id);
  const onTeam = new Set(((myLinks ?? []) as { project_id: string }[]).map((l) => l.project_id));
  const people = await memberInfo(admin, member.org_id, projects.flatMap((p) => [p.owner_member_id, p.created_by_member]));

  if (scope === "mine") {
    projects = projects.filter((p) => p.owner_member_id === member.id || p.created_by_member === member.id || onTeam.has(p.id));
  } else if (scope === "team") {
    projects = projects.filter((p) => p.owner_member_id !== member.id && people.get(p.owner_member_id)?.manager_id === member.id);
  } else if (!ctx.isHr) {
    projects = [];
  }
  if (!projects.length) return [];

  const ids = projects.map((p) => p.id);
  const since = addDays(localDateInTz("UTC"), -7 * (WEEKS + 6));
  const { data: upData } = await admin
    .from("nrs_project_updates")
    .select("id, project_id, member_id, week_of, created_at, status, progress, challenges, plan_of_action, next_steps, review_status")
    .in("project_id", ids)
    .gte("week_of", since)
    .order("created_at", { ascending: false })
    .limit(5000);
  const updates = (upData ?? []) as (Omit<TableUpdate, "author"> & { project_id: string; member_id: string })[];
  const authors = await memberInfo(admin, member.org_id, updates.map((u) => u.member_id));

  // Pending approvals the viewer can act on.
  const updateIds = updates.filter((u) => u.review_status === "pending").map((u) => u.id);
  const subjectIds = [...ids.filter((id) => projects.find((p) => p.id === id)?.approval_status === "pending"), ...updateIds];
  const actions = new Map<string, PendingAction>();
  if (subjectIds.length) {
    const { data: reqs } = await admin
      .from("nrs_requests")
      .select("id, kind, subject_id, current_step, member_id")
      .in("kind", ["project", "project_update"])
      .eq("status", "pending")
      .in("subject_id", subjectIds);
    const reqList = (reqs ?? []) as { id: string; kind: "project" | "project_update"; subject_id: string; current_step: number; member_id: string }[];
    if (reqList.length) {
      const { data: steps } = await admin
        .from("nrs_request_steps")
        .select("id, request_id, step_no, approver_type, approver_role, approver_member_id")
        .in("request_id", reqList.map((r) => r.id))
        .eq("status", "pending");
      for (const st of (steps ?? []) as { id: string; request_id: string; step_no: number; approver_type: string; approver_role: string | null; approver_member_id: string | null }[]) {
        const r = reqList.find((x) => x.id === st.request_id);
        if (!r || r.current_step !== st.step_no || r.member_id === member.id) continue;
        const mine = st.approver_member_id === member.id || (st.approver_type === "role" && st.approver_role === "hr_admin" && ctx.isHr) || ctx.isHr;
        if (mine) actions.set(r.subject_id, { stepId: st.id, kind: r.kind });
      }
    }
  }

  const now = new Date();
  return projects.map((p): TableRow => {
    const owner = people.get(p.owner_member_id);
    const tz = owner?.tz ?? "UTC";
    const thisMonday = weekStartInTz(tz, now);
    const mine = updates
      .filter((u) => u.project_id === p.id)
      .map((u) => ({ ...u, author: authors.get(u.member_id)?.full_name ?? "—" }));
    const live = (u: TableUpdate) => u.review_status === "pending" || u.review_status === "approved";
    const thisWeek = mine.find((u) => u.week_of === thisMonday && live(u)) ?? null;
    const previous = mine.find((u) => u.week_of < thisMonday && live(u)) ?? null;
    const approvedWeek = p.approved_at ? weekStartInTz(tz, new Date(p.approved_at)) : null;

    const weeks = Array.from({ length: WEEKS }, (_, i) => addDays(thisMonday, -7 * (WEEKS - 1 - i))).map((week) => {
      const inWeek = mine.filter((u) => u.week_of === week);
      let state: WeekState = "none";
      if (inWeek.some((u) => u.review_status === "approved")) state = "approved";
      else if (inWeek.some((u) => u.review_status === "pending")) state = "pending";
      else if (inWeek.length) state = "returned";
      else if (p.approval_status === "approved" && approvedWeek && week >= approvedWeek && week < thisMonday) state = "missed";
      return { week, state };
    });

    const isPoster = p.owner_member_id === member.id || onTeam.has(p.id);
    const live_ = p.approval_status === "approved" && !p.archived_at;
    const dow = new Date(`${localDateInTz(tz, now)}T00:00:00Z`).getUTCDay(); // 0 Sun .. 6 Sat
    const overdue = live_ && p.status !== "completed" && !thisWeek && (dow === 5 || dow === 6 || dow === 0) && approvedWeek !== thisMonday;

    const pendingUpdate = thisWeek && thisWeek.review_status === "pending" ? actions.get(thisWeek.id) ?? null : null;
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      status: p.status,
      approvalStatus: p.approval_status,
      ownerId: p.owner_member_id,
      ownerName: owner?.full_name ?? "—",
      division: p.division,
      value: formatValue(p.value_minor, p.value_currency),
      createdByMe: p.created_by_member === member.id,
      canPost: isPoster && live_ && p.status !== "completed",
      thisWeek,
      previous,
      history: mine.slice(0, 12),
      weeks,
      action: p.approval_status === "pending" ? actions.get(p.id) ?? null : pendingUpdate,
      overdue,
    };
  });
}
