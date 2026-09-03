import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";
import { sendIntakeInviteEmail } from "@/lib/jdstudio/mailer";

// Manual-mode "confirm and send" -- fires the intake invite after the
// user has reviewed/edited the recipient + questions on a pending_review
// request created by /uploads/[id]/execute.
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
  if (req.status !== "pending_review") {
    return NextResponse.json({ error: `Can't send from status "${req.status}".` }, { status: 400 });
  }

  const result = await sendIntakeInviteEmail({
    to: req.recipient_email,
    recipientName: req.recipient_name,
    jobTitle: req.job_title,
    department: req.department,
    token: req.token,
  });

  const { data: updated, error } = await supabase
    .from("jdstudio_requests")
    .update({ status: "sent", error: result.ok ? null : result.error })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ request: updated, emailSent: result.ok });
}
