import { createAdminClient } from "@/lib/supabase/admin";
import { fromMinor } from "@/lib/nrs/money";
import { guard, jsonError } from "@/app/tools/nr-synergy/_home/server";
import { PROJECT_COLUMNS, UPDATE_COLUMNS, normaliseProject, type ProjectRow, type ProjectUpdateRow } from "@/app/tools/nr-synergy/projects/_lib";
import { projects as s } from "@/lib/nrs/i18n/en/projects";

export const dynamic = "force-dynamic";

// GET /api/nr-synergy/projects/export — admins only. One Excel workbook with
// every project in the organisation (sheet "Projects") and every weekly
// update with its approval state (sheet "Weekly updates").
export async function GET() {
  const g = await guard("projects");
  if (!g.ok) return g.res;
  const { ctx, member } = g;
  if (!ctx.isHr) return jsonError("Only admins can download the project list.", 403);
  const admin = createAdminClient();
  const orgId = member.org_id;

  const [pRes, uRes, mRes, cRes] = await Promise.all([
    admin.from("nrs_projects").select(PROJECT_COLUMNS).eq("org_id", orgId).order("name", { ascending: true }).limit(5000),
    admin.from("nrs_project_updates").select(`${UPDATE_COLUMNS}, reviewed_at`).eq("org_id", orgId).order("created_at", { ascending: false }).limit(20000),
    admin.from("nrs_members").select("id, full_name, email, designation, manager_id").eq("org_id", orgId),
    admin.from("nrs_countries").select("code, name").eq("org_id", orgId),
  ]);
  if (pRes.error) return jsonError(pRes.error.message, 500);
  if (uRes.error) return jsonError(uRes.error.message, 500);
  const projects = ((pRes.data ?? []) as ProjectRow[]).map(normaliseProject);
  const updates = (uRes.data ?? []) as (ProjectUpdateRow & { reviewed_at: string | null })[];
  const people = new Map(((mRes.data ?? []) as { id: string; full_name: string; email: string; designation: string | null; manager_id: string | null }[]).map((m) => [m.id, m]));
  const countries = new Map(((cRes.data ?? []) as { code: string; name: string }[]).map((c) => [c.code, c.name]));
  const name = (id: string | null | undefined) => (id ? people.get(id)?.full_name ?? "" : "");
  const date = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "");
  const dateTime = (iso: string | null | undefined) => (iso ? iso.replace("T", " ").slice(0, 16) + " UTC" : "");

  const { data: links } = projects.length
    ? await admin.from("nrs_project_members").select("project_id, member_id").in("project_id", projects.map((p) => p.id))
    : { data: [] };
  const team = new Map<string, string[]>();
  for (const l of (links ?? []) as { project_id: string; member_id: string }[]) team.set(l.project_id, [...(team.get(l.project_id) ?? []), name(l.member_id)]);

  const byProject = new Map<string, typeof updates>();
  for (const u of updates) byProject.set(u.project_id, [...(byProject.get(u.project_id) ?? []), u]);
  const projectName = new Map(projects.map((p) => [p.id, p.name]));

  const projectRows = projects.map((p) => {
    const owner = people.get(p.owner_member_id);
    const ups = byProject.get(p.id) ?? [];
    const latest = ups[0];
    return {
      "Project": p.name,
      "Owner": owner?.full_name ?? "",
      "Owner email": owner?.email ?? "",
      "Owner designation": owner?.designation ?? "",
      "Reporting manager": name(owner?.manager_id),
      "Status": s.status[p.status] ?? p.status,
      "Approval": s.approval[p.approval_status] ?? p.approval_status,
      "Approved on": date(p.approved_at),
      "Value (approx.)": p.value_minor != null && p.value_currency ? Number(fromMinor(p.value_minor, p.value_currency)) : "",
      "Currency": p.value_currency ?? "",
      "Description": p.description ?? "",
      "Next steps": p.next_steps ?? "",
      "Division": p.division ?? "",
      "Country": p.country_code ? countries.get(p.country_code) ?? p.country_code : "",
      "Tags": p.tags.join(", "),
      "Team members": (team.get(p.id) ?? []).filter(Boolean).join(", "),
      "Created on": date(p.created_at),
      "Weekly updates": ups.length,
      "Last update": dateTime(latest?.created_at),
      "Last update approval": latest ? s.timeline.review[latest.review_status] ?? latest.review_status : "",
      "Last progress": latest?.progress ?? "",
      "Archived": p.archived_at ? "Yes" : "No",
    };
  });

  const updateRows = updates.map((u) => ({
    "Project": projectName.get(u.project_id) ?? "",
    "Posted by": name(u.member_id),
    "Posted at": dateTime(u.created_at),
    "Status this week": s.status[u.status] ?? u.status,
    "Progress": u.progress,
    "Challenges": u.challenges ?? "",
    "Plan of action": u.plan_of_action ?? "",
    "Next steps": u.next_steps ?? "",
    "Help needed from": name(u.help_needed_member_id),
    "Manager approval": s.timeline.review[u.review_status] ?? u.review_status,
    "Decided at": dateTime(u.reviewed_at),
  }));

  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const sheet = (rows: Record<string, unknown>[], header: string[]) => {
    const ws = XLSX.utils.json_to_sheet(rows, { header });
    ws["!cols"] = header.map((h) => ({ wch: Math.min(60, Math.max(12, h.length + 2)) }));
    return ws;
  };
  XLSX.utils.book_append_sheet(wb, sheet(projectRows, Object.keys(projectRows[0] ?? { Project: "" })), "Projects");
  XLSX.utils.book_append_sheet(wb, sheet(updateRows, Object.keys(updateRows[0] ?? { Project: "" })), "Weekly updates");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const today = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="NR-Synergy-projects-${today}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
