import { logAudit } from "@/lib/nrs/audit";
import { HttpError, dbCheck, guard, isoDate, ok, oneOf, readJson, run, str, todayIso, uuid } from "@/lib/nrs/invoice/kit";
import { assertActiveMember, assertSerialFree } from "../_lib";
import { ASSET_COLUMNS, ASSET_KINDS, type AssetDto } from "../_types";

export const dynamic = "force-dynamic";

const ACTIONS = ["edit", "assign", "return", "lost"] as const;

// PATCH { action, ... }  HR only.
//   edit:   { kind, model?, serial?, notes?, issued_on?, returned_on? }
//   assign: { member_id, issued_on? }      -> issued (clears returned_on)
//   return: { returned_on? }               -> returned (keeps the last holder as history)
//   lost:   {}                             -> lost
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return run(async () => {
    const g = await guard(undefined, "hr");
    const id = uuid((await params).id, "Asset");
    const { data: bData, error: bErr } = await g.admin.from("nrs_assets").select(ASSET_COLUMNS).eq("id", id).eq("org_id", g.orgId).maybeSingle();
    dbCheck(bErr, "Asset");
    const before = bData as AssetDto | null;
    if (!before) throw new HttpError("Asset not found", 404);

    const b = await readJson(req);
    const action = oneOf(b.action, ACTIONS, "Action");
    let patch: Record<string, unknown>;

    switch (action) {
      case "edit": {
        const serial = str(b.serial, "Serial", { max: 120, optional: true });
        if (serial && serial.toLowerCase() !== (before.serial ?? "").toLowerCase()) await assertSerialFree(g.admin, g.orgId, serial, id);
        patch = {
          kind: oneOf(b.kind, ASSET_KINDS, "Kind"),
          model: str(b.model, "Model", { max: 200, optional: true }),
          serial,
          notes: str(b.notes, "Notes", { max: 2000, optional: true }),
        };
        if ("issued_on" in b) patch.issued_on = isoDate(b.issued_on, "Issued on", true);
        if ("returned_on" in b) patch.returned_on = isoDate(b.returned_on, "Returned on", true);
        break;
      }
      case "assign": {
        const memberId = uuid(b.member_id, "Member");
        await assertActiveMember(g.admin, g.orgId, memberId);
        patch = {
          assigned_member_id: memberId,
          status: "issued",
          issued_on: isoDate(b.issued_on, "Issued on", true) ?? todayIso(),
          returned_on: null,
        };
        break;
      }
      case "return": {
        if (before.status !== "issued" && before.status !== "lost") throw new HttpError("Only an issued or lost asset can be returned", 409);
        const returnedOn = isoDate(b.returned_on, "Returned on", true) ?? todayIso();
        if (before.issued_on && returnedOn < before.issued_on) throw new HttpError("Return date can't be before the issue date");
        patch = { status: "returned", returned_on: returnedOn };
        break;
      }
      case "lost": {
        if (before.status === "lost") throw new HttpError("This asset is already marked lost", 409);
        patch = { status: "lost" };
        break;
      }
    }

    const issued = (patch.issued_on as string | null | undefined) ?? before.issued_on;
    const returned = (patch.returned_on as string | null | undefined) ?? (action === "assign" ? null : before.returned_on);
    if (issued && returned && returned < issued) throw new HttpError("Return date can't be before the issue date");

    patch.updated_at = new Date().toISOString();
    const { error } = await g.admin.from("nrs_assets").update(patch).eq("id", id).eq("org_id", g.orgId);
    dbCheck(error, "Saving asset");
    await logAudit(g.admin, {
      orgId: g.orgId,
      actorUser: g.user.id,
      entity: "nrs_assets",
      entityId: id,
      action: action === "edit" ? "update" : action,
      before,
      after: patch,
    });
    return ok({ ok: true });
  });
}
