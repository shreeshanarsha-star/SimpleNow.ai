import { NextResponse } from "next/server";
import { requireNrs } from "@/lib/nrs/member";
import { localDateInTz } from "@/lib/nrs/dates";
import { isValidTimeZone } from "@/app/tools/nr-synergy/time/_lib/tz";
import { countryTimezone, isWorkMode, jsonError, readJson, roundCoord, str } from "../_lib/server";

// POST /api/nr-synergy/time/check-in
// body: { mode, timezone?, city?, country_code?, lat?, lng? }
// Inserts the caller's own work log with their RLS client (own-insert policy).
export async function POST(req: Request) {
  let g: Awaited<ReturnType<typeof requireNrs>>;
  try {
    g = await requireNrs("time");
  } catch (res) {
    return res as Response;
  }
  const { ctx, supabase } = g;
  const member = ctx.member;
  if (!member) return jsonError("Only members can check in.", 403);

  const body = await readJson(req);
  if (!body) return jsonError("Invalid request body.", 400);
  const mode = isWorkMode(body.mode) ? body.mode : "office";

  const browserTz = str(body.timezone, 64);
  const tz = isValidTimeZone(browserTz) ? browserTz : await countryTimezone(supabase, member.org_id, member.home_country);
  const day = localDateInTz(tz);

  const { data: open, error: openErr } = await supabase
    .from("nrs_work_logs")
    .select("id")
    .eq("member_id", member.id)
    .is("check_out_at", null)
    .limit(1);
  if (openErr) return jsonError(openErr.message, 500);
  if ((open ?? []).length) return jsonError("You're already checked in. Check out first.", 409);

  const city = str(body.city, 120);
  const rawCountry = str(body.country_code, 2);
  const countryCode = rawCountry && /^[A-Za-z]{2}$/.test(rawCountry) ? rawCountry.toUpperCase() : null;
  const lat = roundCoord(body.lat, 90);
  const lng = roundCoord(body.lng, 180);
  const shared = lat != null && lng != null;

  const { data, error } = await supabase
    .from("nrs_work_logs")
    .insert({
      org_id: member.org_id,
      member_id: member.id,
      day,
      check_in_at: new Date().toISOString(),
      timezone: tz,
      mode,
      city,
      country_code: countryCode,
      lat: shared ? lat : null,
      lng: shared ? lng : null,
      location_shared: shared,
      is_travel: !!countryCode && countryCode !== member.home_country.toUpperCase(),
      source: "app",
    })
    .select("id, day, check_in_at, check_out_at, timezone, mode, city, country_code, is_travel")
    .single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ log: data });
}
