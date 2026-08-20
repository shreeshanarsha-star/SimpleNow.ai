import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/requireAdmin";

export const maxDuration = 15;

// POST { featureKey } — grant a user access to a tool.
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

  const { id: targetUserId } = await params;
  const body = await request.json().catch(() => null);
  const featureKey = typeof body?.featureKey === "string" ? body.featureKey.trim() : "";

  if (!featureKey) {
    return NextResponse.json({ error: "featureKey is required." }, { status: 400 });
  }

  const { error } = await supabase.from("feature_access").insert({
    user_id: targetUserId,
    feature_key: featureKey,
    granted_by: user.id,
  });

  // Already granted — treat as success (idempotent).
  if (error && error.code !== "23505") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// DELETE { featureKey } — revoke a user's access to a tool.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let supabase;
  try {
    ({ supabase } = await requireAdminUser());
  } catch (res) {
    return res as Response;
  }

  const { id: targetUserId } = await params;
  const body = await request.json().catch(() => null);
  const featureKey = typeof body?.featureKey === "string" ? body.featureKey.trim() : "";

  if (!featureKey) {
    return NextResponse.json({ error: "featureKey is required." }, { status: 400 });
  }

  const { error } = await supabase
    .from("feature_access")
    .delete()
    .eq("user_id", targetUserId)
    .eq("feature_key", featureKey);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
