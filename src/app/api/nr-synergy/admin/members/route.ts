import { logAudit } from "@/lib/nrs/audit";
import { HttpError, dbCheck, guard, ok, readJson, run } from "@/lib/nrs/invoice/kit";
import { applyMemberChanges, assertMemberInputAllowed, findProfileInOrg, loadAdminMembers, parseMemberInput } from "@/lib/nrs/invoice/adminMembers";

export const dynamic = "force-dynamic";

// GET: members (with roles, overrides, engagement), feature catalogue, countries.
export async function GET() {
  return run(async () => {
    const g = await guard(undefined, "hr");
    const [members, features, countries] = await Promise.all([
      loadAdminMembers(g.admin, g.orgId, { withInviteState: true }),
      g.admin.from("nrs_features").select("key, name, default_on").order("sort"),
      g.admin.from("nrs_countries").select("code, name").eq("org_id", g.orgId).order("name"),
    ]);
    dbCheck(features.error, "Features");
    dbCheck(countries.error, "Countries");
    return ok({ members, features: features.data ?? [], countries: countries.data ?? [] });
  });
}

// POST: create a member (links the platform account by email when one exists).
export async function POST(req: Request) {
  return run(async () => {
    const g = await guard(undefined, "hr");
    const input = parseMemberInput(await readJson(req), true);
    const email = input.email as string;
    await assertMemberInputAllowed(g.admin, g.orgId, input, { isSuperAdmin: isSuper(g.ctx) });
    const { data: dupe } = await g.admin
      .from("nrs_members")
      .select("id")
      .eq("org_id", g.orgId)
      .eq("email", email)
      .maybeSingle();
    if (dupe) throw new HttpError("A member with this email already exists", 409);

    const userId = await findUnlinkedUser(g.admin, g.orgId, email);
    const { data, error } = await g.admin
      .from("nrs_members")
      .insert({ org_id: g.orgId, user_id: userId, ...input.fields })
      .select("id")
      .single();
    dbCheck(error, "Creating member");
    const id = (data as { id: string }).id;
    await applyMemberChanges(g.admin, g.orgId, id, input, g.user.id);
    await logAudit(g.admin, {
      orgId: g.orgId,
      actorUser: g.user.id,
      entity: "nrs_members",
      entityId: id,
      action: "create",
      after: { ...input.fields, linked: !!userId, roles: input.roles, engagement: input.engagement, features: input.features },
    });
    return ok({ id, linked: !!userId }, 201);
  });
}

function isSuper(ctx: { isPlatformAdmin: boolean; roles: readonly string[] }): boolean {
  return ctx.isPlatformAdmin || ctx.roles.includes("super_admin");
}

async function findUnlinkedUser(admin: Parameters<typeof loadAdminMembers>[0], orgId: string, email: string): Promise<string | null> {
  const userId = await findProfileInOrg(admin, orgId, email);
  if (!userId) return null;
  const { data: taken } = await admin.from("nrs_members").select("id").eq("user_id", userId).maybeSingle();
  return taken ? null : userId;
}
