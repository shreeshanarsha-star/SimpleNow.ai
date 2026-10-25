import { handle, requireRemi, clean, audit, jsonError, isUuid, roleAtLeast } from "@/lib/remi/access";
import { postWebhook } from "@/lib/remi/notify";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; leadId: string }> };

async function loadLead(id: string, leadId: string, min: "viewer" | "rep" = "viewer") {
  const ctx = await requireRemi(id, min);
  if (!isUuid(leadId)) throw jsonError("Not found.", 404);
  const { data: lead } = await ctx.admin.from("remi_leads").select("*").eq("id", leadId).eq("workspace_id", id).maybeSingle();
  if (!lead) throw jsonError("Not found.", 404);
  if (ctx.role === "rep" && lead.assigned_to && lead.assigned_to !== ctx.user.id) throw jsonError("Not found.", 404);
  return { ...ctx, lead };
}

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id, leadId } = await params;
    const { admin, lead } = await loadLead(id, leadId);
    const [{ data: messages }, { data: events }] = await Promise.all([
      lead.session_id
        ? admin.from("remi_messages").select("id,role,content,language,topic,meta,created_at").eq("session_id", lead.session_id).order("id").limit(200)
        : Promise.resolve({ data: [] }),
      admin.from("remi_lead_events").select("id,kind,detail,actor,created_at").eq("lead_id", leadId).order("created_at").limit(200),
    ]);
    return Response.json({ lead, messages: messages || [], events: events || [] });
  });
}

const STATUSES = ["new", "contacted", "meeting", "quoted", "won", "lost"];

export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id, leadId } = await params;
    const { admin, lead, user, role } = await loadLead(id, leadId, "rep");
    const b = await req.json().catch(() => ({}));
    const patch: Record<string, unknown> = {};
    const events: { kind: string; detail: Record<string, unknown> }[] = [];

    if ("status" in b && STATUSES.includes(b.status) && b.status !== lead.status) {
      patch.status = b.status;
      events.push({ kind: "status", detail: { from: lead.status, to: b.status } });
    }
    if ("assigned_to" in b) {
      if (b.assigned_to === null) patch.assigned_to = null;
      else if (isUuid(b.assigned_to)) {
        if (!roleAtLeast(role, "admin") && b.assigned_to !== user.id) return jsonError("Reps can only assign leads to themselves.", 403);
        const { data: m } = await admin.from("remi_members").select("user_id").eq("workspace_id", id).eq("user_id", b.assigned_to).maybeSingle();
        if (!m) return jsonError("That person isn't a member of this workspace.", 400);
        patch.assigned_to = b.assigned_to;
      }
      if (patch.assigned_to !== undefined) events.push({ kind: "assigned", detail: { to: patch.assigned_to } });
    }
    if ("follow_up_at" in b) {
      const d = b.follow_up_at ? new Date(b.follow_up_at) : null;
      patch.follow_up_at = d && !isNaN(d.getTime()) ? d.toISOString() : null;
      events.push({ kind: "follow_up", detail: { at: patch.follow_up_at } });
    }
    if ("deal_value" in b) {
      const v = Number(b.deal_value);
      patch.deal_value = Number.isFinite(v) && v >= 0 ? v : null;
    }
    if ("notes" in b) patch.notes = clean(b.notes, 4000);
    for (const k of ["name", "company", "designation", "email", "phone", "location", "country", "requirements", "budget", "timeline"]) {
      if (k in b) patch[k] = clean(b[k], k === "requirements" ? 1000 : 200);
    }
    if (!Object.keys(patch).length) return jsonError("Nothing to update.", 400);
    patch.updated_at = new Date().toISOString();
    const { data } = await admin.from("remi_leads").update(patch).eq("id", leadId).eq("workspace_id", id).select("*").single();
    for (const e of events) {
      await admin.from("remi_lead_events").insert({ lead_id: leadId, workspace_id: id, actor: user.id, ...e });
    }
    await audit(admin, id, user.id, "lead.updated", { lead_id: leadId, fields: Object.keys(patch) });
    if (patch.status) {
      const { data: ws } = await admin.from("remi_workspaces").select("id,name,slug,assistant_name,notify_emails,webhook_url,webhook_secret").eq("id", id).single();
      if (ws) await postWebhook(ws, "lead.status_changed", { lead: { id: leadId, status: patch.status, deal_value: data?.deal_value ?? null } });
    }
    return Response.json({ lead: data });
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id, leadId } = await params;
    const { admin, user } = await requireRemi(id, "admin");
    if (!isUuid(leadId)) return jsonError("Not found.", 404);
    // Right-to-erasure: removes the lead and its conversation.
    const { data: lead } = await admin.from("remi_leads").select("session_id").eq("id", leadId).eq("workspace_id", id).maybeSingle();
    if (!lead) return jsonError("Not found.", 404);
    await admin.from("remi_leads").delete().eq("id", leadId).eq("workspace_id", id);
    if (lead.session_id) await admin.from("remi_sessions").delete().eq("id", lead.session_id).eq("workspace_id", id);
    await audit(admin, id, user.id, "lead.erased", { lead_id: leadId });
    return Response.json({ ok: true });
  });
}
