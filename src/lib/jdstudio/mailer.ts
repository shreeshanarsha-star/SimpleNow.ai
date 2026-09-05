import { sendEmail } from "@/lib/email";

const FROM_ADDRESS = process.env.JDSTUDIO_EMAIL_FROM || "JD Studio.ai <noreply@simplenow.ai>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://simplenow.ai";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function shell(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;background:#f5f3ee;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:32px 24px;">
  <div style="font-size:13px;letter-spacing:.06em;color:#b08d57;text-transform:uppercase;margin-bottom:16px;">JD Studio.ai</div>
  <div style="background:#fff;border:1px solid #e7e2d6;border-radius:12px;padding:28px;">
    <h1 style="font-size:19px;margin:0 0 12px;color:#1f2430;">${escapeHtml(title)}</h1>
    ${bodyHtml}
  </div>
  <div style="font-size:12px;color:#9a9484;margin-top:16px;">Sent by SimpleNow.ai · JD Studio.ai</div>
</div>
</body></html>`;
}

export async function sendIntakeInviteEmail(params: {
  to: string;
  recipientName: string | null;
  jobTitle: string | null;
  department: string;
  token: string;
}) {
  const link = `${APP_URL}/jd-studio/intake/${params.token}`;
  const greeting = params.recipientName ? `Hi ${escapeHtml(params.recipientName)},` : "Hi,";
  const roleLine = params.jobTitle ? ` for <strong>${escapeHtml(params.jobTitle)}</strong>` : "";
  const html = shell(
    "A few details for a job description",
    `<p style="color:#3a3d45;line-height:1.6;">${greeting}</p>
     <p style="color:#3a3d45;line-height:1.6;">We're putting together a job description${roleLine} in <strong>${escapeHtml(
      params.department
    )}</strong>, and we'd like your input. It takes about 5 minutes.</p>
     <p style="margin:24px 0;"><a href="${link}" style="background:#b08d57;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Answer the questions</a></p>
     <p style="color:#9a9484;font-size:13px;">This link is unique to you and expires in 30 days.</p>`
  );
  return sendEmail({ to: params.to, subject: `Quick input needed: ${params.jobTitle || "new role"}`, html, from: FROM_ADDRESS, tool: "JD Studio.ai" });
}

export async function sendReminderEmail(params: {
  to: string;
  recipientName: string | null;
  jobTitle: string | null;
  token: string;
}) {
  const link = `${APP_URL}/jd-studio/intake/${params.token}`;
  const greeting = params.recipientName ? `Hi ${escapeHtml(params.recipientName)},` : "Hi,";
  const html = shell(
    "Friendly reminder",
    `<p style="color:#3a3d45;line-height:1.6;">${greeting}</p>
     <p style="color:#3a3d45;line-height:1.6;">Just a nudge on the job description details we asked for${
       params.jobTitle ? ` (<strong>${escapeHtml(params.jobTitle)}</strong>)` : ""
     } — it's still waiting on your input.</p>
     <p style="margin:24px 0;"><a href="${link}" style="background:#b08d57;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Answer the questions</a></p>`
  );
  return sendEmail({ to: params.to, subject: `Reminder: ${params.jobTitle || "job description"} details`, html, from: FROM_ADDRESS, tool: "JD Studio.ai" });
}

export async function sendEscalationEmail(params: {
  to: string;
  recipientEmail: string;
  jobTitle: string | null;
  department: string;
}) {
  const html = shell(
    "A JD request has gone stale",
    `<p style="color:#3a3d45;line-height:1.6;">The intake sent to <strong>${escapeHtml(
      params.recipientEmail
    )}</strong> for <strong>${escapeHtml(params.jobTitle || "a role")}</strong> in ${escapeHtml(
      params.department
    )} still hasn't been answered after several reminders.</p>
     <p style="color:#3a3d45;line-height:1.6;">You may want to follow up directly or reassign it from your JD Studio.ai dashboard.</p>`
  );
  return sendEmail({ to: params.to, subject: `Stalled: ${params.jobTitle || "JD"} intake`, html, from: FROM_ADDRESS, tool: "JD Studio.ai" });
}

export async function sendApprovalRequestEmail(params: {
  to: string;
  jobTitle: string | null;
  department: string;
  requestId: string;
}) {
  const link = `${APP_URL}/tools/jd-studio-ai?request=${params.requestId}`;
  const html = shell(
    "A job description is ready for your approval",
    `<p style="color:#3a3d45;line-height:1.6;"><strong>${escapeHtml(params.jobTitle || "A role")}</strong> (${escapeHtml(
      params.department
    )}) has been drafted and is waiting on your approval.</p>
     <p style="margin:24px 0;"><a href="${link}" style="background:#b08d57;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Review & approve</a></p>`
  );
  return sendEmail({ to: params.to, subject: `Approval needed: ${params.jobTitle || "job description"}`, html, from: FROM_ADDRESS, tool: "JD Studio.ai" });
}
