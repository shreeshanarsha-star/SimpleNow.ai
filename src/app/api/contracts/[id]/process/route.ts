import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { processEnvelope } from "@/lib/contracts/pipeline";

// AI preparation: reads the document, detects signing fields, builds the
// working PDF, and sends the first signer their link. Multi-step AI +
// PDF work, so it gets an explicit maxDuration rather than the platform
// default, per the site's non-negotiable bar for AI routes.
export const maxDuration = 60;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let supabase;
  try {
    ({ supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }

  // RLS-scoped read confirms ownership before any admin-client work runs.
  const { data: envelope, error } = await supabase.from("contracts_envelopes").select("id, status").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!envelope) return NextResponse.json({ error: "Document not found." }, { status: 404 });
  if (envelope.status !== "draft") {
    return NextResponse.json({ error: "This document has already been prepared." }, { status: 409 });
  }

  const admin = createAdminClient();
  await admin.from("contracts_envelopes").update({ status: "processing" }).eq("id", id);

  try {
    await processEnvelope(id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong while preparing the document.";
    await admin.from("contracts_envelopes").update({ status: "failed", error_message: message }).eq("id", id);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
