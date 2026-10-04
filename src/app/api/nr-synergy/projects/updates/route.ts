import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyMembers } from "@/lib/nrs/notify";
import { createRequest, NrsApprovalError } from "@/lib/nrs/approvals";
import { guard, isUuid, jsonError, optText, readBody } from "@/app/tools/nr-synergy/_home/server";
import { isProjectStatus, weekStartInTz, type ProjectStatus } from "@/app/tools/nr-synergy/projects/_lib";
import { applyApprovedUpdate, memberInfo } from "@/app/tools/nr-synergy/projects/_server";

// POST /api/nr-synergy/projects/updates — post a weekly update.
// Insert-only: updates are never edited or deleted (a DB trigger forbids it
// and stamps created_at with the server clock). The owner or a project
// member may post. Each update goes to the poster's manager for approval;
// its status and next steps are applied to the project only when approved.
// Service-role writes after the permission checks below.
export async function POST(req: Request) {
  const g = await guard("projects");
  if (!g.ok) return g.res;
  const { ctx, member, supabase } = g;

  const body = await readBody(req);
  if (!body) return jsonError("Invalid request body");

  const projectId = body.project_id;
  if (!isUuid(projectId)) return jsonError("project_id is required");
  if (body.status != null && body.status !== "" && !(isProjectStatus(body.status) && body.status !== "pending")) {
    return jsonError("Choose In progress, On hold or Completed.");
  }
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
  if (project.status === "completed") return jsonError("This project is completed.", 409);
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
  const statusThisWeek: ProjectStatus = isProjectStatus(body.status) && (body.status as string) !== "pending" ? body.status : (project.status as string) === "pending" ? "in_progress" : project.status;
  const weekOf = weekStartInTz(people.get(project.owner_member_id)?.tz ?? "UTC");
  // One weekly submission per project: a new one is allowed only if this week's was returned / rejected.
  const { data: existing } = await admin
    .from("nrs_project_updates")
    .select("id")
    .eq("project_id", project.id)
    .eq("week_of", weekOf)
    .in("review_status", ["pending", "approved"])
    .limit(1);
  if ((existing ?? []).length) return jsonError("This week's update is already submitted. You can submit again next week.", 409);
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
      week_of: weekOf,
      status: statusThisWeek,
      progress,
      challenges,
      plan_of_action: plan,
      help_needed_member_id: helpId,
      next_steps: nextSteps,
      review_status: "pending",
    })
    .select("id, created_at")
    .single();
  if (insErr || !saved) return jsonError(insErr?.message ?? "Could not post the update", 500);
  const row = saved as { id: string; created_at: string };

  // Every weekly update goes to the poster's manager (HR when there is none).
  // Status and next steps reach the project only when it is approved.
  let approved = false;
  try {
    const result = await createRequest("project_update", row.id, member.id, `Weekly update: ${project.name}`, null, null, {
      admin,
      createdBy: ctx.user.id,
      summary: progress.slice(0, 300),
    });
    approved = result.status === "approved";
    if (approved) await applyApprovedUpdate(admin, row.id);
  } catch (e) {
    // The update itself is saved (and immutable); log so the approval can be re-raised.
    console.error("[nrs] weekly update approval request failed", row.id, e instanceof NrsApprovalError ? e.message : e);
  }

  if (helpId) {
    await notifyMembers(admin, project.org_id, [helpId], {
      title: `${member.full_name} asked for your help on ${project.name}`,
      body: challenges ?? progress,
      link: `/tools/nr-synergy/projects/${project.id}`,
    });
  }

  return NextResponse.json({ ok: true, id: row.id, created_at: row.created_at, review: approved ? "approved" : "pending" });
}
