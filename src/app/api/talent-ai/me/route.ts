import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserRoles } from "@/lib/talentRoles";

const FEATURE_KEY = "Talent.ai";

// What tabs/actions should this viewer see? Roles + admin flag, so the
// client can render the right home context without guessing.
export async function GET() {
  let user;
  try {
    ({ user } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const admin = createAdminClient();
  const roles = await getUserRoles(admin, user.id);
  const { data: profile } = await admin.from("profiles").select("is_admin, org_id, org_role, manager_id, full_name, email, avatar_url").eq("id", user.id).single();
  return NextResponse.json({
    roles,
    isAdmin: !!profile?.is_admin,
    isOrgAdmin: profile?.org_role === "org_admin",
    profile,
  });
}
