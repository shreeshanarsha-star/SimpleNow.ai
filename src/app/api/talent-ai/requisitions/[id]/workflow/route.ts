import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserRoles, hasTalentRole, logAudit, notifyUser } from "@/lib/talentRoles";
import { getOrgContext } from "@/lib/org";

const FEATURE_KEY = "Talent.ai";
const DEFAULT_CHANNELS = ["Career site", "LinkedIn", "Naukri", "Employee referral"];

// TA Assignment, Publishing, and reassignment -- the cross-role actions
// that don't fit the plain owner-scoped requisition PATCH.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let user, orgId;
  try {
    ({ user, orgId } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const action = typeof body?.action === "string" ? body.action : null;
  const admin = createAdminClient();

  const { data: requisition } = await admin.from("talent_requisitions").select("*").eq("id", id).single();
  if (!requisition) return NextResponse.json({ error: "Requisition not found." }, { status: 404 });
  // admin client bypasses RLS, so the org check has to happen explicitly
  // here -- otherwise a valid recruiter/TA head at one organization could
  // act on a requisition UUID belonging to a different one.
  const isPlatformOwner = (await admin.from("profiles").select("is_admin").eq("id", user.id).single()).data?.is_admin;
  if (!isPlatformOwner && requisition.org_id !== orgId) {
    return NextResponse.json({ error: "Requisition not found." }, { status: 404 });
  }

  if (action === "assign") {
    const isTaHead = await hasTalentRole(admin, user.id, "ta_head");
    if (!isTaHead && !isPlatformOwner) {
      return NextResponse.json({ error: "Only TA Head can assign requisitions to a recruiter." }, { status: 403 });
    }
    const recruiterId = typeof body?.recruiterId === "string" ? body.recruiterId : null;
    if (!recruiterId) return NextResponse.json({ error: "recruiterId is required." }, { status: 400 });
    const recruiterCtx = await getOrgContext(admin, recruiterId);
    if (recruiterCtx.orgId !== requisition.org_id) {
      return NextResponse.json({ error: "The recruiter must be a member of the same organization." }, { status: 403 });
    }
    if (requisition.status !== "approved" && requisition.status !== "in_progress") {
      return NextResponse.json({ error: "Only an approved requisition can be assigned." }, { status: 409 });
    }

    const { error } = await admin
      .from("talent_requisition_assignment")
      .upsert({ requisition_id: id, recruiter_id: recruiterId, assigned_by: user.id, assigned_at: new Date().toISOString(), notes: body.notes || null }, { onConflict: "requisition_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await admin.from("talent_requisitions").update({ status: "in_progress", updated_at: new Date().toISOString() }).eq("id", id);
    await admin.from("talent_requisition_status_history").insert({
      requisition_id: id,
      from_status: requisition.status,
      to_status: "in_progress",
      changed_by: user.id,
      note: "Assigned to recruiter",
    });
    await notifyUser({ userId: recruiterId, title: `You've been assigned: "${requisition.title}"`, link: `/tools/talent-ai?requisition=${id}` });
    await logAudit({ entityType: "talent_requisitions", entityId: id, actorId: user.id, action: "assigned", detail: { recruiterId } });
    return NextResponse.json({ ok: true });
  }

  if (action === "publish" || action === "unpublish") {
    const myRoles = await getUserRoles(admin, user.id);
    const { data: assignment } = await admin.from("talent_requisition_assignment").select("recruiter_id").eq("requisition_id", id).maybeSingle();
    const allowed = isPlatformOwner || myRoles.includes("ta_head") || assignment?.recruiter_id === user.id;
    if (!allowed) return NextResponse.json({ error: "Only the assigned recruiter or TA Head can publish." }, { status: 403 });

    const publish = action === "publish";
    const channels = publish
      ? (Array.isArray(body.channels) && body.channels.length ? body.channels : DEFAULT_CHANNELS).map((c: string) => ({ channel: c, posted: false }))
      : requisition.posting_channels;
    const { error } = await admin
      .from("talent_requisitions")
      .update({ is_published: publish, published_at: publish ? new Date().toISOString() : null, posting_channels: channels, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logAudit({ entityType: "talent_requisitions", entityId: id, actorId: user.id, action: publish ? "published" : "unpublished" });
    return NextResponse.json({ ok: true });
  }

  if (action === "toggle_channel") {
    const channel = typeof body?.channel === "string" ? body.channel : null;
    if (!channel) return NextResponse.json({ error: "channel is required." }, { status: 400 });
    const channels = Array.isArray(requisition.posting_channels) ? requisition.posting_channels : [];
    const updated = channels.map((c: { channel: string; posted: boolean }) =>
      c.channel === channel ? { ...c, posted: !c.posted } : c
    );
    const { error } = await admin.from("talent_requisitions").update({ posting_channels: updated }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, posting_channels: updated });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
