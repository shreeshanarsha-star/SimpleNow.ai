import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from "@/lib/contracts/types";

// Contracts & eSign -- Personal Tool, not feature-gated (requireUser only,
// same as personal_todos/personal_notes). Owner-scoped everywhere.

export async function GET() {
  let supabase, user;
  try {
    ({ supabase, user } = await requireUser());
  } catch (res) {
    return res as Response;
  }

  const { data: envelopes, error } = await supabase
    .from("contracts_envelopes")
    .select("id, name, status, original_file_name, created_at, updated_at, completed_at, ai_confidence")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (envelopes || []).map((e) => e.id);
  let recipientCounts: Record<string, { total: number; signed: number }> = {};
  if (ids.length > 0) {
    const { data: recipients } = await supabase
      .from("contracts_recipients")
      .select("envelope_id, role, status")
      .in("envelope_id", ids);
    recipientCounts = (recipients || []).reduce((acc, r) => {
      if (r.role !== "signer") return acc;
      acc[r.envelope_id] = acc[r.envelope_id] || { total: 0, signed: 0 };
      acc[r.envelope_id].total += 1;
      if (r.status === "signed") acc[r.envelope_id].signed += 1;
      return acc;
    }, {} as Record<string, { total: number; signed: number }>);
  }

  const now = Date.now();
  const result = (envelopes || []).map((e) => ({
    ...e,
    // Computed, not stored -- a waiting/in-progress envelope whose link(s)
    // have aged out reads as "Expired" without a background job.
    effectiveStatus:
      (e.status === "waiting_for_signature" || e.status === "in_progress") && isStale(e.updated_at, now)
        ? "expired"
        : e.status,
    signerProgress: recipientCounts[e.id] || { total: 0, signed: 0 },
    lastActivity: e.updated_at,
  }));

  return NextResponse.json({ envelopes: result });
}

function isStale(updatedAt: string, now: number): boolean {
  const ttlMs = 30 * 24 * 60 * 60 * 1000;
  return now - new Date(updatedAt).getTime() > ttlMs;
}

export async function POST(request: Request) {
  let user;
  try {
    ({ user } = await requireUser());
  } catch (res) {
    return res as Response;
  }

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form submission." }, { status: 400 });

  const file = form.get("file");
  const name = String(form.get("name") || "").trim();
  const recipientsRaw = String(form.get("recipients") || "[]");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Attach a document to send." }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "Give the document a name." }, { status: 400 });
  }
  const ext = ALLOWED_UPLOAD_TYPES[file.type];
  if (!ext) {
    return NextResponse.json({ error: "Please upload a PDF, DOCX, or DOC file." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "That file is too large (max 25MB)." }, { status: 400 });
  }

  let recipients: Array<{ name: string; email: string; role: string }> = [];
  try {
    recipients = JSON.parse(recipientsRaw);
  } catch {
    return NextResponse.json({ error: "Recipients were malformed." }, { status: 400 });
  }
  if (!Array.isArray(recipients) || recipients.length === 0) {
    return NextResponse.json({ error: "Add at least one recipient." }, { status: 400 });
  }
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for (const r of recipients) {
    if (!r.name?.trim() || !r.email?.trim() || !emailRe.test(r.email.trim())) {
      return NextResponse.json({ error: "Every recipient needs a name and a valid email." }, { status: 400 });
    }
    if (r.role !== "signer" && r.role !== "cc") {
      return NextResponse.json({ error: "Each recipient's role must be Signs or Receives a copy." }, { status: 400 });
    }
  }
  const signerCount = recipients.filter((r) => r.role === "signer").length;
  if (signerCount === 0) {
    return NextResponse.json({ error: "At least one recipient must be marked \"Signs\"." }, { status: 400 });
  }

  const admin = createAdminClient();
  const envelopeId = randomUUID();
  const originalPath = `${envelopeId}/original.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: uploadError } = await admin.storage.from("contracts").upload(originalPath, bytes, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) {
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
  }

  const { error: insertError } = await admin.from("contracts_envelopes").insert({
    id: envelopeId,
    owner_id: user.id,
    name,
    original_file_path: originalPath,
    original_file_name: file.name,
    original_mime_type: file.type,
    status: "draft",
  });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  let signerOrder = 0;
  const recipientRows = recipients.map((r) => {
    const role = r.role as "signer" | "cc";
    if (role === "signer") signerOrder += 1;
    return {
      envelope_id: envelopeId,
      name: r.name.trim(),
      email: r.email.trim().toLowerCase(),
      role,
      signing_order: role === "signer" ? signerOrder : null,
    };
  });
  const { error: recError } = await admin.from("contracts_recipients").insert(recipientRows);
  if (recError) {
    return NextResponse.json({ error: recError.message }, { status: 500 });
  }

  await admin.from("contracts_events").insert({ envelope_id: envelopeId, event_type: "created" });

  return NextResponse.json({ envelopeId }, { status: 201 });
}
