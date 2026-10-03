import { NextResponse } from "next/server";
import { requireNrs } from "@/lib/nrs/member";
import { localDateInTz, parseIsoDate } from "@/lib/nrs/dates";
import { createRequest, NrsApprovalError } from "@/lib/nrs/approvals";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDay, zonedTimeToUtcIso } from "@/app/tools/nr-synergy/time/_lib/tz";
import { applyCorrection } from "../../approvals/_lib/applyCorrection";
import { countryTimezone, HHMM_RE, ISO_DATE_RE, jsonError, readJson, str } from "../_lib/server";

// POST /api/nr-synergy/time/correction
// body: { day, check_in?: "HH:MM", check_out?: "HH:MM", reason }
// Times are wall-clock in the day's work-log timezone (or the home country's).
// Opens a 'correction' approval request; the decide route applies it on approval.
export async function POST(req: Request) {
  let g: Awaited<ReturnType<typeof requireNrs>>;
  try {
    g = await requireNrs("time");
  } catch (res) {
    return res as Response;
  }
  const { ctx, supabase, user } = g;
  const member = ctx.member;
  if (!member) return jsonError("Only members can request corrections.", 403);

  const body = await readJson(req);
  if (!body) return jsonError("Invalid request body.", 400);
  const day = str(body.day, 10);
  if (!day || !ISO_DATE_RE.test(day)) return jsonError("Choose a valid day.", 400);
  try {
    parseIsoDate(day);
  } catch {
    return jsonError("Choose a valid day.", 400);
  }
  const inTime = str(body.check_in, 5);
  const outTime = str(body.check_out, 5);
  if (!inTime && !outTime) return jsonError("Enter a check-in or check-out time.", 400);
  if ((inTime && !HHMM_RE.test(inTime)) || (outTime && !HHMM_RE.test(outTime))) {
    return jsonError("Times must be HH:MM.", 400);
  }
  const reason = str(body.reason, 1000);
  if (!reason) return jsonError("Add a reason.", 400);

  const { data: logData, error: logErr } = await supabase
    .from("nrs_work_logs")
    .select("id, timezone, check_in_at")
    .eq("member_id", member.id)
    .eq("day", day)
    .order("check_in_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (logErr) return jsonError(logErr.message, 500);
  const log = logData as { id: string; timezone: string; check_in_at: string } | null;
  const tz = log?.timezone ?? (await countryTimezone(supabase, member.org_id, member.home_country));

  if (day > localDateInTz(tz)) return jsonError("You can't correct a future day.", 400);
  if (!log && !inTime) return jsonError("There's no entry for this day, so a check-in time is needed.", 400);

  const proposedIn = inTime ? zonedTimeToUtcIso(day, inTime, tz) : null;
  const proposedOut = outTime ? zonedTimeToUtcIso(day, outTime, tz) : null;
  const effectiveIn = proposedIn ?? log?.check_in_at ?? null;
  if (proposedOut && effectiveIn && proposedOut < effectiveIn) {
    return jsonError("Check-out must be after check-in.", 400);
  }

  const admin = createAdminClient();
  const { data: row, error: insErr } = await admin
    .from("nrs_corrections")
    .insert({
      org_id: member.org_id,
      member_id: member.id,
      work_log_id: log?.id ?? null,
      day,
      proposed_check_in: proposedIn,
      proposed_check_out: proposedOut,
      reason,
      status: "pending",
    })
    .select("id")
    .single();
  if (insErr || !row) return jsonError(insErr?.message ?? "Could not save the correction.", 500);
  const correctionId = (row as { id: string }).id;

  const parts = [inTime ? `in ${inTime}` : null, outTime ? `out ${outTime}` : null].filter(Boolean).join(", ");
  try {
    const result = await createRequest("correction", correctionId, member.id, `Correction for ${formatDay(day)} (${parts})`, null, null, {
      createdBy: user.id,
      summary: reason,
      admin,
    });
    if (result.status === "approved") {
      const applied = await applyCorrection(admin, correctionId);
      if (applied.error) console.error("[nrs] apply correction failed", correctionId, applied.error);
    }
    return NextResponse.json({ id: correctionId, requestId: result.requestId, status: result.status });
  } catch (e) {
    await admin.from("nrs_corrections").delete().eq("id", correctionId);
    if (e instanceof NrsApprovalError) return jsonError(e.message, e.status);
    return jsonError("Could not open the approval request.", 500);
  }
}
