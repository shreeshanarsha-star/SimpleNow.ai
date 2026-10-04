import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyMembers, notifyRoles } from "@/lib/nrs/notify";
import { projects as s } from "@/lib/nrs/i18n/en/projects";
import { guard, isUuid, jsonError, optText, readBody } from "@/app/tools/nr-synergy/_home/server";
import { isProjectStatus, weekStartInTz, type ProjectStatus } from "@/app/tools/nr-synergy/projects/_lib";
import { canManageProject, memberInfo } from "@/app/tools/nr-synergy/projects/_server";

// POST /api/nr-synergy/projects/updates — post a weekly update.
// Insert-only: updates are never edited or deleted (a DB trigger forbids it
// and stamps created_at with the server clock). The owner or a project
// member may post; posting also rolls next steps onto the project.
// Status: the owner's manager or HR changes it directly. Anyone else can only
// suggest a new status; it waits on the project (status_requested) until the
// manager approves or declines it, and the manager is notified.
// Service-role writes after the permission checks below.
export async function POST(req: Request) {
  const g = await guard("projects");
  if (!g.ok) return g.res;
  const { ctx, member, supabase } = g;

  const body = await readBody(req);
  if (!body) return jsonError("Invalid request body");

  const projectId = body.project_id;
  if (!isUuid(projectId)) return jsonError("project_id is required");
  if (body.status != null && body.status !== "" && !isProjectStatus(body.status)) return jsonError("Choose a valid status");
  const progress = optText(body.progress, 4000);
  if (!progress) return jsonError(progress === undefined ? "Progress is too long (4,000 characters max)." : "Describe the progress this week.");
  const challenges = optText(body.challenges, 4000);
  const plan = optText(body.plan_of_action, 4000);
  const nextSteps = optText(body.next_steps, 2000);
  if (challenges === undefined || plan === undefined || nextSteps === undefined) return jsonError("A field is too long");
  const helpId = body.help_needed_member_id == null || body.help_needed_member_id === "" ? null : body.help_needed_member_id;
  if (helpId !== null && !isUuid(helpId)) return jsonError("Invalid help-needed member");
  if (helpId === member.id) return jsonError("Choose someone other than yourself");

  // The caller must be able to see the project (RLS) …
  const { data: visible } = await supabase
    .from("nrs_projects")
    .select("id")
    .eq("id", projectId)
    .eq("org_id", member.org_id)
    .maybeSingle();
  if (!visible) return jsonError("Project not found", 404);

  const admin = createAdminClient();
  const { data: projData, error: pErr } = await admin
    .from("nrs_projects")
    .select("id, org_id, name, owner_member_id, created_by_member, status, approval_status, archived_at")
    .eq("id", projectId)
    .maybeSingle();
  if (pErr) return jsonError(pErr.message, 500);
  const project = projData as {
    id: string;
    org_id: string;
    name: string;
    owner_member_id: string;
    created_by_member: string | null;
    status: ProjectStatus;
    approval_status: string;
    archived_at: string | null;
  } | null;
  if (!project) return jsonError("Project not found", 404);
  if (project.archived_at) return jsonError("This project is archived.", 409);
  if (project.approval_status !== "approved") return jsonError("Updates open once the project is approved.", 409);

  // … and be its owner or a member.
  if (project.owner_member_id !== member.id) {
    const { data: link } = await admin
      .from("nrs_project_members")
      .select("member_id")
      .eq("project_id", project.id)
      .eq("member_id", member.id)
      .maybeSingle();
    if (!link) return jsonError("Only the owner and team members can post updates.", 403);
  }

  const people = await memberInfo(admin, project.org_id, [project.owner_member_id, helpId]);
  const decides = await canManageProject(admin, ctx, project);
  const wanted: ProjectStatus = isProjectStatus(body.status) ? body.status : project.status;
  const proposing = !decides && wanted !== project.status;
  if (helpId) {
    const { data: helper } = await admin
      .from("nrs_members")
      .select("id")
      .eq("id", helpId)
      .eq("org_id", project.org_id)
      .eq("status", "active")
      .is("deleted_at", null)
      .maybeSingle();
    if (!helper) return jsonError("That colleague wasn't found");
  }

  const { data: saved, error: insErr } = await admin
    .from("nrs_project_updates")
    .insert({
      org_id: project.org_id,
      project_id: project.id,
      member_id: member.id,
      week_of: weekStartInTz(people.get(project.owner_member_id)?.tz ?? "UTC"),
      status: wanted,
      status_proposed: proposing,
      progress,
      challenges,
      plan_of_action: plan,
      help_needed_member_id: helpId,
      next_steps: nextSteps,
    })
    .select("id, created_at")
    .single();
  if (insErr || !saved) return jsonError(insErr?.message ?? "Could not post the update", 500);

  const rollUp: Record<string, unknown> = { next_steps: nextSteps };
  if (decides && wanted !== project.status) {
    Object.assign(rollUp, { status: wanted, status_requested: null, status_requested_by: null, status_requested_at: null });
  } else if (proposing) {
    Object.assign(rollUp, { status_requested: wanted, status_requested_by: member.id, status_requested_at: new Date().toISOString() });
  }
  const { error: projUpErr } = await admin.from("nrs_projects").update(rollUp).eq("id", project.id);
  if (projUpErr) console.error("[nrs] project roll-up failed", project.id, projUpErr.message);

  if (proposing) {
    // The owner's manager decides; with no manager on file, HR does.
    const managerId = people.get(project.owner_member_id)?.manager_id ?? null;
    const notice = {
      title: `${member.full_name} suggests "${s.status[wanted]}" for ${project.name}`,
      body: `Current status: ${s.status[project.status]}. Open the project to approve or keep it.`,
      link: `/tools/nr-synergy/projects/${project.id}`,
    };
    if (managerId && managerId !== member.id) await notifyMembers(admin, project.org_id, [managerId], notice);
    else await notifyRoles(admin, project.org_id, ["hr_admin"], notice);
  }

  if (helpId) {
    await notifyMembers(admin, project.org_id, [helpId], {
      title: `${member.full_name} asked for your help on ${project.name}`,
      body: challenges ?? progress,
      link: `/tools/nr-synergy/projects/${project.id}`,
    });
  }

  const row = saved as { id: string; created_at: string };
  return NextResponse.json({ ok: true, id: row.id, created_at: row.created_at, statusRequested: proposing });
}
