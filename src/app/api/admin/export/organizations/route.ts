import { requireAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { toCsv, csvResponse } from "@/lib/adminCsv";

export async function GET() {
  try {
    await requireAdminUser();
  } catch (res) {
    return res as Response;
  }
  const admin = createAdminClient();
  const { data: orgs } = await admin.from("organizations").select("*").order("created_at", { ascending: false });
  const { data: members } = await admin.from("profiles").select("id, org_id");
  const { data: grants } = await admin.from("feature_access").select("org_id, feature_key").not("org_id", "is", null);

  const memberCount = new Map<string, number>();
  for (const m of members || []) {
    if (m.org_id) memberCount.set(m.org_id, (memberCount.get(m.org_id) || 0) + 1);
  }
  const features = new Map<string, string[]>();
  for (const g of grants || []) {
    if (!g.org_id) continue;
    features.set(g.org_id, [...(features.get(g.org_id) || []), g.feature_key]);
  }

  const rows = (orgs || []).map((o) => ({
    name: o.name,
    status: o.status,
    plan: o.plan,
    members: memberCount.get(o.id) || 0,
    features: (features.get(o.id) || []).join("; "),
    created_at: o.created_at,
  }));

  const csv = toCsv(rows, ["name", "status", "plan", "members", "features", "created_at"]);
  return csvResponse(csv, `organizations-${new Date().toISOString().slice(0, 10)}.csv`);
}
