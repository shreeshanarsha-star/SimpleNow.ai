import { logAudit } from "@/lib/nrs/audit";
import { HttpError, countryCode, dbCheck, guard, isoDate, jsonObject, ok, readJson, run } from "@/lib/nrs/invoice/kit";

export const dynamic = "force-dynamic";

// POST {country_code, effective_from, working_days[1..7], std_hours_per_day, leave_rules{}, expense_limits{}}
// Rules are effective-dated: a new row from a date; same date replaces it.
export async function POST(req: Request) {
  return run(async () => {
    const g = await guard(undefined, "hr");
    const b = await readJson(req);
    const code = countryCode(b.country_code);
    const days = Array.isArray(b.working_days) ? b.working_days.map(Number) : [];
    if (!days.length || days.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) {
      throw new HttpError("Pick at least one working day");
    }
    const hours = typeof b.std_hours_per_day === "string" ? b.std_hours_per_day.trim() : String(b.std_hours_per_day ?? "8");
    if (!/^\d{1,2}(\.\d{1,2})?$/.test(hours) || Number(hours) <= 0 || Number(hours) > 24) {
      throw new HttpError("Standard hours must be between 0 and 24");
    }
    const limits = jsonObject(b.expense_limits, "Expense limits");
    for (const [k, v] of Object.entries(limits)) {
      if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) throw new HttpError(`Limit for ${k} must be whole minor units`);
    }
    const row = {
      org_id: g.orgId,
      country_code: code,
      effective_from: isoDate(b.effective_from, "Effective from"),
      working_days: Array.from(new Set(days)).sort(),
      std_hours_per_day: hours,
      leave_rules: jsonObject(b.leave_rules, "Leave rules"),
      expense_limits: limits,
    };
    const { data: country } = await g.admin.from("nrs_countries").select("code").eq("org_id", g.orgId).eq("code", code).maybeSingle();
    if (!country) throw new HttpError("Add the country first", 404);
    const { data, error } = await g.admin
      .from("nrs_country_rules")
      .upsert(row, { onConflict: "org_id,country_code,effective_from" })
      .select("id")
      .single();
    dbCheck(error, "Saving rule");
    await logAudit(g.admin, {
      orgId: g.orgId,
      actorUser: g.user.id,
      entity: "nrs_country_rules",
      entityId: (data as { id: string }).id,
      action: "upsert",
      after: row,
    });
    return ok({ id: (data as { id: string }).id });
  });
}
