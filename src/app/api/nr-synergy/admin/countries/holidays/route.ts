import { logAudit } from "@/lib/nrs/audit";
import { HttpError, countryCode, dbCheck, guard, isoDate, ok, readJson, run, str, uuid } from "@/lib/nrs/invoice/kit";

export const dynamic = "force-dynamic";

// POST {country_code, day, name}
export async function POST(req: Request) {
  return run(async () => {
    const g = await guard(undefined, "hr");
    const b = await readJson(req);
    const row = {
      org_id: g.orgId,
      country_code: countryCode(b.country_code),
      day: isoDate(b.day, "Date"),
      name: str(b.name, "Name", { max: 120 }),
      source: "manual",
    };
    const { data, error } = await g.admin.from("nrs_holidays").insert(row).select("id").single();
    if (error?.code === "23505") throw new HttpError("There is already a holiday on that date", 409);
    if (error?.code === "23503") throw new HttpError("Add the country first", 404);
    dbCheck(error, "Saving holiday");
    await logAudit(g.admin, { orgId: g.orgId, actorUser: g.user.id, entity: "nrs_holidays", entityId: (data as { id: string }).id, action: "create", after: row });
    return ok({ id: (data as { id: string }).id }, 201);
  });
}

// DELETE ?id=
export async function DELETE(req: Request) {
  return run(async () => {
    const g = await guard(undefined, "hr");
    const id = uuid(new URL(req.url).searchParams.get("id"), "Holiday");
    const { data, error } = await g.admin.from("nrs_holidays").delete().eq("id", id).eq("org_id", g.orgId).select("country_code, day, name");
    dbCheck(error, "Deleting holiday");
    if (!data?.length) throw new HttpError("Holiday not found", 404);
    await logAudit(g.admin, { orgId: g.orgId, actorUser: g.user.id, entity: "nrs_holidays", entityId: id, action: "delete", before: data[0] });
    return ok({ ok: true });
  });
}
