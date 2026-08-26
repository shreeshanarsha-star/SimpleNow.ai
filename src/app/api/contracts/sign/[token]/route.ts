import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { advanceAfterSignature } from "@/lib/contracts/pipeline";

// Public signer/copy-recipient endpoint -- no login. Everything here is
// gated purely by knowledge of the unguessable per-recipient token,
// validated via the SECURITY DEFINER RPCs (no RLS policy grants anon
// direct table access, same shape as Assessment.ai's token flow).
export const maxDuration = 60;

const BUCKET = "contracts";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_contract_recipient_by_token", { p_token: token });
  const recipient = Array.isArray(data) ? data[0] : data;
  if (error || !recipient) {
    return NextResponse.json({ error: "This link isn't valid." }, { status: 404 });
  }

  const admin = createAdminClient();

  if (recipient.recipient_role === "cc") {
    if (recipient.envelope_status !== "completed") {
      return NextResponse.json({ role: "cc", ready: false, envelopeName: recipient.envelope_name });
    }
    const { data: envelope } = await admin.from("contracts_envelopes").select("final_file_path").eq("id", recipient.envelope_id).maybeSingle();
    if (!envelope?.final_file_path) {
      return NextResponse.json({ role: "cc", ready: false, envelopeName: recipient.envelope_name });
    }
    const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(envelope.final_file_path, 900);
    return NextResponse.json({
      role: "cc",
      ready: true,
      envelopeName: recipient.envelope_name,
      senderName: recipient.owner_name,
      documentUrl: signed?.signedUrl || null,
    });
  }

  // Signer.
  if (recipient.recipient_status === "signed") {
    return NextResponse.json({ role: "signer", alreadySigned: true, envelopeName: recipient.envelope_name });
  }
  if (recipient.envelope_status === "declined" || recipient.envelope_status === "expired") {
    return NextResponse.json({ role: "signer", unavailable: true, reason: recipient.envelope_status, envelopeName: recipient.envelope_name });
  }
  if (recipient.expires_at && new Date(recipient.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ role: "signer", unavailable: true, reason: "expired", envelopeName: recipient.envelope_name });
  }
  if (recipient.recipient_status === "pending") {
    // Not their turn yet -- the owner hasn't triggered send, or an
    // earlier signer in the sequence hasn't completed.
    return NextResponse.json({ role: "signer", unavailable: true, reason: "not_ready", envelopeName: recipient.envelope_name });
  }

  if (recipient.recipient_status === "sent") {
    await supabase.rpc("mark_contract_recipient_opened", { p_token: token });
  }

  const { data: envelope } = await admin
    .from("contracts_envelopes")
    .select("working_file_path, page_count, name")
    .eq("id", recipient.envelope_id)
    .maybeSingle();
  if (!envelope?.working_file_path) {
    return NextResponse.json({ error: "The document isn't ready yet. Try again shortly." }, { status: 409 });
  }

  const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(envelope.working_file_path, 900);

  const { data: fields } = await admin
    .from("contracts_fields")
    .select("id, field_type, page, position, status")
    .eq("recipient_id", recipient.recipient_id)
    .order("page", { ascending: true });

  return NextResponse.json({
    role: "signer",
    envelopeName: envelope.name,
    senderName: recipient.owner_name,
    recipientName: recipient.recipient_name,
    documentUrl: signed?.signedUrl || null,
    pageCount: envelope.page_count,
    fields: fields || [],
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: recipient } = await admin
    .from("contracts_recipients")
    .select("*")
    .eq("token", token)
    .eq("role", "signer")
    .maybeSingle();

  if (!recipient) {
    return NextResponse.json({ error: "This link isn't valid." }, { status: 404 });
  }
  if (!["sent", "opened"].includes(recipient.status)) {
    return NextResponse.json({ error: "This document has already been signed, or this link is no longer active." }, { status: 409 });
  }
  if (recipient.expires_at && new Date(recipient.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "This link has expired. Ask the sender to resend it." }, { status: 410 });
  }

  const body = await request.json().catch(() => null);
  const signatureType = body?.signatureType;
  const signatureValue = typeof body?.signatureValue === "string" ? body.signatureValue.trim() : "";
  const fieldValuesIn = body?.fieldValues && typeof body.fieldValues === "object" ? body.fieldValues : {};

  if (!["typed", "drawn", "uploaded"].includes(signatureType) || !signatureValue) {
    return NextResponse.json({ error: "A signature is required." }, { status: 400 });
  }

  const { data: fields } = await admin
    .from("contracts_fields")
    .select("id, field_type")
    .eq("recipient_id", recipient.id);

  const otherFields = (fields || []).filter((f) => f.field_type !== "signature");
  const missing = otherFields.filter((f) => !String(fieldValuesIn[f.id] || "").trim());
  if (missing.length > 0) {
    return NextResponse.json({ error: `Fill in every required field before submitting (${missing.map((f) => f.field_type).join(", ")}).` }, { status: 400 });
  }

  let signatureData = signatureValue;
  if (signatureType !== "typed") {
    const match = signatureValue.match(/^data:image\/(png|jpeg);base64,(.+)$/);
    if (!match) {
      return NextResponse.json({ error: "Signature image was malformed." }, { status: 400 });
    }
    const imgBytes = Buffer.from(match[2], "base64");
    if (imgBytes.length > 3 * 1024 * 1024) {
      return NextResponse.json({ error: "Signature image is too large." }, { status: 400 });
    }
    const path = `${recipient.envelope_id}/signatures/${recipient.id}.png`;
    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, imgBytes, { contentType: "image/png", upsert: true });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    signatureData = path;
  } else if (signatureData.length > 120) {
    signatureData = signatureData.slice(0, 120);
  }

  const fieldValues: Record<string, string> = {};
  for (const f of otherFields) {
    fieldValues[f.id] = String(fieldValuesIn[f.id] || "").trim().slice(0, 200);
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : null;
  const ua = request.headers.get("user-agent");

  const { data: result, error: rpcError } = await admin.rpc("submit_contract_signature", {
    p_token: token,
    p_signature_type: signatureType,
    p_signature_data: signatureData,
    p_field_values: fieldValues,
    p_ip: ip,
    p_ua: ua,
  });
  const row = Array.isArray(result) ? result[0] : result;

  if (rpcError || !row?.ok) {
    return NextResponse.json({ error: "This document has already been signed, or this link is no longer active." }, { status: 409 });
  }

  try {
    await advanceAfterSignature({
      envelopeId: row.envelope_id,
      isFinal: row.is_final,
      nextRecipientId: row.next_recipient_id,
      nextRecipientToken: row.next_recipient_token,
    });
  } catch (err) {
    // The signature itself is already recorded and committed -- a failure
    // here (e.g. the next email didn't send) shouldn't read back to the
    // signer as "your signature failed". Log for the owner to see instead.
    await admin.from("contracts_events").insert({
      envelope_id: row.envelope_id,
      event_type: "advance_error",
      metadata: { message: err instanceof Error ? err.message : String(err) },
    });
  }

  return NextResponse.json({ ok: true, isFinal: row.is_final });
}
