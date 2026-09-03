import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";
import { sendReminderEmail } from "@/lib/jdstudio/mailer";

// Manual "nudge now" button on the dashboard.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let user, supabase;
  try {
    ({ user, supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }

  const { data: req } = await supabase.from("jdstudio_requests").select("*").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!req) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!["sent", "opened"].includes(req.status)) {
    return NextResponse.json({ error: "This request isn't waiting on a response." }, { status: 400 });
  }

  const result = await sendReminderEmail({
    to: req.recipient_email,
    recipientName: req.recipient_name,
    jobTitle: req.job_title,
    token: req.token,
  });

  const { data: updated, error } = await supabase
    .from("jdstudio_requests")
    .update({ reminder_count: (req.reminder_count || 0) + 1, last_reminded_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ request: updated, emailSent: result.ok });
}
