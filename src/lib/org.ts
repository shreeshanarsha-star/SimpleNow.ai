import { SupabaseClient } from "@supabase/supabase-js";

// Every authenticated user belongs to at most one organization. This is
// the one place that answers "who is this person, and which org (if any)
// are they acting on behalf of" -- every multi-tenant route builds on it.
export type OrgContext = {
  userId: string;
  isPlatformOwner: boolean; // profiles.is_admin -- Shree, cross-org override
  orgId: string | null;
  orgRole: "org_admin" | "member" | null;
};

export async function getOrgContext(
  admin: SupabaseClient,
  userId: string
): Promise<OrgContext> {
  const { data: profile } = await admin
    .from("profiles")
    .select("is_admin, org_id, org_role")
    .eq("id", userId)
    .maybeSingle();

  return {
    userId,
    isPlatformOwner: !!profile?.is_admin,
    orgId: profile?.org_id ?? null,
    orgRole: (profile?.org_role as "org_admin" | "member" | null) ?? null,
  };
}

// True if this person can manage the given organization's members, roles,
// and settings -- either they're that org's own admin, or they're the
// platform owner (who has override rights everywhere).
export function canManageOrg(ctx: OrgContext, targetOrgId: string): boolean {
  if (ctx.isPlatformOwner) return true;
  return ctx.orgRole === "org_admin" && ctx.orgId === targetOrgId;
}
