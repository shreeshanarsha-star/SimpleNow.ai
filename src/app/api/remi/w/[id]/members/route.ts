import { handle, requireRemi, audit, jsonError, isUuid } from "@/lib/remi/access";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";
type Ctx = { params: Promise<{ id: string }> };
const ROLES = ["admin", "rep", "viewer"];

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const { admin } = await requireRemi(id);
    const [{ data: members }, { data: invites }] = await Promise.all([
      admin.from("remi_members").select("user_id,role,email,created_at").eq("workspace_id", id).order("created_at"),
      admin.from("remi_invites").select("id,email,role,created_at").eq("workspace_id", id).order("created_at"),
    ]);
    return Response.json({ members: members || [], invites: invites || [] });
  });
}

// Invite by email. If that person already has a SimpleNow account they are
// added immediately; otherwise the invite waits until they sign up with a
// verified email and open Dr.Remi.
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const { admin, user } = await requireRemi(id, "admin");
    const b = await req.json().catch(() => ({}));
    const email = String(b.email || "").trim().toLowerCase();
    const role = ROLES.includes(b.role) ? b.role : "rep";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonError("Enter a valid email.", 400);
    const { count } = await admin.from("remi_members").select("user_id", { count: "exact", head: true }).eq("workspace_id", id);
    if ((count || 0) >= 50) return jsonError("Member limit reached (50).", 400);

    const { data: profile } = await admin.from("profiles").select("id,email").ilike("email", email).maybeSingle();
    if (profile?.id) {
      await admin.from("remi_members").upsert({ workspace_id: id, user_id: profile.id, role, email }, { onConflict: "workspace_id,user_id" });
      await audit(admin, id, user.id, "member.added", { email, role });
      return Response.json({ added: true });
    }
    await admin.from("remi_invites").upsert({ workspace_id: id, email, role, invited_by: user.id }, { onConflict: "workspace_id,email" });
    await audit(admin, id, user.id, "member.invited", { email, role });
    return Response.json({ invited: true });
  });
}

// PATCH {user_id, role} | DELETE ?user_id= or ?invite_id=
export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const { admin, user } = await requireRemi(id, "admin");
    const b = await req.json().catch(() => ({}));
    if (!isUuid(b.user_id) || !ROLES.includes(b.role)) return jsonError("Bad request.", 400);
    const { data: target } = await admin.from("remi_members").select("role").eq("workspace_id", id).eq("user_id", b.user_id).maybeSingle();
    if (!target) return jsonError("Member not found.", 404);
    if (target.role === "owner") return jsonError("The owner's role can't be changed.", 400);
    await admin.from("remi_members").update({ role: b.role }).eq("workspace_id", id).eq("user_id", b.user_id);
    await audit(admin, id, user.id, "member.role", { user_id: b.user_id, role: b.role });
    return Response.json({ ok: true });
  });
}

export async function DELETE(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const { admin, user } = await requireRemi(id, "admin");
    const url = new URL(req.url);
    const inviteId = url.searchParams.get("invite_id");
    const userId = url.searchParams.get("user_id");
    if (inviteId && isUuid(inviteId)) {
      await admin.from("remi_invites").delete().eq("id", inviteId).eq("workspace_id", id);
      return Response.json({ ok: true });
    }
    if (!isUuid(userId)) return jsonError("Bad request.", 400);
    const { data: target } = await admin.from("remi_members").select("role").eq("workspace_id", id).eq("user_id", userId).maybeSingle();
    if (!target) return jsonError("Member not found.", 404);
    if (target.role === "owner") return jsonError("The owner can't be removed.", 400);
    await admin.from("remi_members").delete().eq("workspace_id", id).eq("user_id", userId);
    await admin.from("remi_leads").update({ assigned_to: null }).eq("workspace_id", id).eq("assigned_to", userId);
    await audit(admin, id, user.id, "member.removed", { user_id: userId });
    return Response.json({ ok: true });
  });
}
