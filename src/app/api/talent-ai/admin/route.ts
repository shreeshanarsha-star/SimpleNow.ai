import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/org";
import { TALENT_ROLES, ROLE_IMPLIES, logAudit } from "@/lib/talentRoles";

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
    .select("id, email, full_name, manager_id, is_admin, org_role, employee_id, department, designation, location, joining_date")
    .eq("org_id", orgId)
    .order("email");
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const { data: roles, error: rErr } = await admin
    .from("talent_user_roles")
    .select("id, user_id, role")
    .eq("org_id", orgId);
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

  // Real status, not a fabricated field: Supabase Auth already tracks
  // last_sign_in_at (never signed in = pending invite) and banned_until
  // (a genuine suspend mechanism, not a UI-only flag) per auth user.
  // listUsers() is project-wide, not org-scoped, so we filter down to just
  // this org's profile ids after fetching.
  const statusByUserId = new Map<string, "active" | "pending" | "suspended">();
  try {
    const { data: authList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const profileIds = new Set((profiles || []).map((p) => p.id));
    for (const u of authList?.users || []) {
      if (!profileIds.has(u.id)) continue;
      const isSuspended = !!u.banned_until && new Date(u.banned_until).getTime() > Date.now();
      statusByUserId.set(u.id, isSuspended ? "suspended" : u.last_sign_in_at ? "active" : "pending");
    }
  } catch {
    // If this fails for any reason, fall back to omitting status rather
    // than blocking the whole page -- the rest of the table is still real.
  }
  const profilesWithStatus = (profiles || []).map((p) => ({ ...p, status: statusByUserId.get(p.id) || "active" }));

  return NextResponse.json({ profiles: profilesWithStatus, roles, availableRoles: TALENT_ROLES });
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

  // lead_recruiter/hr_head are distinct labels, but every real permission
  // check in the app is keyed off the base 7 roles -- see ROLE_IMPLIES.
  const impliedRole = ROLE_IMPLIES[role as never];
  if (impliedRole) {
    try {
      await admin.from("talent_user_roles").insert({ user_id: targetUserId, role: impliedRole, created_by: user.id, org_id: orgId });
    } catch {
      // best-effort: ignore "already has this role" collisions
    }
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
  if (!targetUserId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }

  const admin = createAdminClient();

  const targetCtx = await getOrgContext(admin, targetUserId);
  if (targetCtx.orgId !== orgId) {
    return NextResponse.json({ error: "That person isn't a member of your organization." }, { status: 403 });
  }

  // Profile field updates -- only touch keys actually present in the body,
  // so this one PATCH handles manager changes, employee-detail edits, and
  // suspend/unsuspend independently without clobbering the others.
  const profileUpdate: Record<string, unknown> = {};
  if ("managerId" in body) {
    const managerId = body.managerId === null ? null : String(body.managerId);
    if (managerId) {
      const managerCtx = await getOrgContext(admin, managerId);
      if (managerCtx.orgId !== orgId) {
        return NextResponse.json({ error: "The manager must also be a member of your organization." }, { status: 403 });
      }
    }
    profileUpdate.manager_id = managerId;
  }
  if ("employeeId" in body) profileUpdate.employee_id = body.employeeId || null;
  if ("department" in body) profileUpdate.department = body.department || null;
  if ("designation" in body) profileUpdate.designation = body.designation || null;
  if ("location" in body) profileUpdate.location = body.location || null;
  if ("joiningDate" in body) profileUpdate.joining_date = body.joiningDate || null;

  let profile = null;
  if (Object.keys(profileUpdate).length > 0) {
    const { data, error } = await admin.from("profiles").update(profileUpdate).eq("id", targetUserId).select().single();
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "That employee ID is already in use." }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    profile = data;
    await logAudit({ entityType: "profiles", entityId: targetUserId, actorId: user.id, action: "profile_updated", detail: profileUpdate, orgId });
  }

  // Suspend/unsuspend -- a real Supabase Auth capability (banned_until),
  // not a cosmetic status flag. Suspending blocks sign-in immediately;
  // it does not touch any of their existing data, approvals, or
  // assignments (that reassignment step is real work, not done here).
  if ("suspend" in body) {
    const suspend = body.suspend === true;
    const { error: authErr } = await admin.auth.admin.updateUserById(targetUserId, {
      ban_duration: suspend ? "876000h" : "none",
    });
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });
    await logAudit({ entityType: "profiles", entityId: targetUserId, actorId: user.id, action: suspend ? "user_suspended" : "user_unsuspended", orgId });
  }

  return NextResponse.json({ profile, ok: true });
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

  const { data: existingRow } = await admin
    .from("talent_user_roles")
    .select("user_id, role")
    .eq("id", roleAssignmentId)
    .eq("org_id", orgId)
    .maybeSingle();

  // Only remove role assignments that belong to the caller's own org.
  const { error } = await admin
    .from("talent_user_roles")
    .delete()
    .eq("id", roleAssignmentId)
    .eq("org_id", orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Removing lead_recruiter/hr_head also removes the implied base role
  // that was auto-added alongside it -- see ROLE_IMPLIES.
  if (existingRow) {
    const impliedRole = ROLE_IMPLIES[existingRow.role as never];
    if (impliedRole) {
      await admin
        .from("talent_user_roles")
        .delete()
        .eq("user_id", existingRow.user_id)
        .eq("role", impliedRole)
        .eq("org_id", orgId);
    }
  }

  await logAudit({ entityType: "talent_user_roles", entityId: roleAssignmentId, actorId: user.id, action: "role_removed", orgId });
  return NextResponse.json({ ok: true });
}
