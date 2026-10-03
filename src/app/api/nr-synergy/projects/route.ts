import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRequest, NrsApprovalError } from "@/lib/nrs/approvals";
import { guard, jsonError, readBody } from "@/app/tools/nr-synergy/_home/server";
import { parseProjectInput, projectFields, replaceMembers } from "./_lib";

// POST /api/nr-synergy/projects — any member starts a project. It is stored
// with approval_status = 'pending' and routed through the approval engine
// (kind 'project': the creator's reporting manager; HR may also decide).
// Writes use the service-role client: nrs_projects has no client write policy.
export async function POST(req: Request) {
  const g = await guard("projects");
  if (!g.ok) return g.res;
  const { ctx, member } = g;

  const body = await readBody(req);
  if (!body) return jsonError("Invalid request body");

  const admin = createAdminClient();
  const parsed = await parseProjectInput(admin, member.org_id, body, member.id);
  if (!parsed.ok) return jsonError(parsed.error);
  const input = parsed.input;

  const { data: created, error } = await admin
    .from("nrs_projects")
    .insert({
      org_id: member.org_id,
      ...projectFields(input),
      approval_status: "pending",
      created_by_member: member.id,
    })
    .select("id")
    .single();
  if (error || !created) return jsonError(error?.message ?? "Could not create the project", 500);
  const projectId = (created as { id: string }).id;

  const memErr = await replaceMembers(admin, projectId, input.member_ids);
  if (memErr) {
    await admin.from("nrs_projects").delete().eq("id", projectId);
    return jsonError(memErr, 500);
  }

  try {
    const result = await createRequest("project", projectId, member.id, input.name, input.value_minor, input.value_currency, {
      admin,
      createdBy: ctx.user.id,
      summary: input.description.slice(0, 300),
    });
    return NextResponse.json({ ok: true, id: projectId, status: result.status });
  } catch (e) {
    await admin.from("nrs_requests").delete().eq("kind", "project").eq("subject_id", projectId);
    await admin.from("nrs_projects").delete().eq("id", projectId);
    if (e instanceof NrsApprovalError) return jsonError(e.message, e.status);
    console.error("[nrs] project submit failed", e);
    return jsonError("Could not submit the project for approval.", 500);
  }
}
