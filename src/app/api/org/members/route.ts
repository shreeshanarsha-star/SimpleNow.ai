import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

// List the caller's own organization's members. Org admin (or platform
// owner) only.
export async function GET() {
  let orgId;
  try {
    ({ orgId } = await requireOrgAdmin());
  } catch (res) {
    return res as Response;
  }
  if (!orgId) return NextResponse.json({ members: [] });

  const admin = createAdminClient();
  const { data: members, error } = await admin
    .from("profiles")
    .select("id, email, full_name, org_role, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ members });
}

// Add an existing, not-yet-in-any-organization account to this org by
// email (e.g. a colleague who signed up but hasn't created/joined an org
// yet). No email-invite flow exists yet -- this is the manual path.
export async function POST(req: Request) {
  let orgId;
  try {
    ({ orgId } = await requireOrgAdmin());
  } catch (res) {
    return res as Response;
  }
  if (!orgId) return NextResponse.json({ error: "Your account isn't part of an organization yet." }, { status: 403 });

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) return NextResponse.json({ error: "email is required." }, { status: 400 });

  const admin = createAdminClient();
  const { data: target, error: findError } = await admin
    .from("profiles")
    .select("id, org_id")
    .ilike("email", email)
    .maybeSingle();
  if (findError) return NextResponse.json({ error: findError.message }, { status: 500 });
  if (!target) {
    return NextResponse.json({ error: "No account with that email has signed up yet." }, { status: 404 });
  }
  if (target.org_id) {
    return NextResponse.json({ error: "That person already belongs to an organization." }, { status: 409 });
  }

  const { error } = await admin
    .from("profiles")
    .update({ org_id: orgId, org_role: "member" })
    .eq("id", target.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// Remove a member from the org (they become unaffiliated -- can be added
// to another org later). Can't remove yourself this way, and can't remove
// the org's own owner_user_id.
export async function DELETE(req: Request) {
  let user, orgId;
  try {
    ({ user, orgId } = await requireOrgAdmin());
  } catch (res) {
    return res as Response;
  }
  if (!orgId) return NextResponse.json({ error: "Your account isn't part of an organization yet." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const targetUserId = searchParams.get("userId");
  if (!targetUserId) return NextResponse.json({ error: "userId query param is required." }, { status: 400 });
  if (targetUserId === user.id) {
    return NextResponse.json({ error: "You can't remove yourself from the organization." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("org_id").eq("id", targetUserId).single();
  if (target?.org_id !== orgId) {
    return NextResponse.json({ error: "That person isn't a member of your organization." }, { status: 403 });
  }

  const { error } = await admin
    .from("profiles")
    .update({ org_id: null, org_role: "member" })
    .eq("id", targetUserId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Also drop any Talent.ai roles they held in this org -- those are
  // meaningless without org membership.
  await admin.from("talent_user_roles").delete().eq("user_id", targetUserId).eq("org_id", orgId);

  return NextResponse.json({ ok: true });
}
