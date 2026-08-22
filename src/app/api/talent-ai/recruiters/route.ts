import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

const FEATURE_KEY = "Talent.ai";

// Anyone inside Talent.ai can see the recruiter roster -- needed for the
// TA Head assignment picker. Read-only, no sensitive fields.
export async function GET() {
  let orgId;
  try {
    ({ orgId } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const admin = createAdminClient();
  const { data: roleRows } = await admin.from("talent_user_roles").select("user_id").eq("role", "recruiter").eq("org_id", orgId);
  const ids = Array.from(new Set((roleRows || []).map((r) => r.user_id)));
  if (ids.length === 0) return NextResponse.json({ recruiters: [] });
  const { data: profiles } = await admin.from("profiles").select("id, email, full_name").in("id", ids);
  return NextResponse.json({ recruiters: profiles || [] });
}
