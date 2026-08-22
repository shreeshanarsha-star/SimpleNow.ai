import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBulkEmail } from "@/lib/email";
import { logAudit } from "@/lib/talentRoles";

const FEATURE_KEY = "Talent.ai";

export async function POST(req: Request) {
  let supabase, user;
  try {
    ({ supabase, user } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const body = await req.json().catch(() => null);
  const listId = typeof body?.listId === "string" ? body.listId : null;
  const candidateIds: string[] = Array.isArray(body?.candidateIds) ? body.candidateIds : [];
  const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
  const html = typeof body?.html === "string" ? body.html : "";
  if (!subject || !html) return NextResponse.json({ error: "subject and html are required." }, { status: 400 });

  let ids = candidateIds;
  if (listId) {
    const { data: members } = await supabase.from("talent_candidate_list_members").select("candidate_id").eq("list_id", listId);
    ids = [...ids, ...(members || []).map((m) => m.candidate_id)];
  }
  ids = Array.from(new Set(ids));
  if (ids.length === 0) return NextResponse.json({ error: "No recipients -- pass listId or candidateIds." }, { status: 400 });

  const { data: candidates, error } = await supabase.from("talent_candidates").select("id, name, email").in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const recipients = (candidates || []).filter((c) => !!c.email);

  const result = await sendBulkEmail(recipients.map((c) => ({ email: c.email as string })), subject, html);

  const admin = createAdminClient();
  await admin.from("talent_email_log").insert(
    recipients.map((c) => ({
      list_id: listId,
      candidate_id: c.id,
      subject,
      body: html,
      sent_by: user.id,
      recipient_email: c.email,
    }))
  );
  await logAudit({ entityType: "talent_email_log", entityId: listId || "bulk", actorId: user.id, action: "mass_email_sent", detail: { count: recipients.length, sent: result.sent.length } });

  return NextResponse.json({ sent: result.sent, failed: result.failed, skippedNoEmail: ids.length - recipients.length });
}
