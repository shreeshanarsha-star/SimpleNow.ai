import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminActivity } from "@/lib/adminActivityLog";

// POST { orgIds: string[], featureKey: string, action: "grant" | "revoke" }
// Applies one tool grant/revoke across many orgs in a single action, instead
// of toggling each org's row one at a time from Organizations.
export async function POST(request: Request) {
  let user;
  try {
    ({ user } = await requireAdminUser());
  } catch (res) {
    return res as Response;
  }

  const body = await request.json().catch(() => null);
  const orgIds = Array.isArray(body?.orgIds) ? body.orgIds.filter((x: unknown) => typeof x === "string") : [];
  const featureKey = typeof body?.featureKey === "string" ? body.featureKey.trim() : "";
  const action = body?.action === "revoke" ? "revoke" : body?.action === "grant" ? "grant" : null;

  if (!orgIds.length) return NextResponse.json({ error: "orgIds is required." }, { status: 400 });
  if (!featureKey) return NextResponse.json({ error: "featureKey is required." }, { status: 400 });
  if (!action) return NextResponse.json({ error: "action must be grant or revoke." }, { status: 400 });

  const admin = createAdminClient();

  if (action === "grant") {
    // No unique constraint on (org_id, feature_key) in this table (only
    // (user_id, feature_key) has one), so upsert-on-conflict isn't
    // available here -- delete any existing rows for this exact
    // org+feature pair first, then insert fresh ones, to avoid duplicates.
    await admin.from("feature_access").delete().eq("feature_key", featureKey).in("org_id", orgIds);
    const rows = orgIds.map((orgId: string) => ({ org_id: orgId, feature_key: featureKey, granted_by: user.id }));
    const { error } = await admin.from("feature_access").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await admin.from("feature_access").delete().eq("feature_key", featureKey).in("org_id", orgIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAdminActivity(admin, {
    actorId: user.id,
    actorEmail: user.email,
    action: action === "grant" ? "bulk_grant_feature" : "bulk_revoke_feature",
    targetType: "organization",
    targetId: orgIds.join(","),
    targetLabel: featureKey,
    details: { orgCount: orgIds.length },
  });

  return NextResponse.json({ ok: true, count: orgIds.length });
}
