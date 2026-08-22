import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { TALENT_ROLES, ROLE_IMPLIES, logAudit } from "@/lib/talentRoles";

const ORG_ROLES = new Set(["member", "org_admin"]);

// Bulk-onboarding path for a company that buys the platform: the org admin
// creates a real login for a colleague directly (no self-signup required).
// Creates the Supabase Auth user, assigns them into this org, and emails a
// "set your password" link -- no plaintext password is ever generated,
// stored, or transmitted.
export async function POST(req: Request) {
  let user, orgId: string | null;
  try {
    ({ user, orgId } = await requireOrgAdmin());
  } catch (res) {
    return res as Response;
  }
  if (!orgId) {
    return NextResponse.json({ error: "Your account isn't part of an organization yet." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";
  const orgRole = typeof body?.orgRole === "string" && ORG_ROLES.has(body.orgRole) ? body.orgRole : "member";
  // Optional "Add User" employment details + a Talent.ai User Type. None
  // of this is required -- the original bare name/email/orgRole flow from
  // /org/settings still works unchanged.
  const employeeId = typeof body?.employeeId === "string" ? body.employeeId.trim() || null : null;
  const department = typeof body?.department === "string" ? body.department.trim() || null : null;
  const designation = typeof body?.designation === "string" ? body.designation.trim() || null : null;
  const location = typeof body?.location === "string" ? body.location.trim() || null : null;
  const joiningDate = typeof body?.joiningDate === "string" ? body.joiningDate.trim() || null : null;
  const managerId = typeof body?.managerId === "string" ? body.managerId.trim() || null : null;
  // "employee" isn't a real TalentRole -- it means "no Talent.ai role",
  // which is what everyone gets by default anyway.
  const talentRole = typeof body?.talentRole === "string" && body.talentRole !== "employee" && (TALENT_ROLES as string[]).includes(body.talentRole)
    ? body.talentRole
    : null;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }
  if (!fullName) {
    return NextResponse.json({ error: "Full name is required." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: existing } = await admin.from("profiles").select("id").ilike("email", email).maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "Someone with that email already has an account." }, { status: 409 });
  }

  const { data: org } = await admin.from("organizations").select("name").eq("id", orgId).single();

  // No password is set here -- the account is unusable to sign in until the
  // person follows the emailed link and sets one themselves.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createError || !created?.user) {
    return NextResponse.json({ error: createError?.message || "Could not create the account." }, { status: 500 });
  }
  const newUserId = created.user.id;

  // The on_auth_user_created trigger already inserted a bare profiles row
  // (org_id null). Fill in the org assignment + display name now.
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      org_id: orgId,
      org_role: orgRole,
      full_name: fullName,
      employee_id: employeeId,
      department,
      designation,
      location,
      joining_date: joiningDate,
      manager_id: managerId,
    })
    .eq("id", newUserId);
  if (profileError) {
    if (profileError.code === "23505") {
      return NextResponse.json({ error: "That employee ID is already in use." }, { status: 409 });
    }
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  if (talentRole) {
    await admin.from("talent_user_roles").insert({ user_id: newUserId, role: talentRole, created_by: user.id, org_id: orgId });
    const impliedRole = ROLE_IMPLIES[talentRole as never];
    if (impliedRole) {
      try {
        await admin.from("talent_user_roles").insert({ user_id: newUserId, role: impliedRole, created_by: user.id, org_id: orgId });
      } catch {
        // best-effort
      }
    }
    await admin.from("feature_access").upsert({ org_id: orgId, feature_key: "Talent.ai", granted_by: user.id }, { onConflict: "org_id,feature_key" }).select();
  }
  await logAudit({ entityType: "profiles", entityId: newUserId, actorId: user.id, action: "user_created", detail: { email, talentRole }, orgId });

  const origin = new URL(req.url).origin;
  // "recovery", not "invite" -- the user already exists (createUser() just
  // made them). generateLink's "invite" type tries to create the user as
  // part of generating the link, which collides with the account we just
  // created and fails with "already registered". "recovery" issues a
  // password-set link for an existing user, which is exactly this case.
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${origin}/auth/callback?next=/reset-password` },
  });
  if (linkError || !linkData?.properties?.action_link) {
    // Account exists and is assigned to the org either way -- surface the
    // email failure but don't roll back the account creation.
    return NextResponse.json(
      { error: `Account created, but the invite email link could not be generated: ${linkError?.message || "unknown error"}` },
      { status: 502 }
    );
  }

  const orgName = org?.name || "your organization";
  const emailResult = await sendEmail({
    to: email,
    subject: `You've been added to ${orgName} on Askshree`,
    html: `
      <p>Hi ${fullName || ""},</p>
      <p>An admin at <strong>${orgName}</strong> has created your account on Askshree.</p>
      <p><a href="${linkData.properties.action_link}">Click here to set your password and sign in</a>.</p>
      <p>This link is one-time use and will expire after a while -- if it's expired, ask your admin to resend it or use "Forgot password" on the sign-in page with this email address.</p>
    `,
  });

  return NextResponse.json({
    ok: true,
    userId: newUserId,
    emailSent: emailResult.ok,
    emailError: emailResult.ok ? undefined : emailResult.error,
    // Always returned, not just on email failure -- the org admin may want
    // to hand this over directly (Slack/WhatsApp/in person) instead of
    // relying on email deliverability, or set the password themselves on
    // the new hire's behalf and tell them out of band. One-time use.
    setupLink: linkData.properties.action_link,
  });
}
