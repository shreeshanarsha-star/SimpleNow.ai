import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/requireAdmin";

export const maxDuration = 15;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let user, supabase;
  try {
    ({ user, supabase } = await requireAdminUser());
  } catch (res) {
    return res as Response;
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const action = body?.action;

  if (!["approve", "reject", "publish"].includes(action)) {
    return NextResponse.json(
      { error: "action must be 'approve', 'reject', or 'publish'." },
      { status: 400 }
    );
  }

  const update: Record<string, unknown> = {};
  if (action === "approve") {
    update.status = "approved";
    update.approved_by = user.id;
    update.approved_at = new Date().toISOString();
    update.rejection_reason = null;
  } else if (action === "reject") {
    update.status = "rejected";
    update.rejection_reason =
      typeof body?.rejectionReason === "string" ? body.rejectionReason.trim() : null;
  } else if (action === "publish") {
    update.status = "published";
  }

  const { data, error } = await supabase
    .from("offers")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ offer: data });
}
