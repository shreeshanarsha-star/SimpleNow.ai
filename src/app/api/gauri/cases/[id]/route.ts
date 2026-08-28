import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionAccount } from "@/lib/gauriAuth";

export const dynamic = "force-dynamic";

// GET serves two audiences from one endpoint: a vet/admin session sees the
// full case (including the AI draft, conversation transcript, vet notes —
// never meant for farmer eyes), while an unauthenticated request — the
// farmer checking their status link — only ever gets status, the final
// vet-approved recommendation, and a safe summary of any delivery order
// (product name, price, delivery status — never the paramed's identity).
//
// Ported verbatim from askshree-app (v1)'s
// app/api/gauri/cases/[id]/route.js.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createAdminClient();
  const { data: caseRow } = await db.from("gauri_cases").select("*").eq("id", id).maybeSingle();
  if (!caseRow) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }

  const account = await getSessionAccount(req);
  if (account && (account.role === "vet" || account.role === "admin")) {
    const { data: order } = await db.from("gauri_orders").select("*").eq("case_id", id).maybeSingle();
    return NextResponse.json({ case: caseRow, order: order || null, full: true });
  }

  let publicOrder = null;
  if (caseRow.status === "approved") {
    const { data: order } = await db
      .from("gauri_orders")
      .select("product_name, price, status, estimated_delivery")
      .eq("case_id", id)
      .maybeSingle();
    publicOrder = order || null;
  }

  return NextResponse.json({
    case: {
      id: caseRow.id,
      status: caseRow.status,
      final_recommendation: caseRow.status === "approved" ? caseRow.final_recommendation : null,
      created_at: caseRow.created_at,
      order: publicOrder,
    },
    full: false,
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await getSessionAccount(req);
  if (!account || (account.role !== "vet" && account.role !== "admin")) {
    return NextResponse.json({ error: "Vet login required." }, { status: 401 });
  }

  const { action, finalRecommendation, vetNotes, productId, productName, price, estimatedDelivery } = await req.json();
  const db = createAdminClient();

  if (action === "approve") {
    if (!finalRecommendation || !finalRecommendation.trim()) {
      return NextResponse.json({ error: "Write or confirm a recommendation before approving." }, { status: 400 });
    }
    await db
      .from("gauri_cases")
      .update({
        status: "approved",
        final_recommendation: finalRecommendation.trim(),
        vet_notes: vetNotes || null,
        vet_id: account.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    // A product recommendation is optional — plenty of approved cases are
    // "monitor at home", no order needed. Only create one if the vet picked
    // a product name.
    if (productName && productName.trim()) {
      await db.from("gauri_orders").insert({
        case_id: id,
        product_id: productId || null,
        product_name: productName.trim(),
        price: price || null,
        estimated_delivery: estimatedDelivery || null,
        status: "pending_dispatch",
      });
    }

    return NextResponse.json({ ok: true });
  }

  if (action === "reject") {
    await db
      .from("gauri_cases")
      .update({
        status: "rejected",
        vet_notes: vetNotes || null,
        vet_id: account.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
