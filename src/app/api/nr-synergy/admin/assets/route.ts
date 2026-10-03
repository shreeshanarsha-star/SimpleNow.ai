import { logAudit } from "@/lib/nrs/audit";
import { dbCheck, guard, isoDate, ok, oneOf, readJson, run, str, todayIso, uuid } from "@/lib/nrs/invoice/kit";
import { assertActiveMember, assertSerialFree } from "./_lib";
import { ASSET_COLUMNS, ASSET_KINDS, type AssetsData } from "./_types";

export const dynamic = "force-dynamic";

// GET: the org's asset inventory + members (for assignment). HR only.
export async function GET() {
  return run(async () => {
    const g = await guard(undefined, "hr");
    const [assets, members] = await Promise.all([
      g.admin.from("nrs_assets").select(ASSET_COLUMNS).eq("org_id", g.orgId).order("created_at", { ascending: false }).limit(5000),
      g.admin
        .from("nrs_members")
        .select("id, full_name, email, status")
        .eq("org_id", g.orgId)
        .is("deleted_at", null)
        .order("full_name"),
    ]);
    dbCheck(assets.error, "Assets");
    dbCheck(members.error, "Members");
    return ok({ assets: assets.data ?? [], members: members.data ?? [] } as AssetsData);
  });
}

// POST { kind, model?, serial?, notes?, assigned_member_id?, issued_on? }: add one asset.
export async function POST(req: Request) {
  return run(async () => {
    const g = await guard(undefined, "hr");
    const b = await readJson(req);
    const kind = oneOf(b.kind, ASSET_KINDS, "Kind");
    const model = str(b.model, "Model", { max: 200, optional: true });
    const serial = str(b.serial, "Serial", { max: 120, optional: true });
    const notes = str(b.notes, "Notes", { max: 2000, optional: true });
    const memberId = b.assigned_member_id ? uuid(b.assigned_member_id, "Member") : null;
    if (memberId) await assertActiveMember(g.admin, g.orgId, memberId);
    if (serial) await assertSerialFree(g.admin, g.orgId, serial);

    const row = {
      org_id: g.orgId,
      kind,
      model,
      serial,
      notes,
      assigned_member_id: memberId,
      status: memberId ? "issued" : "in_stock",
      issued_on: memberId ? isoDate(b.issued_on, "Issued on", true) ?? todayIso() : null,
    };
    const { data, error } = await g.admin.from("nrs_assets").insert(row).select("id").single();
    dbCheck(error, "Adding asset");
    const id = (data as { id: string }).id;
    await logAudit(g.admin, { orgId: g.orgId, actorUser: g.user.id, entity: "nrs_assets", entityId: id, action: "create", after: row });
    return ok({ id }, 201);
  });
}
