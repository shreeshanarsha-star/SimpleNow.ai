import { createClient } from "./server";

function unauthorized(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Any signed-in user — no admin or feature check. Use for routes every
// logged-in user may call, and layer a more specific check on top.
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw unauthorized("Not authenticated", 401);
  }

  return { user, supabase };
}

// The owner only. Use for anything that manages other users' access or
// approves/rejects/publishes what a tool produces.
export async function requireAdminUser() {
  const { user, supabase } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    throw unauthorized("Admin access required", 403);
  }

  return { user, supabase };
}

// Platform owner, OR a member of an organization that has purchased this
// feature. featureKey must match a tool name in src/lib/departments.ts
// exactly (e.g. "Job Postings.ai"). Access is granted per-organization by
// the platform owner from /admin/organizations -- not per individual user.
export async function requireFeatureAccess(featureKey: string) {
  const { user, supabase } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin, org_id")
    .eq("id", user.id)
    .single();

  if (profile?.is_admin) {
    return { user, supabase, isAdmin: true, orgId: profile.org_id as string | null };
  }

  if (!profile?.org_id) {
    throw unauthorized(
      "Your account isn't part of an organization yet. Create one or ask your organization's admin to add you.",
      403
    );
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("plan, status")
    .eq("id", profile.org_id)
    .maybeSingle();

  if (org?.status !== "approved") {
    throw unauthorized(
      "Your organization is still pending approval from the platform owner.",
      403
    );
  }

  // A bulk-plan org gets every live tool automatically -- no per-feature
  // grant row needed. An individual-plan org needs an explicit grant.
  if (org.plan !== "bulk") {
    const { data: grant } = await supabase
      .from("feature_access")
      .select("id")
      .eq("org_id", profile.org_id)
      .eq("feature_key", featureKey)
      .maybeSingle();

    if (!grant) {
      throw unauthorized(
        `Your organization doesn't have access to "${featureKey}" yet. Ask the platform owner to grant it.`,
        403
      );
    }
  }

  return { user, supabase, isAdmin: false, orgId: profile.org_id as string };
}

// The platform owner, OR the org_admin of the given organization. Use for
// routes that manage members/roles/settings within one organization.
export async function requireOrgAdmin() {
  const { user, supabase } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin, org_id, org_role")
    .eq("id", user.id)
    .single();

  const isAdmin = !!profile?.is_admin;
  const isOrgAdmin = profile?.org_role === "org_admin";

  if (!isAdmin && !isOrgAdmin) {
    throw unauthorized("Organization admin access required.", 403);
  }
  if (!profile?.org_id && !isAdmin) {
    throw unauthorized("Your account isn't part of an organization yet.", 403);
  }

  return { user, supabase, isAdmin, orgId: (profile?.org_id as string | null) ?? null };
}
