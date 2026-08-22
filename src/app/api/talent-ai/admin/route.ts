import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/org";
import { TALENT_ROLES, logAudit } from "@/lib/talentRoles";

// Org admin (or the platform owner) only: list every profile *in this
// organization* with its Talent.ai roles + manager, and manage role
// assignments. This is the "who does what" control panel the whole
// approval/assignment workflow depends on -- scoped to one org so two
// customers' teams can never see or manage each other's people.
export async function GET() {
  let orgId: string | null;
  try {
    ({ orgId } = await requireOrgAdmin());
  } catch (res) {
    return res as Response;
  }
  if (!orgId) return NextResponse.json({ profiles: [], roles: [], availableRoles: TALENT_ROLES });
  const admin = createAdminClient();

  const { data: profiles, error: pErr } = await admin
    .from("profiles")
    .select("id, email, full_name, manager_id, is_admin, org_role")
    .eq("org_id", orgId)
    .order("email");
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const { data: roles, error: rErr } = await admin
    .from("talent_user_roles")
    .select("id, user_id, role")
    .eq("org_id", orgId);
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

  return NextResponse.json({ profiles, roles, availableRoles: TALENT_ROLES });
}

export async function POST(req: Request) {
  let user, orgId: string | null;
  try {
    ({ user, orgId } = await requireOrgAdmin());
  } catch (res) {
    return res as Response;
  }
  if (!orgId) return NextResponse.json({ error: "Your account isn't part of an organization yet." }, { status: 403 });

  const body = await req.json().catch(() => null);
  const targetUserId = typeof body?.userId === "string" ? body.userId : null;
  const role = typeof body?.role === "string" ? body.role : null;
  if (!targetUserId || !role || !TALENT_ROLES.includes(role as never)) {
    return NextResponse.json({ error: "userId and a valid role are required." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Guard against an org admin assigning a role to someone outside their
  // own organization.
  const targetCtx = await getOrgContext(admin, targetUserId);
  if (targetCtx.orgId !== orgId) {
    return NextResponse.json({ error: "That person isn't a member of your organization." }, { status: 403 });
  }

  const { data, error } = await admin
    .from("talent_user_roles")
    .insert({ user_id: targetUserId, role, created_by: user.id, org_id: orgId })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "That user already has this role." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Holding a Talent.ai role implies the org has access to the app itself.
  await admin
    .from("feature_access")
    .upsert({ org_id: orgId, feature_key: "Talent.ai", granted_by: user.id }, { onConflict: "org_id,feature_key" })
    .select();

  await logAudit({ entityType: "talent_user_roles", entityId: data.id, actorId: user.id, action: "role_assigned", detail: { targetUserId, role }, orgId });
  return NextResponse.json({ roleAssignment: data }, { status: 201 });
}

export async function PATCH(req: Request) {
  let user, orgId: string | null;
  try {
    ({ user, orgId } = await requireOrgAdmin());
  } catch (res) {
    return res as Response;
  }
  if (!orgId) return NextResponse.json({ error: "Your account isn't part of an organization yet." }, { status: 403 });

  const body = await req.json().catch(() => null);
  const targetUserId = typeof body?.userId === "string" ? body.userId : null;
  if (!targetUserId || !("managerId" in (body || {}))) {
    return NextResponse.json({ error: "userId and managerId are required." }, { status: 400 });
  }
  const managerId = body.managerId === null ? null : String(body.managerId);

  const admin = createAdminClient();

  const targetCtx = await getOrgContext(admin, targetUserId);
  if (targetCtx.orgId !== orgId) {
    return NextResponse.json({ error: "That person isn't a member of your organization." }, { status: 403 });
  }
  if (managerId) {
    const managerCtx = await getOrgContext(admin, managerId);
    if (managerCtx.orgId !== orgId) {
      return NextResponse.json({ error: "The manager must also be a member of your organization." }, { status: 403 });
    }
  }

  const { data, error } = await admin
    .from("profiles")
    .update({ manager_id: managerId })
    .eq("id", targetUserId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({ entityType: "profiles", entityId: targetUserId, actorId: user.id, action: "manager_set", detail: { managerId }, orgId });
  return NextResponse.json({ profile: data });
}

export async function DELETE(req: Request) {
  let user, orgId: string | null;
  try {
    ({ user, orgId } = await requireOrgAdmin());
  } catch (res) {
    return res as Response;
  }
  if (!orgId) return NextResponse.json({ error: "Your account isn't part of an organization yet." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const roleAssignmentId = searchParams.get("roleAssignmentId");
  if (!roleAssignmentId) {
    return NextResponse.json({ error: "roleAssignmentId query param is required." }, { status: 400 });
  }
  const admin = createAdminClient();

  // Only remove role assignments that belong to the caller's own org.
  const { error } = await admin
    .from("talent_user_roles")
    .delete()
    .eq("id", roleAssignmentId)
    .eq("org_id", orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({ entityType: "talent_user_roles", entityId: roleAssignmentId, actorId: user.id, action: "role_removed", orgId });
  return NextResponse.json({ ok: true });
}
