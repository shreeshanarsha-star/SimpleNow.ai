import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { TALENT_ROLES, logAudit } from "@/lib/talentRoles";

// Admin-only: list every profile with its Talent.ai roles + manager, and
// manage role assignments. This is the "who does what" control panel the
// whole approval/assignment workflow depends on.
export async function GET() {
  try {
    await requireAdminUser();
  } catch (res) {
    return res as Response;
  }
  const admin = createAdminClient();

  const { data: profiles, error: pErr } = await admin
    .from("profiles")
    .select("id, email, full_name, manager_id, is_admin")
    .order("email");
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const { data: roles, error: rErr } = await admin.from("talent_user_roles").select("id, user_id, role");
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

  return NextResponse.json({ profiles, roles, availableRoles: TALENT_ROLES });
}

export async function POST(req: Request) {
  let user;
  try {
    ({ user } = await requireAdminUser());
  } catch (res) {
    return res as Response;
  }
  const body = await req.json().catch(() => null);
  const targetUserId = typeof body?.userId === "string" ? body.userId : null;
  const role = typeof body?.role === "string" ? body.role : null;
  if (!targetUserId || !role || !TALENT_ROLES.includes(role as never)) {
    return NextResponse.json({ error: "userId and a valid role are required." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("talent_user_roles")
    .insert({ user_id: targetUserId, role, created_by: user.id })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "That user already has this role." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Holding a Talent.ai role implies access to the app itself.
  await admin
    .from("feature_access")
    .upsert({ user_id: targetUserId, feature_key: "Talent.ai", granted_by: user.id }, { onConflict: "user_id,feature_key" })
    .select();

  await logAudit({ entityType: "talent_user_roles", entityId: data.id, actorId: user.id, action: "role_assigned", detail: { targetUserId, role } });
  return NextResponse.json({ roleAssignment: data }, { status: 201 });
}

export async function PATCH(req: Request) {
  let user;
  try {
    ({ user } = await requireAdminUser());
  } catch (res) {
    return res as Response;
  }
  const body = await req.json().catch(() => null);
  const targetUserId = typeof body?.userId === "string" ? body.userId : null;
  if (!targetUserId || !("managerId" in (body || {}))) {
    return NextResponse.json({ error: "userId and managerId are required." }, { status: 400 });
  }
  const managerId = body.managerId === null ? null : String(body.managerId);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .update({ manager_id: managerId })
    .eq("id", targetUserId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({ entityType: "profiles", entityId: targetUserId, actorId: user.id, action: "manager_set", detail: { managerId } });
  return NextResponse.json({ profile: data });
}

export async function DELETE(req: Request) {
  let user;
  try {
    ({ user } = await requireAdminUser());
  } catch (res) {
    return res as Response;
  }
  const { searchParams } = new URL(req.url);
  const roleAssignmentId = searchParams.get("roleAssignmentId");
  if (!roleAssignmentId) {
    return NextResponse.json({ error: "roleAssignmentId query param is required." }, { status: 400 });
  }
  const admin = createAdminClient();
  const { error } = await admin.from("talent_user_roles").delete().eq("id", roleAssignmentId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({ entityType: "talent_user_roles", entityId: roleAssignmentId, actorId: user.id, action: "role_removed" });
  return NextResponse.json({ ok: true });
}
