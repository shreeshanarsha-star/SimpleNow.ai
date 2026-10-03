import { NextResponse } from "next/server";
import { requireNrs } from "@/lib/nrs/member";
import { loadCountryCalendar, parseIsoDate, workingDaysBetween } from "@/lib/nrs/dates";
import { createRequest, NrsApprovalError } from "@/lib/nrs/approvals";
import { emailRequesterOutcome } from "@/app/api/nr-synergy/invoices/_decisionEmail";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDay } from "@/app/tools/nr-synergy/time/_lib/tz";
import { loadLeaveBalances } from "@/app/tools/nr-synergy/time/_lib/balances";
import { checkLeaveRequest, splitWorkingDaysByYear } from "@/lib/nrs/leave";
import { leave as ls, fillLeave, fmtDays } from "@/lib/nrs/i18n/en/leave";
import { ISO_DATE_RE, isLeaveType, jsonError, readJson, str } from "../_lib/server";

const TYPE_LABEL: Record<string, string> = {
  annual: "Annual leave",
  sick: "Sick leave",
  personal: "Personal leave",
  unavailable: "Unavailable",
  unpaid: "Unpaid leave",
};

// POST /api/nr-synergy/time/leave
// body: { type, starts_on, ends_on, note? }
// Working days use the member's home-country rules and holidays; the row is
// written with the service role and an approval request ('leave') opened.
export async function POST(req: Request) {
  let g: Awaited<ReturnType<typeof requireNrs>>;
  try {
    g = await requireNrs("time");
  } catch (res) {
    return res as Response;
  }
  const { ctx, supabase, user } = g;
  const member = ctx.member;
  if (!member) return jsonError("Only members can request leave.", 403);

  const body = await readJson(req);
  if (!body) return jsonError("Invalid request body.", 400);
  if (!isLeaveType(body.type)) return jsonError("Choose a leave type.", 400);
  const startsOn = str(body.starts_on, 10);
  const endsOn = str(body.ends_on, 10);
  if (!startsOn || !endsOn || !ISO_DATE_RE.test(startsOn) || !ISO_DATE_RE.test(endsOn)) {
    return jsonError("Choose valid start and end dates.", 400);
  }
  try {
    parseIsoDate(startsOn);
    parseIsoDate(endsOn);
  } catch {
    return jsonError("Choose valid start and end dates.", 400);
  }
  if (endsOn < startsOn) return jsonError("The end date must be on or after the start date.", 400);
  if (parseIsoDate(endsOn).getTime() - parseIsoDate(startsOn).getTime() > 366 * 86400000) {
    return jsonError("A single request can cover at most one year.", 400);
  }
  const note = str(body.note, 1000);

  let workingDays: number;
  let daysByYear: Map<number, number>;
  try {
    const cal = await loadCountryCalendar(supabase, member.org_id, member.home_country, startsOn, endsOn);
    const calendar = { workingDays: cal.workingDays, holidays: cal.holidays };
    workingDays = workingDaysBetween(startsOn, endsOn, calendar);
    daysByYear = splitWorkingDaysByYear(startsOn, endsOn, calendar);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Could not load your country calendar.", 500);
  }
  if (workingDays <= 0) return jsonError("These dates have no working days.", 400);

  const admin = createAdminClient();

  // Balance check per leave year (unpaid / unavailable are never limited).
  try {
    const all = await loadLeaveBalances(
      admin,
      member.org_id,
      [{ id: member.id, home_country: member.home_country, joined_on: member.joined_on, left_on: member.left_on }],
      Array.from(daysByYear.keys())
    );
    const short = checkLeaveRequest(body.type, daysByYear, all.get(member.id) ?? new Map());
    if (short) {
      return jsonError(
        fillLeave(ls.serverExceeds, {
          type: ls.types[body.type].toLowerCase(),
          requested: fmtDays(short.requested),
          year: short.year,
          available: fmtDays(short.available),
        }),
        409
      );
    }
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Could not check your leave balance.", 500);
  }

  const { data: overlap, error: ovErr } = await admin
    .from("nrs_leave_requests")
    .select("id")
    .eq("member_id", member.id)
    .in("status", ["pending", "approved"])
    .lte("starts_on", endsOn)
    .gte("ends_on", startsOn)
    .limit(1);
  if (ovErr) return jsonError(ovErr.message, 500);
  if ((overlap ?? []).length) return jsonError("You already have leave booked on some of these dates.", 409);

  const { data: row, error: insErr } = await admin
    .from("nrs_leave_requests")
    .insert({
      org_id: member.org_id,
      member_id: member.id,
      type: body.type,
      starts_on: startsOn,
      ends_on: endsOn,
      working_days: workingDays,
      note,
      status: "pending",
    })
    .select("id")
    .single();
  if (insErr || !row) return jsonError(insErr?.message ?? "Could not save the request.", 500);
  const leaveId = (row as { id: string }).id;

  const title = `${TYPE_LABEL[body.type]}: ${formatDay(startsOn)} – ${formatDay(endsOn)} (${workingDays} working day${
    workingDays === 1 ? "" : "s"
  })`;
  try {
    const result = await createRequest("leave", leaveId, member.id, title, null, null, {
      createdBy: user.id,
      summary: note,
      admin,
    });
    if (result.status === "approved") await emailRequesterOutcome(admin, result.requestId);
    return NextResponse.json({ id: leaveId, workingDays, requestId: result.requestId, status: result.status });
  } catch (e) {
    await admin.from("nrs_leave_requests").delete().eq("id", leaveId);
    if (e instanceof NrsApprovalError) return jsonError(e.message, e.status);
    return jsonError("Could not open the approval request.", 500);
  }
}
