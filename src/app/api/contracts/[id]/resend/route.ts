import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendCopyRecipientEmail, sendSigningRequestEmail } from "@/lib/contracts/mailer";
import { getAppBaseUrl } from "@/lib/url";
import { SIGN_LINK_TTL_DAYS } from "@/lib/contracts/types";

// Owner action from the completed-document list: "Share / Send Copy".
// Either re-sends an existing recipient's link, or adds a brand-new copy
// recipient and mails them immediately -- only ever for a completed
// document (a copy of an in-progress document doesn't exist yet).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let supabase, user;
  try {
    ({ supabase, user } = await requireUser());
  } catch (res) {
    return res as Response;
  }

  const { data: envelope, error } = await supabase.from("contracts_envelopes").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!envelope) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const admin = createAdminClient();

  const { data: ownerProfile } = await admin.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle();
  const senderName = ownerProfile?.full_name || ownerProfile?.email || "SimpleNow";

  if (body.recipientId) {
    const { data: recipient } = await supabase.from("contracts_recipients").select("*").eq("id", body.recipientId).eq("envelope_id", id).maybeSingle();
    if (!recipient) return NextResponse.json({ error: "Recipient not found." }, { status: 404 });

    if (envelope.status === "completed") {
      const viewUrl = `${getAppBaseUrl()}/sign/${recipient.token}`;
      const result = await sendCopyRecipientEmail({ to: recipient.email, recipientName: recipient.name, senderName, documentName: envelope.name, viewUrl });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
      return NextResponse.json({ ok: true });
    }

    if (recipient.role === "signer" && recipient.status !== "signed") {
      const signUrl = `${getAppBaseUrl()}/sign/${recipient.token}`;
      const result = await sendSigningRequestEmail({ to: recipient.email, recipientName: recipient.name, senderName, documentName: envelope.name, signUrl });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
      await admin
        .from("contracts_recipients")
        .update({ expires_at: new Date(Date.now() + SIGN_LINK_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString() })
        .eq("id", recipient.id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Nothing to resend for this recipient." }, { status: 400 });
  }

  if (body.email && body.name) {
    if (envelope.status !== "completed") {
      return NextResponse.json({ error: "The document isn't completed yet." }, { status: 400 });
    }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(String(body.email).trim())) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    const { data: newRecipient, error: insErr } = await admin
      .from("contracts_recipients")
      .insert({ envelope_id: id, name: String(body.name).trim(), email: String(body.email).trim().toLowerCase(), role: "cc", status: "pending" })
      .select()
      .single();
    if (insErr || !newRecipient) return NextResponse.json({ error: insErr?.message || "Could not add recipient." }, { status: 500 });

    const viewUrl = `${getAppBaseUrl()}/sign/${newRecipient.token}`;
    const result = await sendCopyRecipientEmail({ to: newRecipient.email, recipientName: newRecipient.name, senderName, documentName: envelope.name, viewUrl });
    if (result.ok) {
      await admin.from("contracts_recipients").update({ status: "copy_sent" }).eq("id", newRecipient.id);
    }
    await admin.from("contracts_events").insert({ envelope_id: id, recipient_id: newRecipient.id, event_type: "copy_sent" });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Provide a recipientId, or a name and email to add someone new." }, { status: 400 });
}
