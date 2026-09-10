// Intelexa Notification & Delivery Engine
// Supports HTML email generation via Resend and concise WhatsApp digests via
// WhatsApp Cloud API / Twilio with zero-config wa.me instant dispatch fallback.

import { sendEmail } from "./email";
import type { ExtractedIntelligence } from "./intelexaAI";

export interface Recipient {
  name: string;
  email: string;
  whatsapp?: string;
  delivery_email?: boolean;
  delivery_whatsapp?: boolean;
  is_primary?: boolean;
}

export interface DeliveryResult {
  emailSent: number;
  emailFailed: number;
  whatsappSent: number;
  whatsappFailed: number;
  whatsappLinks: Array<{ recipient: string; phone: string; link: string }>;
  logs: Array<{
    channel: "email" | "whatsapp";
    recipient: string;
    status: "sent" | "failed" | "prepared";
    detail?: string;
    timestamp: string;
  }>;
}

function getAppBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "https://simplenow.ai";
}

// -------------------------------------------------------------
// HTML Email Generator
// -------------------------------------------------------------
export function formatEmailHtml(params: {
  eventName: string;
  eventType: string;
  durationFormatted: string;
  executiveBrief: string[];
  intelligence: ExtractedIntelligence;
  reportUrl: string;
}): string {
  const { eventName, eventType, durationFormatted, executiveBrief, intelligence, reportUrl } = params;

  const briefList = executiveBrief
    .map(
      (b) =>
        `<li style="margin-bottom: 8px; line-height: 1.5; color: #1e293b; font-size: 14px;">${b}</li>`
    )
    .join("");

  const topInsights = (intelligence.insights || [])
    .slice(0, 3)
    .map((ins) => {
      const tagColor =
        ins.classification === "OBSERVED"
          ? "#059669"
          : ins.classification === "INFERRED"
          ? "#7c3aed"
          : "#d97706";
      return `
      <div style="background: #f8fafc; border-left: 4px solid ${tagColor}; padding: 12px 16px; margin-bottom: 12px; border-radius: 4px;">
        <div style="font-size: 11px; font-weight: 700; color: ${tagColor}; text-transform: uppercase; margin-bottom: 4px;">
          [${ins.classification}] &bull; ${ins.timestamp || "Event"}
        </div>
        <div style="font-weight: 600; color: #0f172a; font-size: 14px; margin-bottom: 4px;">${ins.insight}</div>
        <div style="font-size: 13px; color: #475569; line-height: 1.4;">${ins.what_was_said}</div>
        <div style="font-size: 12px; color: #64748b; margin-top: 4px;"><strong>Why it matters:</strong> ${ins.why_matters}</div>
      </div>`;
    })
    .join("");

  const topOpportunities = (intelligence.opportunities || [])
    .filter((o) => o.priority === "HIGH")
    .slice(0, 3)
    .map(
      (opp) => `
      <div style="background: #fffbeb; border: 1px solid #fef3c7; padding: 10px 14px; border-radius: 6px; margin-bottom: 10px;">
        <div style="font-weight: 700; color: #b45309; font-size: 13px;">🔥 ${opp.opportunity}</div>
        <div style="font-size: 12px; color: #78350f; margin-top: 2px;">${opp.person_company ? `<strong>${opp.person_company}:</strong> ` : ""}${opp.reason}</div>
        <div style="font-size: 12px; color: #92400e; margin-top: 4px;"><strong>Action:</strong> ${opp.recommended_action}</div>
      </div>`
    )
    .join("");

  const topPeople = (intelligence.people || [])
    .slice(0, 3)
    .map(
      (p) => `
      <div style="border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 8px;">
        <div style="font-weight: 600; font-size: 13px; color: #0f172a;">${p.name} <span style="font-weight: 400; color: #64748b;">— ${p.role}${p.company ? ` (${p.company})` : ""}</span></div>
        <div style="font-size: 12px; color: #475569; margin-top: 2px;">${p.why_matters}</div>
      </div>`
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Intelexa | Event Intelligence — ${eventName}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f1f5f9; margin: 0; padding: 24px;">
  <div style="max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 28px 32px; color: #ffffff;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
        <span style="background: #3b82f6; color: #ffffff; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.5px;">Intelexa.ai</span>
        <span style="color: #94a3b8; font-size: 12px;">Personal Event Intelligence</span>
      </div>
      <h1 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 700; line-height: 1.3;">${eventName}</h1>
      <div style="color: #94a3b8; font-size: 13px;">
        ${eventType} &bull; Duration: ${durationFormatted} &bull; SimpleNow.ai
      </div>
    </div>

    <!-- Body -->
    <div style="padding: 28px 32px;">
      <!-- Executive Brief -->
      <h2 style="font-size: 15px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-top: 0;">
        ⚡ Executive Brief (60-Second Read)
      </h2>
      <ul style="padding-left: 20px; margin-top: 12px; margin-bottom: 24px;">
        ${briefList}
      </ul>

      <!-- Top Insights -->
      ${topInsights ? `
      <h2 style="font-size: 15px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-top: 24px;">
        💡 What Matters Most
      </h2>
      <div style="margin-top: 12px; margin-bottom: 24px;">
        ${topInsights}
      </div>` : ""}

      <!-- Opportunities -->
      ${topOpportunities ? `
      <h2 style="font-size: 15px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-top: 24px;">
        🎯 High-Value Opportunities
      </h2>
      <div style="margin-top: 12px; margin-bottom: 24px;">
        ${topOpportunities}
      </div>` : ""}

      <!-- People to Follow Up With -->
      ${topPeople ? `
      <h2 style="font-size: 15px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-top: 24px;">
        👥 People to Follow Up With
      </h2>
      <div style="margin-top: 12px; margin-bottom: 24px;">
        ${topPeople}
      </div>` : ""}

      <!-- Action Button CTA -->
      <div style="text-align: center; margin-top: 36px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
        <a href="${reportUrl}" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 28px; border-radius: 8px; box-shadow: 0 2px 4px rgba(37,99,235,0.2);">
          View Full Event Intelligence Report &rarr;
        </a>
        <div style="font-size: 11px; color: #94a3b8; margin-top: 10px;">
          Includes full timestamped transcript, competitive matrix, follow-up drafts & interactive Q&A.
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 32px; text-align: center; font-size: 11px; color: #64748b;">
      Intelexa &bull; Personal Event Intelligence Agent inside <a href="https://simplenow.ai" style="color: #2563eb; text-decoration: none;">SimpleNow.ai</a>
    </div>
  </div>
</body>
</html>`;
}

// -------------------------------------------------------------
// Concise WhatsApp Message Formatter (PRD Section 14)
// -------------------------------------------------------------
export function formatWhatsAppMessage(params: {
  eventName: string;
  durationFormatted: string;
  intelligence: ExtractedIntelligence;
  reportUrl: string;
}): string {
  const { eventName, durationFormatted, intelligence, reportUrl } = params;

  const top3Insights = (intelligence.insights || [])
    .slice(0, 3)
    .map((ins, i) => `${i + 1}. *[${ins.classification}]* ${ins.insight}`)
    .join("\n");

  const highOppCount = (intelligence.opportunities || []).filter(
    (o) => o.priority === "HIGH"
  ).length;

  const peopleCount = (intelligence.people || []).length;

  const firstAction =
    intelligence.action_plan?.do_today?.[0]?.task ||
    intelligence.top_3_recommendations?.[0] ||
    "Review event follow-ups in dashboard.";

  return `*Intelexa Event Intelligence*
*${eventName}*
⏱ ${durationFormatted}

*Top Insights:*
${top3Insights || "• Event processed and insights cataloged."}

*Opportunities:*
🔥 ${highOppCount > 0 ? `${highOppCount} high-value opportunities detected` : "Opportunities identified in report"}

*People:*
👤 ${peopleCount} key ${peopleCount === 1 ? "person" : "people"} worth following up with

*Next Action:*
${firstAction}

👉 *View full report:*
${reportUrl}`;
}

// -------------------------------------------------------------
// Automated WhatsApp Dispatcher (Cloud API / Twilio)
// -------------------------------------------------------------
async function dispatchWhatsAppApi(
  phoneNumber: string,
  messageText: string
): Promise<{ ok: boolean; error?: string }> {
  // 1. Meta WhatsApp Business Cloud API
  const cloudPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const cloudToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (cloudPhoneId && cloudToken) {
    try {
      const cleanPhone = phoneNumber.replace(/[^0-9]/g, "");
      const res = await fetch(`https://graph.facebook.com/v19.0/${cloudPhoneId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cloudToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: cleanPhone,
          type: "text",
          text: { body: messageText },
        }),
      });
      if (res.ok) return { ok: true };
      const errText = await res.text().catch(() => "");
      return { ok: false, error: `WhatsApp Cloud API error (${res.status}): ${errText.slice(0, 200)}` };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  // 2. Twilio WhatsApp API
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";

  if (twilioSid && twilioAuth) {
    try {
      const cleanPhone = phoneNumber.startsWith("+") ? phoneNumber : `+${phoneNumber.replace(/[^0-9]/g, "")}`;
      const to = cleanPhone.startsWith("whatsapp:") ? cleanPhone : `whatsapp:${cleanPhone}`;
      const body = new URLSearchParams({
        From: twilioFrom.startsWith("whatsapp:") ? twilioFrom : `whatsapp:${twilioFrom}`,
        To: to,
        Body: messageText,
      });

      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${twilioSid}:${twilioAuth}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });
      if (res.ok) return { ok: true };
      const errText = await res.text().catch(() => "");
      return { ok: false, error: `Twilio WhatsApp error (${res.status}): ${errText.slice(0, 200)}` };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  // Not configured: fallback to prepared status
  return { ok: false, error: "Automated WhatsApp API not configured (use 1-tap wa.me link)" };
}

// -------------------------------------------------------------
// Deliver Event Intelligence to all configured recipients
// -------------------------------------------------------------
export async function deliverEventIntelligence(params: {
  eventId: string;
  eventName: string;
  eventType: string;
  durationSeconds: number;
  executiveBrief: string[];
  intelligence: ExtractedIntelligence;
  recipients: Recipient[];
}): Promise<DeliveryResult> {
  const { eventId, eventName, eventType, durationSeconds, executiveBrief, intelligence, recipients } = params;

  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.floor((durationSeconds % 3600) / 60);
  const durationFormatted = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  const baseUrl = getAppBaseUrl();
  const reportUrl = `${baseUrl}/tools/intelexa?event=${eventId}`;

  const emailHtml = formatEmailHtml({
    eventName,
    eventType,
    durationFormatted,
    executiveBrief,
    intelligence,
    reportUrl,
  });

  const whatsappText = formatWhatsAppMessage({
    eventName,
    durationFormatted,
    intelligence,
    reportUrl,
  });

  const result: DeliveryResult = {
    emailSent: 0,
    emailFailed: 0,
    whatsappSent: 0,
    whatsappFailed: 0,
    whatsappLinks: [],
    logs: [],
  };

  for (const r of recipients) {
    // 1. Email Delivery
    if (r.delivery_email !== false && r.email) {
      const emailRes = await sendEmail({
        to: r.email,
        subject: `Intelexa | Event Intelligence — ${eventName}`,
        html: emailHtml,
        tool: "Intelexa.ai",
      });

      if (emailRes.ok) {
        result.emailSent++;
        result.logs.push({
          channel: "email",
          recipient: r.email,
          status: "sent",
          timestamp: new Date().toISOString(),
        });
      } else {
        result.emailFailed++;
        result.logs.push({
          channel: "email",
          recipient: r.email,
          status: "failed",
          detail: emailRes.error,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // 2. WhatsApp Delivery
    if (r.delivery_whatsapp !== false && r.whatsapp) {
      const cleanPhone = r.whatsapp.replace(/[^0-9]/g, "");
      const waLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(whatsappText)}`;

      result.whatsappLinks.push({
        recipient: r.name || r.whatsapp,
        phone: r.whatsapp,
        link: waLink,
      });

      const waRes = await dispatchWhatsAppApi(r.whatsapp, whatsappText);
      if (waRes.ok) {
        result.whatsappSent++;
        result.logs.push({
          channel: "whatsapp",
          recipient: r.whatsapp,
          status: "sent",
          timestamp: new Date().toISOString(),
        });
      } else {
        // If API wasn't configured, mark as prepared so user can tap wa.me link
        result.logs.push({
          channel: "whatsapp",
          recipient: r.whatsapp,
          status: waRes.error?.includes("not configured") ? "prepared" : "failed",
          detail: waRes.error,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  return result;
}
