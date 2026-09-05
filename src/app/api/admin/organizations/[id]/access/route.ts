import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminActivity } from "@/lib/adminActivityLog";

// POST { featureKey } — grant an organization access to a tool (sold
// individually) or as part of a bulk plan. DELETE revokes it. Owner-only:
// this is the actual "what did this customer buy" ledger.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let user, supabase;
  try {
    ({ user, supabase } = await requireAdminUser());
  } catch (res) {
    return res as Response;
  }

  const { id: orgId } = await params;
  const body = await request.json().catch(() => null);
  const featureKey = typeof body?.featureKey === "string" ? body.featureKey.trim() : "";

  if (!featureKey) {
    return NextResponse.json({ error: "featureKey is required." }, { status: 400 });
  }

  const { error } = await supabase.from("feature_access").insert({
    org_id: orgId,
    feature_key: featureKey,
    granted_by: user.id,
  });

  if (error && error.code !== "23505") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAdminActivity(createAdminClient(), {
    actorId: user.id,
    actorEmail: user.email,
    action: "grant_feature",
    targetType: "organization",
    targetId: orgId,
    targetLabel: featureKey,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let supabase, user;
  try {
    ({ supabase, user } = await requireAdminUser());
  } catch (res) {
    return res as Response;
  }

  const { id: orgId } = await params;
  const body = await request.json().catch(() => null);
  const featureKey = typeof body?.featureKey === "string" ? body.featureKey.trim() : "";

  if (!featureKey) {
    return NextResponse.json({ error: "featureKey is required." }, { status: 400 });
  }

  const { error } = await supabase
    .from("feature_access")
    .delete()
    .eq("org_id", orgId)
    .eq("feature_key", featureKey);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAdminActivity(createAdminClient(), {
    actorId: user.id,
    actorEmail: user.email,
    action: "revoke_feature",
    targetType: "organization",
    targetId: orgId,
    targetLabel: featureKey,
  });

  return NextResponse.json({ ok: true });
}
