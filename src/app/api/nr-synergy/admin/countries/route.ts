import { logAudit } from "@/lib/nrs/audit";
import { HttpError, countryCode, currency, dbCheck, guard, ok, readJson, run, str } from "@/lib/nrs/invoice/kit";

export const dynamic = "force-dynamic";

// GET ?year=2026 -> countries, all rules, holidays in that year.
export async function GET(req: Request) {
  return run(async () => {
    const g = await guard(undefined, "hr");
    const yearParam = new URL(req.url).searchParams.get("year");
    const year = yearParam && /^\d{4}$/.test(yearParam) ? yearParam : String(new Date().getUTCFullYear());
    const [c, r, h] = await Promise.all([
      g.admin.from("nrs_countries").select("code, name, timezone, currency").eq("org_id", g.orgId).order("name"),
      g.admin
        .from("nrs_country_rules")
        .select("id, country_code, effective_from, working_days, std_hours_per_day, leave_rules, expense_limits")
        .eq("org_id", g.orgId)
        .order("effective_from", { ascending: false }),
      g.admin
        .from("nrs_holidays")
        .select("id, country_code, day, name")
        .eq("org_id", g.orgId)
        .gte("day", `${year}-01-01`)
        .lte("day", `${year}-12-31`)
        .order("day"),
    ]);
    dbCheck(c.error, "Countries");
    dbCheck(r.error, "Country rules");
    dbCheck(h.error, "Holidays");
    const rules = ((r.data ?? []) as { std_hours_per_day: number | string }[]).map((x) => ({ ...x, std_hours_per_day: String(x.std_hours_per_day) }));
    return ok({ year, countries: c.data ?? [], rules, holidays: h.data ?? [] });
  });
}

// POST {code, name, timezone, currency}: create or update a country.
export async function POST(req: Request) {
  return run(async () => {
    const g = await guard(undefined, "hr");
    const b = await readJson(req);
    const row = {
      org_id: g.orgId,
      code: countryCode(b.code, "Code"),
      name: str(b.name, "Name", { max: 100 }),
      timezone: str(b.timezone, "Timezone", { max: 64 }),
      currency: currency(b.currency),
    };
    try {
      new Intl.DateTimeFormat("en", { timeZone: row.timezone });
    } catch {
      throw new HttpError("Timezone must be an IANA name like America/Mexico_City");
    }
    const { error } = await g.admin.from("nrs_countries").upsert(row, { onConflict: "org_id,code" });
    dbCheck(error, "Saving country");
    await logAudit(g.admin, { orgId: g.orgId, actorUser: g.user.id, entity: "nrs_countries", entityId: row.code, action: "upsert", after: row });
    return ok({ country: row });
  });
}
