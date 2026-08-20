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

// Admin, OR a user the admin has explicitly granted this feature to from
// /admin/users. featureKey must match a tool name in src/lib/departments.ts
// exactly (e.g. "Job Postings.ai").
export async function requireFeatureAccess(featureKey: string) {
  const { user, supabase } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (profile?.is_admin) {
    return { user, supabase, isAdmin: true };
  }

  const { data: grant } = await supabase
    .from("feature_access")
    .select("id")
    .eq("user_id", user.id)
    .eq("feature_key", featureKey)
    .maybeSingle();

  if (!grant) {
    throw unauthorized(
      `You don't have access to "${featureKey}" yet. Ask the admin to grant it from the Admin page.`,
      403
    );
  }

  return { user, supabase, isAdmin: false };
}
