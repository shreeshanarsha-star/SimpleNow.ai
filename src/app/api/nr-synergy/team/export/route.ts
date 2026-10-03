import * as XLSX from "xlsx";
import { requireNrs } from "@/lib/nrs/member";
import { logAudit } from "@/lib/nrs/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUseTeam, loadTeamMembers, resolveScope } from "@/app/tools/nr-synergy/team/_lib/data";
import { formatTimeInTz, hoursBetween, isMonth, monthBounds } from "@/app/tools/nr-synergy/time/_lib/tz";
import { jsonError } from "../../time/_lib/server";

interface LogRow {
  member_id: string;
  day: string;
  check_in_at: string;
  check_out_at: string | null;
  timezone: string;
  mode: string;
  city: string | null;
  country_code: string | null;
  is_travel: boolean;
  source: string;
}

interface LeaveRow {
  member_id: string;
  type: string;
  starts_on: string;
  ends_on: string;
  working_days: number | string;
  status: string;
}

// GET /api/nr-synergy/team/export?month=yyyy-mm&scope=reports|all
// Attendance / work-log workbook for the caller's team (managers, HR).
export async function GET(req: Request) {
  let g: Awaited<ReturnType<typeof requireNrs>>;
  try {
    g = await requireNrs();
  } catch (res) {
    return res as Response;
  }
  const { ctx, supabase, user } = g;
  if (!canUseTeam(ctx)) return jsonError("This export is for people managers and HR.", 403);

  const url = new URL(req.url);
  const month = url.searchParams.get("month");
  if (!isMonth(month)) return jsonError("Choose a month (yyyy-mm).", 400);
  const scope = resolveScope(ctx, url.searchParams.get("scope"));
  const { first, last } = monthBounds(month);

  let members;
  try {
    members = await loadTeamMembers(supabase, ctx, scope);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Could not load your team.", 500);
  }
  const ids = members.map((m) => m.id);

  let logs: LogRow[] = [];
  let leaves: LeaveRow[] = [];
  if (ids.length) {
    const [logRes, leaveRes] = await Promise.all([
      supabase
        .from("nrs_work_logs")
        .select("member_id, day, check_in_at, check_out_at, timezone, mode, city, country_code, is_travel, source")
        .in("member_id", ids)
        .gte("day", first)
        .lte("day", last)
        .order("day", { ascending: true }),
      supabase
        .from("nrs_leave_requests")
        .select("member_id, type, starts_on, ends_on, working_days, status")
        .in("member_id", ids)
        .in("status", ["pending", "approved"])
        .lte("starts_on", last)
        .gte("ends_on", first)
        .order("starts_on", { ascending: true }),
    ]);
    if (logRes.error) return jsonError(logRes.error.message, 500);
    if (leaveRes.error) return jsonError(leaveRes.error.message, 500);
    logs = (logRes.data ?? []) as LogRow[];
    leaves = (leaveRes.data ?? []) as LeaveRow[];
  }

  const byId = new Map(members.map((m) => [m.id, m]));
  const attendance = logs.map((l) => {
    const m = byId.get(l.member_id);
    return {
      Name: m?.full_name ?? "",
      Email: m?.email ?? "",
      "Home country": m?.home_country ?? "",
      Date: l.day,
      "Check in": formatTimeInTz(l.check_in_at, l.timezone),
      "Check out": l.check_out_at ? formatTimeInTz(l.check_out_at, l.timezone) : "",
      Hours: l.check_out_at ? Number(hoursBetween(l.check_in_at, l.check_out_at)) : "",
      "Time zone": l.timezone,
      Mode: l.mode.replace(/_/g, " "),
      City: l.city ?? "",
      Country: l.country_code ?? "",
      Travel: l.is_travel ? "yes" : "",
      Source: l.source,
    };
  });
  const leaveRows = leaves.map((l) => {
    const m = byId.get(l.member_id);
    return {
      Name: m?.full_name ?? "",
      Email: m?.email ?? "",
      Type: l.type,
      From: l.starts_on,
      To: l.ends_on,
      "Working days": Number(l.working_days),
      Status: l.status,
    };
  });
  const summary = members.map((m) => {
    const mine = logs.filter((l) => l.member_id === m.id);
    const hours = mine.reduce(
      (sum, l) => sum + (l.check_out_at ? Number(hoursBetween(l.check_in_at, l.check_out_at)) : 0),
      0
    );
    return {
      Name: m.full_name,
      Email: m.email,
      "Home country": m.home_country,
      "Days logged": new Set(mine.map((l) => l.day)).size,
      Hours: Math.round(hours * 10) / 10,
      "Leave days (approved)": leaves
        .filter((l) => l.member_id === m.id && l.status === "approved")
        .reduce((sum, l) => sum + Number(l.working_days), 0),
    };
  });

  const book = XLSX.utils.book_new();
  const sheet = (rows: Record<string, string | number>[], header: string[]) =>
    XLSX.utils.json_to_sheet(rows, { header });
  XLSX.utils.book_append_sheet(
    book,
    sheet(summary, ["Name", "Email", "Home country", "Days logged", "Hours", "Leave days (approved)"]),
    "Summary"
  );
  XLSX.utils.book_append_sheet(
    book,
    sheet(attendance, [
      "Name",
      "Email",
      "Home country",
      "Date",
      "Check in",
      "Check out",
      "Hours",
      "Time zone",
      "Mode",
      "City",
      "Country",
      "Travel",
      "Source",
    ]),
    "Attendance"
  );
  XLSX.utils.book_append_sheet(
    book,
    sheet(leaveRows, ["Name", "Email", "Type", "From", "To", "Working days", "Status"]),
    "Leave"
  );
  const buf = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;

  await logAudit(createAdminClient(), {
    orgId: ctx.orgId,
    actorUser: user.id,
    entity: "nrs_work_logs",
    action: "export",
    context: { month, scope, members: ids.length, rows: logs.length },
  });

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="nr-synergy-attendance-${month}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
