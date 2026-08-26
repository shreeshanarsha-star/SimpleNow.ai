import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

// Owner download/view -- never exposes the storage path directly, only a
// short-lived signed URL, same pattern as the resumes bucket elsewhere.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let supabase;
  try {
    ({ supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }

  const { data: envelope, error } = await supabase
    .from("contracts_envelopes")
    .select("original_file_path, final_file_path")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!envelope) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  const variant = new URL(request.url).searchParams.get("variant") === "original" ? "original" : "final";
  const path = variant === "original" ? envelope.original_file_path : envelope.final_file_path;
  if (!path) {
    return NextResponse.json({ error: variant === "final" ? "This document isn't completed yet." : "Original file not found." }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: signed, error: signError } = await admin.storage.from("contracts").createSignedUrl(path, 300);
  if (signError || !signed) {
    return NextResponse.json({ error: signError?.message || "Could not create a download link." }, { status: 500 });
  }

  return NextResponse.json({ url: signed.signedUrl });
}
