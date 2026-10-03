import { logAudit } from "@/lib/nrs/audit";
import { HttpError, dbCheck, guard, ok, readJson, run, uuid } from "@/lib/nrs/invoice/kit";
import { applyMemberChanges, assertMemberInputAllowed, findProfileInOrg, parseMemberInput } from "@/lib/nrs/invoice/adminMembers";
import type { AdminRole } from "@/lib/nrs/invoice/adminTypes";

export const dynamic = "force-dynamic";

// PATCH: update profile fields, roles, feature switches, engagement; {relink:true}
// re-tries linking the platform account by email.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return run(async () => {
    const g = await guard(undefined, "hr");
    const { id: rawId } = await params;
    const id = uuid(rawId, "Member");
    const { data: before, error: bErr } = await g.admin
      .from("nrs_members")
      .select("id, email, user_id, manager_id, status, full_name, home_country")
      .eq("id", id)
      .eq("org_id", g.orgId)
      .is("deleted_at", null)
      .maybeSingle();
    dbCheck(bErr, "Member");
    if (!before) throw new HttpError("Member not found", 404);
    const b = await readJson(req);
    const input = parseMemberInput(b, false);

    if (input.fields.manager_id === id) throw new HttpError("A member can't be their own manager");
    const me = g.ctx.member?.id;
    if (me === id && input.roles && !g.ctx.isPlatformAdmin && !input.roles.includes("hr_admin") && !input.roles.includes("super_admin")) {
      throw new HttpError("You can't remove your own HR admin role", 409);
    }
    if (me === id && input.fields.status === "inactive") throw new HttpError("You can't deactivate yourself", 409);
    const { data: roleRows, error: rErr } = await g.admin.from("nrs_member_roles").select("role").eq("member_id", id);
    dbCheck(rErr, "Roles");
    const currentRoles = ((roleRows ?? []) as { role: AdminRole }[]).map((r) => r.role);
    const actorIsSuper = g.ctx.isPlatformAdmin || g.ctx.roles.includes("super_admin");
    if (!actorIsSuper && currentRoles.includes("super_admin")) {
      throw new HttpError("Only a super admin can change a super admin", 403);
    }
    await assertMemberInputAllowed(g.admin, g.orgId, input, { isSuperAdmin: actorIsSuper }, currentRoles);

    const fields = { ...input.fields };
    const prev = before as { email: string; user_id: string | null };
    const email = (input.email ?? prev.email).toLowerCase();
    if (b.relink === true || (input.email && input.email !== prev.email)) {
      const userId = await findProfileInOrg(g.admin, g.orgId, email);
      if (userId) {
        const { data: taken } = await g.admin.from("nrs_members").select("id").eq("user_id", userId).neq("id", id).maybeSingle();
        if (taken) throw new HttpError("That account is already linked to another member", 409);
      }
      fields.user_id = userId;
    }
    if (Object.keys(fields).length) {
      const { error } = await g.admin.from("nrs_members").update(fields).eq("id", id).eq("org_id", g.orgId);
      if (error?.code === "23505") throw new HttpError("Another member already uses this email", 409);
      dbCheck(error, "Updating member");
    }
    await applyMemberChanges(g.admin, g.orgId, id, input, g.user.id);
    await logAudit(g.admin, {
      orgId: g.orgId,
      actorUser: g.user.id,
      entity: "nrs_members",
      entityId: id,
      action: "update",
      before,
      after: { ...fields, roles: input.roles, features: input.features, engagement: input.engagement },
    });
    return ok({ ok: true, linked: "user_id" in fields ? !!fields.user_id : !!prev.user_id });
  });
}
