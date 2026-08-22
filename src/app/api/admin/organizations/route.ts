import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";


// Platform owner only: list every organization (any status), how many
// members each has, and what it's currently been granted. This is the
// approval queue for self-serve org signups plus the master tenant list.
export async function GET() {
  try {
    await requireAdminUser();
  } catch (res) {
    return res as Response;
  }
  const admin = createAdminClient();

  const { data: orgs, error } = await admin
    .from("organizations")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: members } = await admin.from("profiles").select("id, org_id, email, org_role");
  const { data: grants } = await admin.from("feature_access").select("org_id, feature_key").not("org_id", "is", null);

  const byOrg = new Map<string, { members: number; features: string[] }>();
  for (const o of orgs || []) byOrg.set(o.id, { members: 0, features: [] });
  for (const m of members || []) {
    if (m.org_id && byOrg.has(m.org_id)) byOrg.get(m.org_id)!.members += 1;
  }
  for (const g of grants || []) {
    if (g.org_id && byOrg.has(g.org_id)) byOrg.get(g.org_id)!.features.push(g.feature_key);
  }

  const shaped = (orgs || []).map((o) => ({
    ...o,
    memberCount: byOrg.get(o.id)?.members ?? 0,
    features: byOrg.get(o.id)?.features ?? [],
  }));

  return NextResponse.json({ organizations: shaped });
}

// Owner-only status/plan changes: approve a pending org, suspend/reactivate
// an existing one, or switch its plan between individual and bulk.
export async function PATCH(req: Request) {
  let user;
  try {
    ({ user } = await requireAdminUser());
  } catch (res) {
    return res as Response;
  }
  const body = await req.json().catch(() => null);
  const orgId = typeof body?.orgId === "string" ? body.orgId : null;
  if (!orgId) return NextResponse.json({ error: "orgId is required." }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (body.action === "approve") {
    patch.status = "approved";
    patch.approved_at = new Date().toISOString();
    patch.approved_by = user.id;
  } else if (body.action === "suspend") {
    patch.status = "suspended";
  } else if (body.action === "reactivate") {
    patch.status = "approved";
  } else if (body.action === "set_plan") {
    if (body.plan !== "individual" && body.plan !== "bulk") {
      return NextResponse.json({ error: "plan must be individual or bulk." }, { status: 400 });
    }
    patch.plan = body.plan;
  } else {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.from("organizations").update(patch).eq("id", orgId).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ organization: data });
}
