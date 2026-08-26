import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";

// Owner-only envelope detail -- RLS (owner_id = auth.uid()) does the
// actual access control; this just 404s cleanly when RLS returns nothing.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let supabase;
  try {
    ({ supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }

  const { data: envelope, error } = await supabase.from("contracts_envelopes").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!envelope) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  const { data: recipients } = await supabase
    .from("contracts_recipients")
    .select("id, name, email, role, signing_order, status, sent_at, opened_at, signed_at")
    .eq("envelope_id", id)
    .order("role", { ascending: true })
    .order("signing_order", { ascending: true, nullsFirst: false });

  const { data: fields } = await supabase
    .from("contracts_fields")
    .select("id, field_type, page, confidence, status")
    .eq("envelope_id", id);

  const needsReviewCount = (fields || []).filter((f) => f.confidence === "low").length;

  return NextResponse.json({
    envelope,
    recipients: recipients || [],
    needsReviewCount,
  });
}
