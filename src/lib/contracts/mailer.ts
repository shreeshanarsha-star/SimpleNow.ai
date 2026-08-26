// Contracts & eSign email copy. Uses the existing Resend wrapper
// (lib/email.ts) -- degrades to a logged no-op if RESEND_API_KEY isn't
// set, same as every other tool on the site. No new email provider.
import { sendEmail } from "@/lib/email";

function shell(bodyHtml: string): string {
  return `<div style="font-family:Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a;">
    <div style="font-weight:700;font-size:15px;margin-bottom:18px;">Askshree</div>
    ${bodyHtml}
    <p style="font-size:11px;color:#8a8a8a;margin-top:28px;">This link is unique to you -- please don't forward it.</p>
  </div>`;
}

export async function sendSigningRequestEmail(params: {
  to: string;
  recipientName: string;
  senderName: string;
  documentName: string;
  signUrl: string;
}) {
  const html = shell(`
    <p style="font-size:14px;">Hi ${escapeHtml(params.recipientName)},</p>
    <p style="font-size:14px;">${escapeHtml(params.senderName)} has sent you a document to review and sign.</p>
    <p style="font-size:14px;font-weight:600;">${escapeHtml(params.documentName)}</p>
    <p style="margin:24px 0;">
      <a href="${params.signUrl}" style="background:#2a78d6;color:#fff;text-decoration:none;font-weight:700;font-size:13px;padding:11px 20px;border-radius:6px;display:inline-block;">Review &amp; Sign</a>
    </p>
  `);
  return sendEmail({ to: params.to, subject: `Signature required: ${params.documentName}`, html });
}

export async function sendCopyRecipientEmail(params: {
  to: string;
  recipientName: string;
  senderName: string;
  documentName: string;
  viewUrl: string;
}) {
  const html = shell(`
    <p style="font-size:14px;">Hi ${escapeHtml(params.recipientName)},</p>
    <p style="font-size:14px;">All signatures are complete on a document from ${escapeHtml(params.senderName)}.</p>
    <p style="font-size:14px;font-weight:600;">${escapeHtml(params.documentName)}</p>
    <p style="margin:24px 0;">
      <a href="${params.viewUrl}" style="background:#2a78d6;color:#fff;text-decoration:none;font-weight:700;font-size:13px;padding:11px 20px;border-radius:6px;display:inline-block;">View &amp; Download</a>
    </p>
  `);
  return sendEmail({ to: params.to, subject: `Completed: ${params.documentName}`, html });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
