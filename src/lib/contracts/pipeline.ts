// Orchestrates the two heavy steps of Contracts & eSign: (1) AI
// preparation right after "Next" is clicked, and (2) advancing the
// signing sequence after each signature (next signer, or final
// composition + copy-recipient delivery). Kept out of the route files so
// both the /process route and the /sign/[token] submit route can share
// it without duplicating logic.
import { createAdminClient } from "@/lib/supabase/admin";
import { extractDocumentText } from "./textExtract";
import { loadOrBuildWorkingPdf } from "./workingPdf";
import { detectSigningFields, type SignerInput } from "./fieldDetection";
import { composeFinalPdf, type ComposableField } from "./composeFinalPdf";
import { sendSigningRequestEmail, sendCopyRecipientEmail } from "./mailer";
import { getAppBaseUrl } from "@/lib/url";
import { SIGN_LINK_TTL_DAYS } from "./types";

const BUCKET = "contracts";

async function getSenderName(ownerId: string): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("full_name, email").eq("id", ownerId).maybeSingle();
  return data?.full_name || data?.email || "SimpleNow";
}

async function logEvent(envelopeId: string, eventType: string, recipientId?: string | null, metadata?: Record<string, unknown>) {
  const admin = createAdminClient();
  await admin.from("contracts_events").insert({
    envelope_id: envelopeId,
    recipient_id: recipientId ?? null,
    event_type: eventType,
    metadata: metadata ?? {},
  });
}

async function sendToSigner(envelopeId: string, documentName: string, senderName: string, recipient: { id: string; token: string; email: string; name: string }) {
  const admin = createAdminClient();
  const signUrl = `${getAppBaseUrl()}/sign/${recipient.token}`;
  const expiresAt = new Date(Date.now() + SIGN_LINK_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const result = await sendSigningRequestEmail({
    to: recipient.email,
    recipientName: recipient.name,
    senderName,
    documentName,
    signUrl,
  });

  // Only mark "sent" (and unlock the sign link) if the email actually went
  // out. Previously this ran unconditionally, so a Resend failure (e.g.
  // RESEND_API_KEY missing/misconfigured) would still flip the recipient
  // to "Sent" in the UI while nothing was delivered -- a silent lie.
  if (!result.ok) {
    await logEvent(envelopeId, "send_failed", recipient.id, { error: result.error ?? "Unknown email error" });
    throw new Error(`Couldn't email the signing link to ${recipient.email}: ${result.error ?? "unknown error"}`);
  }

  await admin
    .from("contracts_recipients")
    .update({ status: "sent", sent_at: new Date().toISOString(), expires_at: expiresAt })
    .eq("id", recipient.id);

  await logEvent(envelopeId, "sent", recipient.id);
}

export async function processEnvelope(envelopeId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: envelope, error: envErr } = await admin
    .from("contracts_envelopes")
    .select("*")
    .eq("id", envelopeId)
    .single();
  if (envErr || !envelope) throw new Error("Document not found.");

  const { data: recipients, error: recErr } = await admin
    .from("contracts_recipients")
    .select("*")
    .eq("envelope_id", envelopeId)
    .order("signing_order", { ascending: true, nullsFirst: false });
  if (recErr) throw new Error(recErr.message);

  const signers = (recipients || []).filter((r) => r.role === "signer");
  if (signers.length === 0) throw new Error("At least one recipient must be marked \"Signs\".");

  const { data: fileBlob, error: dlErr } = await admin.storage.from(BUCKET).download(envelope.original_file_path);
  if (dlErr || !fileBlob) throw new Error("Could not read the uploaded document.");
  const originalBytes = Buffer.from(await fileBlob.arrayBuffer());

  const extracted = await extractDocumentText(originalBytes, envelope.original_file_name, envelope.original_mime_type);

  const { pdfDoc, generatedFromText, paragraphMap } = await loadOrBuildWorkingPdf({
    originalBytes,
    sourceKind: extracted.sourceKind,
    fullText: extracted.fullText,
    documentName: envelope.name,
  });

  const signerInputs: SignerInput[] = signers.map((s) => ({
    recipientId: s.id,
    name: s.name,
    signingOrder: s.signing_order,
  }));

  const detection = await detectSigningFields({
    pdfDoc,
    pages: extracted.pages,
    fullText: extracted.fullText,
    generatedFromText,
    paragraphMap,
    signers: signerInputs,
  });

  const workingBytes = Buffer.from(await pdfDoc.save());
  const workingPath = `${envelopeId}/working.pdf`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(workingPath, workingBytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (upErr) throw new Error(upErr.message);

  if (detection.fields.length > 0) {
    const { error: fieldErr } = await admin.from("contracts_fields").insert(
      detection.fields.map((f) => ({
        envelope_id: envelopeId,
        recipient_id: f.recipient_id,
        field_type: f.field_type,
        page: f.page,
        position: f.position,
        confidence: f.confidence,
        status: f.confidence === "low" ? "needs_review" : "pending",
      }))
    );
    if (fieldErr) throw new Error(fieldErr.message);
  }

  await admin
    .from("contracts_envelopes")
    .update({
      working_file_path: workingPath,
      page_count: pdfDoc.getPageCount(),
      status: "waiting_for_signature",
      ai_confidence: detection.overallConfidence,
      error_message: null,
    })
    .eq("id", envelopeId);

  await logEvent(envelopeId, "ai_processed", null, {
    appendedSignaturePage: detection.appendedSignaturePage,
    fieldCount: detection.fields.length,
  });

  const senderName = await getSenderName(envelope.owner_id);
  const firstSigner = signers.find((s) => s.signing_order === 1) || signers[0];
  await sendToSigner(envelopeId, envelope.name, senderName, firstSigner);
}

export async function advanceAfterSignature(params: {
  envelopeId: string;
  isFinal: boolean;
  nextRecipientId: string | null;
  nextRecipientToken: string | null;
}): Promise<void> {
  const admin = createAdminClient();

  const { data: envelope } = await admin
    .from("contracts_envelopes")
    .select("*")
    .eq("id", params.envelopeId)
    .single();
  if (!envelope) return;

  const senderName = await getSenderName(envelope.owner_id);

  if (!params.isFinal) {
    if (!params.nextRecipientId) return;
    const { data: next } = await admin
      .from("contracts_recipients")
      .select("*")
      .eq("id", params.nextRecipientId)
      .single();
    if (next) await sendToSigner(params.envelopeId, envelope.name, senderName, next);
    return;
  }

  // Final signer just completed -- compose the final signed PDF and mail
  // every "Receives a copy" recipient.
  const { data: fieldsRaw } = await admin
    .from("contracts_fields")
    .select("page, position, field_type, value, contracts_recipients(signature_type)")
    .eq("envelope_id", params.envelopeId);

  const fields: ComposableField[] = (fieldsRaw || []).map((f) => {
    const rec = Array.isArray(f.contracts_recipients) ? f.contracts_recipients[0] : f.contracts_recipients;
    return {
      page: f.page,
      position: f.position,
      field_type: f.field_type,
      value: f.value,
      signature_type: rec?.signature_type ?? null,
    };
  });

  const workingPath = envelope.working_file_path;
  if (!workingPath) return;
  const { data: workingBlob, error: dlErr } = await admin.storage.from(BUCKET).download(workingPath);
  if (dlErr || !workingBlob) {
    await admin.from("contracts_envelopes").update({ error_message: "Could not read the working document to compose the final PDF." }).eq("id", params.envelopeId);
    return;
  }

  const finalBytes = await composeFinalPdf({
    workingBytes: Buffer.from(await workingBlob.arrayBuffer()),
    fields,
    loadSignatureImage: async (storagePath) => {
      const { data, error } = await admin.storage.from(BUCKET).download(storagePath);
      if (error || !data) return null;
      return Buffer.from(await data.arrayBuffer());
    },
  });

  const finalPath = `${params.envelopeId}/final.pdf`;
  await admin.storage.from(BUCKET).upload(finalPath, finalBytes, { contentType: "application/pdf", upsert: true });

  await admin
    .from("contracts_envelopes")
    .update({ final_file_path: finalPath, status: "completed", completed_at: new Date().toISOString() })
    .eq("id", params.envelopeId);

  await logEvent(params.envelopeId, "completed");

  const { data: ccRecipients } = await admin
    .from("contracts_recipients")
    .select("*")
    .eq("envelope_id", params.envelopeId)
    .eq("role", "cc");

  for (const cc of ccRecipients || []) {
    const viewUrl = `${getAppBaseUrl()}/sign/${cc.token}`;
    const result = await sendCopyRecipientEmail({ to: cc.email, recipientName: cc.name, senderName, documentName: envelope.name, viewUrl });
    if (result.ok) {
      await admin.from("contracts_recipients").update({ status: "copy_sent" }).eq("id", cc.id);
      await logEvent(params.envelopeId, "copy_sent", cc.id);
    } else {
      // Document is already completed by this point -- don't let a failed
      // copy email block completion. Leave status as-is and log the real
      // error so the owner can see it (and use Resend) instead of the UI
      // silently claiming the copy was sent.
      await logEvent(params.envelopeId, "copy_send_failed", cc.id, { error: result.error ?? "Unknown email error" });
    }
  }
}
