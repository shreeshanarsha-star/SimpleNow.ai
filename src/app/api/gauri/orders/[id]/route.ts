import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionAccount } from "@/lib/gauriAuth";

export const dynamic = "force-dynamic";

// Ported verbatim from askshree-app (v1)'s
// app/api/gauri/orders/[id]/route.js.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await getSessionAccount(req);
  if (!account || (account.role !== "paramed" && account.role !== "admin")) {
    return NextResponse.json({ error: "Paramed login required." }, { status: 401 });
  }

  const { action, paymentNote } = await req.json();
  const db = createAdminClient();

  if (action === "claim") {
    await db
      .from("gauri_orders")
      .update({ paramed_id: account.id, updated_at: new Date().toISOString() })
      .eq("id", id)
      .is("paramed_id", null);
    return NextResponse.json({ ok: true });
  }

  if (action === "mark_dispatched") {
    await db
      .from("gauri_orders")
      .update({ status: "out_for_delivery", updated_at: new Date().toISOString() })
      .eq("id", id);
    return NextResponse.json({ ok: true });
  }

  if (action === "mark_delivered") {
    await db
      .from("gauri_orders")
      .update({ status: "delivered", payment_note: paymentNote || null, updated_at: new Date().toISOString() })
      .eq("id", id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
