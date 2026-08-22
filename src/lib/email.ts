// Thin Resend wrapper. Degrades gracefully (logs instead of sending) if
// RESEND_API_KEY isn't set -- matches the existing .env.example comment
// for this variable. Uses a plain fetch to Resend's HTTP API rather than
// the resend npm package, to avoid adding a dependency for one call site.

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_ADDRESS = process.env.TALENT_EMAIL_FROM || "Talent.ai <onboarding@resend.dev>";

export type SendEmailResult = { ok: boolean; error?: string };

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[email:degraded] to=${params.to} subject="${params.subject}" (RESEND_API_KEY not set)`);
    return { ok: false, error: "RESEND_API_KEY not set -- logged instead of sent." };
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [params.to],
        subject: params.subject,
        html: params.html,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `Resend ${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown email error" };
  }
}

// Sends sequentially with a small stagger to stay well under Resend's
// rate limits for a recruiter mailing a shortlist/list of candidates.
export async function sendBulkEmail(
  recipients: { email: string }[],
  subject: string,
  html: string
): Promise<{ sent: string[]; failed: { email: string; error: string }[] }> {
  const sent: string[] = [];
  const failed: { email: string; error: string }[] = [];
  for (const r of recipients) {
    const result = await sendEmail({ to: r.email, subject, html });
    if (result.ok) sent.push(r.email);
    else failed.push({ email: r.email, error: result.error || "unknown error" });
  }
  return { sent, failed };
}
