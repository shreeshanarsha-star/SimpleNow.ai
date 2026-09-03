import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendReminderEmail, sendEscalationEmail } from "@/lib/jdstudio/mailer";
import { REMINDER_AFTER_DAYS, ESCALATE_AFTER_DAYS } from "@/lib/jdstudio/types";

// No cron infra exists in this codebase yet, so this scan is triggered
// on-demand, scoped to the signed-in owner's own requests -- called from
// the dashboard on load, same "check on page view" shape as other tools'
// lightweight background work.
export async function GET() {
  let user, supabase;
  try {
    ({ user, supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }

  const admin = createAdminClient();
  const { data: stale } = await supabase
    .from("jdstudio_requests")
    .select("*")
    .eq("owner_id", user.id)
    .in("status", ["sent", "opened"]);

  if (!stale?.length) return NextResponse.json({ reminded: 0, escalated: 0 });

  const now = Date.now();
  let reminded = 0;
  let escalated = 0;

  for (const req of stale) {
    const ageDays = (now - new Date(req.created_at).getTime()) / 86_400_000;
    const sinceLastReminderDays = req.last_reminded_at
      ? (now - new Date(req.last_reminded_at).getTime()) / 86_400_000
      : ageDays;

    if (!req.escalated_at && ageDays >= ESCALATE_AFTER_DAYS && user.email) {
      await sendEscalationEmail({
        to: user.email,
        recipientEmail: req.recipient_email,
        jobTitle: req.job_title,
        department: req.department,
      }).catch(() => null);
      await admin.from("jdstudio_requests").update({ escalated_at: new Date().toISOString() }).eq("id", req.id);
      escalated++;
      continue;
    }

    if (sinceLastReminderDays >= REMINDER_AFTER_DAYS) {
      const result = await sendReminderEmail({
        to: req.recipient_email,
        recipientName: req.recipient_name,
        jobTitle: req.job_title,
        token: req.token,
      }).catch(() => ({ ok: false }));
      if (result.ok) {
        await admin
          .from("jdstudio_requests")
          .update({ reminder_count: (req.reminder_count || 0) + 1, last_reminded_at: new Date().toISOString() })
          .eq("id", req.id);
        reminded++;
      }
    }
  }

  return NextResponse.json({ reminded, escalated });
}
