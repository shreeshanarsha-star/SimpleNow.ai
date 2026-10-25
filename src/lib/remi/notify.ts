// Dr.Remi notifications: email (Resend via lib/email) + optional signed
// webhook for CRM sync (Salesforce/HubSpot/Zoho via Zapier, Make, n8n or a
// native endpoint). Never throws -- a notification failure must not break
// the customer conversation.
import { sendEmail } from "@/lib/email";
import { getAppBaseUrl } from "@/lib/url";
import { safeFetch, signWebhook } from "./security";

export interface WorkspaceLite {
  id: string;
  name: string;
  slug: string;
  assistant_name: string;
  notify_emails: string[] | null;
  webhook_url: string | null;
  webhook_secret: string | null;
}

export type LeadRow = Record<string, unknown> & { id: string };

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

function row(label: string, value: unknown) {
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return "";
  const v = Array.isArray(value) ? value.join(", ") : String(value);
  return `<tr><td style="padding:6px 10px;color:#8c8776;font-size:12px;white-space:nowrap;vertical-align:top">${esc(label)}</td><td style="padding:6px 10px;color:#211f1a;font-size:13px">${esc(v)}</td></tr>`;
}

function shell(title: string, intro: string, body: string, ws: WorkspaceLite, leadId?: string) {
  const link = `${getAppBaseUrl()}/tools/dr-remi?ws=${ws.id}${leadId ? `&lead=${leadId}` : ""}`;
  return `<div style="font-family:Inter,Segoe UI,Arial,sans-serif;background:#f7f4ec;padding:24px">
  <div style="max-width:620px;margin:0 auto;background:#fffdf9;border:1px solid #e9e3d3;border-radius:16px;overflow:hidden">
    <div style="padding:18px 22px;background:linear-gradient(135deg,#f6efdb,#fffdf9);border-bottom:1px solid #e9e3d3">
      <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#8a6a10;font-weight:700">${esc(ws.assistant_name)} · ${esc(ws.name)}</div>
      <div style="font-size:18px;font-weight:700;color:#211f1a;margin-top:4px">${esc(title)}</div>
      <div style="font-size:13px;color:#5c584c;margin-top:4px">${esc(intro)}</div>
    </div>
    <div style="padding:14px 12px">${body}</div>
    <div style="padding:14px 22px 22px"><a href="${link}" style="display:inline-block;background:#d97a2e;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-weight:600;font-size:13px">Open in Dr.Remi</a></div>
  </div>
  <div style="text-align:center;color:#8c8776;font-size:11px;margin-top:10px">Sent by SimpleNow.ai · Dr.Remi 24/7 Sales Assistant</div>
</div>`;
}

export function leadTable(l: LeadRow) {
  const intent = (l.intent_signals || {}) as Record<string, unknown>;
  return `<table style="width:100%;border-collapse:collapse">
${row("Score", `${l.score}/100 · ${String(l.tier || "").toUpperCase()}`)}
${row("Name", l.name)}${row("Company", l.company)}${row("Designation", l.designation)}
${row("Email", l.email)}${row("Phone", l.phone)}${row("Location", [l.location, l.country].filter(Boolean).join(", "))}
${row("Customer type", l.customer_type)}${row("Language", l.preferred_language)}
${row("Product interest", l.product_interests)}${row("Requirement", l.requirements)}
${row("Challenges", l.challenges)}${row("Current solution", l.current_solution)}
${row("Budget", l.budget)}${row("Timeline", l.timeline)}${row("Decision role", l.purchase_authority)}
${row("Buying signals", (intent.buying_signals as string[]) || [])}
${row("Objections", l.objections)}
${row("Call-back", l.callback_requested ? `Requested${l.callback_time ? ` — ${l.callback_time}` : ""}` : "")}
${row("Summary", l.summary)}
${row("Recommended next action", l.next_best_action)}
</table>`;
}

async function emailAll(ws: WorkspaceLite, subject: string, html: string) {
  const to = (ws.notify_emails || []).filter((e) => /.+@.+\..+/.test(e)).slice(0, 10);
  const from = process.env.REMI_EMAIL_FROM || `${ws.assistant_name} via SimpleNow <noreply@simplenow.ai>`;
  for (const addr of to) {
    try {
      await sendEmail({ to: addr, subject, html, from, tool: "Dr.Remi.ai" });
    } catch {
      /* logged inside sendEmail */
    }
  }
}

export async function postWebhook(ws: WorkspaceLite, event: string, payload: Record<string, unknown>) {
  if (!ws.webhook_url) return;
  try {
    const body = JSON.stringify({ event, workspace: { id: ws.id, name: ws.name, slug: ws.slug }, sent_at: new Date().toISOString(), ...payload });
    const headers: Record<string, string> = { "Content-Type": "application/json", "X-Remi-Event": event };
    if (ws.webhook_secret) headers["X-Remi-Signature"] = `sha256=${signWebhook(ws.webhook_secret, body)}`;
    await safeFetch(ws.webhook_url, { method: "POST", body, headers, timeoutMs: 8000, maxBytes: 256 * 1024 });
  } catch (e) {
    console.error("[remi webhook]", e instanceof Error ? e.message : e);
  }
}

function publicLead(l: LeadRow) {
  const keys = [
    "id", "name", "company", "designation", "email", "phone", "location", "country", "preferred_language",
    "customer_type", "product_interests", "requirements", "current_solution", "challenges", "budget", "timeline",
    "purchase_authority", "score", "tier", "objections", "next_best_action", "summary", "callback_requested",
    "callback_time", "status", "channel", "consent", "consent_at", "created_at",
  ];
  return Object.fromEntries(keys.map((k) => [k, l[k] ?? null]));
}

export async function notifyQualifiedLead(ws: WorkspaceLite, lead: LeadRow) {
  const who = [lead.name, lead.company].filter(Boolean).join(" · ") || "New visitor";
  await emailAll(
    ws,
    `${String(lead.tier).toUpperCase()} lead: ${who}`,
    shell(`New qualified lead — ${who}`, `${ws.assistant_name} just captured a lead with consent.`, leadTable(lead), ws, lead.id)
  );
  await postWebhook(ws, "lead.qualified", { lead: publicLead(lead) });
}

export async function notifySessionSummary(ws: WorkspaceLite, lead: LeadRow, transcriptHtml: string) {
  const who = [lead.name, lead.company].filter(Boolean).join(" · ") || "Visitor";
  await emailAll(
    ws,
    `Conversation summary: ${who} (${lead.score}/100)`,
    shell(
      `Conversation summary — ${who}`,
      "Full requirement, objections and the recommended next step.",
      leadTable(lead) + `<div style="margin:14px 10px 0;padding-top:12px;border-top:1px solid #e9e3d3;font-size:12px;color:#5c584c">${transcriptHtml}</div>`,
      ws,
      lead.id
    )
  );
  await postWebhook(ws, "session.ended", { lead: publicLead(lead) });
}

export async function notifySafety(ws: WorkspaceLite, report: { description: string; product?: string | null; language?: string | null }, lead: LeadRow | null) {
  await emailAll(
    ws,
    `ACTION: possible adverse event / complaint reported to ${ws.assistant_name}`,
    shell(
      "Possible adverse event or product complaint",
      "A customer described a problem after using a product. Please review and respond per your pharmacovigilance / complaint SOP.",
      `<table style="width:100%;border-collapse:collapse">${row("Report", report.description)}${row("Product", report.product)}${row("Language", report.language)}</table>` +
        (lead ? leadTable(lead) : ""),
      ws,
      lead?.id
    )
  );
  await postWebhook(ws, "safety.reported", { report, lead: lead ? publicLead(lead) : null });
}

export { esc };
