import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRequest, NrsApprovalError } from "@/lib/nrs/approvals";
import { logAudit } from "@/lib/nrs/audit";
import { guard, isUuid, jsonError, readBody } from "@/app/tools/nr-synergy/_home/server";
import { PROJECT_COLUMNS, normaliseProject, type ProjectRow } from "@/app/tools/nr-synergy/projects/_lib";
import { canManageProject } from "@/app/tools/nr-synergy/projects/_server";
import { parseProjectInput, projectFields, replaceMembers, type ProjectInput } from "../_lib";

// POST /api/nr-synergy/projects/:id
//   { action: "resubmit", ...fields }  creator, after a send-back: edit + fresh approval
//   { action: "update", ...fields }    owner's/creator's manager or HR: edit fields.
//                                      While approval is pending, a change to an
//                                      approval-relevant field restarts the approval.
//   { action: "archive" | "unarchive" } owner's/creator's manager or HR
// Weekly updates are never edited here (see ./updates).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard("projects");
  if (!g.ok) return g.res;
  const { ctx, member, supabase } = g;
  const { id } = await params;
  if (!isUuid(id)) return jsonError("Project not found", 404);

  const body = await readBody(req);
  if (!body) return jsonError("Invalid request body");
  const action = body.action;

  // Visibility through the caller's own client first (RLS), then act with the service role.
  const { data: visible } = await supabase.from("nrs_projects").select("id").eq("id", id).eq("org_id", member.org_id).maybeSingle();
  if (!visible) return jsonError("Project not found", 404);
  const admin = createAdminClient();
  const { data, error } = await admin.from("nrs_projects").select(PROJECT_COLUMNS).eq("id", id).maybeSingle();
  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("Project not found", 404);
  const project = normaliseProject(data as ProjectRow);

  if (action === "resubmit") {
    if (project.created_by_member !== member.id) return jsonError("Only the person who started this project can resubmit it.", 403);
    if (project.approval_status !== "sent_back") return jsonError("Only a project that was sent back can be resubmitted.", 409);
    if (project.archived_at) return jsonError("This project is archived.", 409);
    const parsed = await parseProjectInput(admin, project.org_id, body, project.owner_member_id);
    if (!parsed.ok) return jsonError(parsed.error);
    const { error: upErr } = await admin.from("nrs_projects").update(projectFields(parsed.input)).eq("id", id);
    if (upErr) return jsonError(upErr.message, 500);
    const memErr = await replaceMembers(admin, id, parsed.input.member_ids);
    if (memErr) return jsonError(memErr, 500);
    try {
      const result = await createRequest(
        "project",
        id,
        member.id,
        parsed.input.name,
        parsed.input.value_minor,
        parsed.input.value_currency,
        { admin, createdBy: ctx.user.id, summary: parsed.input.description.slice(0, 300) }
      );
      return NextResponse.json({ ok: true, id, status: result.status });
    } catch (e) {
      if (e instanceof NrsApprovalError) return jsonError(e.message, e.status);
      console.error("[nrs] project resubmit failed", e);
      return jsonError("Could not resubmit the project.", 500);
    }
  }

  if (action === "update" || action === "archive" || action === "unarchive") {
    if (!(await canManageProject(admin, ctx, project))) {
      return jsonError("Only the owner's manager or HR can change this project.", 403);
    }
    if (action === "update") {
      const parsed = await parseProjectInput(admin, project.org_id, body, project.owner_member_id);
      if (!parsed.ok) return jsonError(parsed.error);
      const fields = projectFields(parsed.input);
      const restart = project.approval_status === "pending" && approvalFieldsChanged(project, parsed.input);
      const { error: upErr } = await admin.from("nrs_projects").update(fields).eq("id", id);
      if (upErr) return jsonError(upErr.message, 500);
      const memErr = await replaceMembers(admin, id, parsed.input.member_ids);
      if (memErr) return jsonError(memErr, 500);
      await logAudit(admin, {
        orgId: project.org_id,
        actorUser: ctx.user.id,
        entity: "nrs_projects",
        entityId: id,
        action: "edit",
        before: projectFields({ ...project, member_ids: [], description: project.description ?? "" }),
        after: { ...fields, member_ids: parsed.input.member_ids },
      });
      if (restart) {
        // Reuse the pending request row: steps are re-expanded for the new value
        // (when.amount_minor_gt) and the first approver is notified again.
        const { data: reqRow } = await admin
          .from("nrs_requests")
          .select("member_id")
          .eq("kind", "project")
          .eq("subject_id", id)
          .maybeSingle();
        const requester = project.created_by_member ?? (reqRow as { member_id: string } | null)?.member_id ?? null;
        if (!requester) return jsonError("Could not find who submitted this project.", 500);
        try {
          const result = await createRequest(
            "project",
            id,
            requester,
            parsed.input.name,
            parsed.input.value_minor,
            parsed.input.value_currency,
            { admin, createdBy: ctx.user.id, summary: parsed.input.description.slice(0, 300), restartPending: true }
          );
          return NextResponse.json({ ok: true, id, status: result.status, approvalRestarted: true });
        } catch (e) {
          if (e instanceof NrsApprovalError) return jsonError(e.message, e.status);
          console.error("[nrs] project approval restart failed", e);
          return jsonError("Saved, but could not restart the approval.", 500);
        }
      }
      return NextResponse.json({ ok: true, id });
    }
    const archivedAt = action === "archive" ? new Date().toISOString() : null;
    const { error: arcErr } = await admin.from("nrs_projects").update({ archived_at: archivedAt }).eq("id", id);
    if (arcErr) return jsonError(arcErr.message, 500);
    await logAudit(admin, {
      orgId: project.org_id,
      actorUser: ctx.user.id,
      entity: "nrs_projects",
      entityId: id,
      action,
      before: { archived_at: project.archived_at },
      after: { archived_at: archivedAt },
    });
    return NextResponse.json({ ok: true, id });
  }

  return jsonError("Unknown action");
}

/** Fields an approver sees or that drive the chain (amount_minor_gt). */
function approvalFieldsChanged(
  before: { name: string; description: string | null; owner_member_id: string; value_minor: number | null; value_currency: string | null },
  after: ProjectInput
): boolean {
  return (
    before.name !== after.name ||
    (before.description ?? "") !== after.description ||
    before.owner_member_id !== after.owner_member_id ||
    before.value_minor !== after.value_minor ||
    before.value_currency !== after.value_currency
  );
}
