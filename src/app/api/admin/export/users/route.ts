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
  const { data: profiles } = await admin
    .from("profiles")
    .select("email, is_admin, org_id, org_role, is_anonymous, credits, created_at, converted_at")
    .order("created_at", { ascending: true });
  const { data: orgs } = await admin.from("organizations").select("id, name");
  const orgNameById = new Map((orgs || []).map((o) => [o.id, o.name]));

  const rows = (profiles || []).map((p) => ({
    email: p.email,
    role: p.is_admin ? "platform owner" : p.org_role || (p.org_id ? "member" : p.is_anonymous ? "guest" : "individual"),
    organization: p.org_id ? orgNameById.get(p.org_id) || "" : "",
    credits: p.credits ?? "",
    converted_at: p.converted_at || "",
    created_at: p.created_at,
  }));

  const csv = toCsv(rows, ["email", "role", "organization", "credits", "converted_at", "created_at"]);
  return csvResponse(csv, `users-${new Date().toISOString().slice(0, 10)}.csv`);
}
