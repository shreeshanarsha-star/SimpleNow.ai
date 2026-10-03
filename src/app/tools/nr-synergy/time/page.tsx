import Link from "next/link";
import Icon from "@/components/Icon";
import { getNrsContext, hasNrsAccess } from "@/lib/nrs/member";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestableTypes, type LeaveBalances as Balances } from "@/lib/nrs/leave";
import { leave as ls } from "@/lib/nrs/i18n/en/leave";
import { addDays, eachDay, isoWeekday, loadCountryCalendar, localDateInTz, type CountryCalendar } from "@/lib/nrs/dates";
import { t } from "@/lib/nrs/i18n/en";
import { time as s, fillTime as fill } from "@/lib/nrs/i18n/en/time";
import { canOpenTab, nrsTab } from "@/lib/nrs/tabs";
import NrsState from "../_components/NrsState";
import TodayCard, { type OpenLog } from "./_components/TodayCard";
import LeaveForm from "./_components/LeaveForm";
import CorrectionForm from "./_components/CorrectionForm";
import LeaveBalances from "./_components/LeaveBalances";
import { loadLeaveBalances } from "./_lib/balances";
import { formatDay, formatMonth, formatTimeInTz, hoursBetween, isMonth, isValidTimeZone, monthBounds, shiftMonth } from "./_lib/tz";

export const dynamic = "force-dynamic";

interface LogRow {
  id: string;
  day: string;
  check_in_at: string;
  check_out_at: string | null;
  timezone: string;
  mode: keyof typeof s.modes;
  city: string | null;
  country_code: string | null;
  is_travel: boolean;
  source: string;
}

interface LeaveRow {
  id: string;
  type: keyof typeof s.leaveTypes;
  starts_on: string;
  ends_on: string;
  working_days: number | string;
  status: keyof typeof s.status;
  created_at: string;
}

interface CorrectionRow {
  id: string;
  day: string;
  status: keyof typeof s.status;
  reason: string;
  created_at: string;
}

const card = "rounded-md border border-border bg-surface p-4 flex flex-col gap-3";
const h2 = "text-[14px] font-bold text-ink";

const STATUS_TONE: Record<string, string> = {
  pending: "bg-warning-wash text-ink",
  approved: "bg-good-wash text-good-text",
  applied: "bg-good-wash text-good-text",
  rejected: "bg-critical-wash text-critical",
  sent_back: "bg-critical-wash text-critical",
  cancelled: "bg-page text-ink-muted",
};

export default async function NrSynergyTimePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getNrsContext();
  if (!hasNrsAccess(ctx)) return null;
  if (!canOpenTab(nrsTab("time"), ctx)) {
    return <NrsState icon="x" title={t("common.notAvailableTitle")} body={t("common.featureOff")} />;
  }
  const member = ctx.member;
  if (!member) return <NrsState icon="clock" title={s.title} body={s.noMember} />;

  const payroll = ctx.engagementType === "payroll";
  const title = payroll ? s.titleAttendance : s.titleWorkLog;
  const supabase = await createClient();

  const { data: countryRow } = await supabase
    .from("nrs_countries")
    .select("name, timezone")
    .eq("org_id", member.org_id)
    .eq("code", member.home_country)
    .maybeSingle();
  const country = countryRow as { name: string; timezone: string } | null;
  const tz = isValidTimeZone(country?.timezone) ? (country?.timezone as string) : "UTC";
  const today = localDateInTz(tz);

  const sp = await searchParams;
  const rawMonth = typeof sp.month === "string" ? sp.month : null;
  const month = isMonth(rawMonth) ? rawMonth : today.slice(0, 7);
  const { first, last } = monthBounds(month);

  let monthCal: CountryCalendar;
  let wideCal: CountryCalendar;
  let logs: LogRow[];
  let openLog: OpenLog | null;
  let leaves: LeaveRow[];
  let corrections: CorrectionRow[];
  try {
    const [mc, wc, logsRes, openRes, leaveRes, corrRes] = await Promise.all([
      loadCountryCalendar(supabase, member.org_id, member.home_country, first, last),
      loadCountryCalendar(supabase, member.org_id, member.home_country, addDays(today, -60), addDays(today, 400)),
      supabase
        .from("nrs_work_logs")
        .select("id, day, check_in_at, check_out_at, timezone, mode, city, country_code, is_travel, source")
        .eq("member_id", member.id)
        .gte("day", first)
        .lte("day", last)
        .order("check_in_at", { ascending: true }),
      supabase
        .from("nrs_work_logs")
        .select("id, day, check_in_at, check_out_at, timezone, mode, city, country_code, is_travel, source")
        .eq("member_id", member.id)
        .is("check_out_at", null)
        .order("check_in_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("nrs_leave_requests")
        .select("id, type, starts_on, ends_on, working_days, status, created_at")
        .eq("member_id", member.id)
        .order("starts_on", { ascending: false })
        .limit(60),
      supabase
        .from("nrs_corrections")
        .select("id, day, status, reason, created_at")
        .eq("member_id", member.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    for (const r of [logsRes, openRes, leaveRes, corrRes]) if (r.error) throw new Error(r.error.message);
    monthCal = mc;
    wideCal = wc;
    logs = (logsRes.data ?? []) as LogRow[];
    openLog = (openRes.data as OpenLog | null) ?? null;
    leaves = (leaveRes.data ?? []) as LeaveRow[];
    corrections = (corrRes.data ?? []) as CorrectionRow[];
  } catch {
    return (
      <NrsState icon="x" title={t("common.error")} body={s.errorGeneric} action={{ href: "/tools/nr-synergy/time", label: t("common.retry") }} />
    );
  }

  // Leave balances: this year (cards) and next year (form check for requests across Dec 31).
  const year = Number(today.slice(0, 4));
  let balances: Map<number, Balances> | null = null;
  try {
    const all = await loadLeaveBalances(
      createAdminClient(),
      member.org_id,
      [{ id: member.id, home_country: member.home_country, joined_on: member.joined_on, left_on: member.left_on }],
      [year, year + 1]
    );
    balances = all.get(member.id) ?? null;
  } catch {
    balances = null;
  }

  const todayLogs = logs.filter((l) => l.day === today);
  const lastToday = todayLogs.length ? todayLogs[todayLogs.length - 1] : null;
  const doneToday =
    !openLog && lastToday?.check_out_at
      ? { time: formatTimeInTz(lastToday.check_out_at, lastToday.timezone), hours: hoursBetween(lastToday.check_in_at, lastToday.check_out_at) }
      : null;

  // Calendar cells (Monday first).
  const days = eachDay(first, last);
  const lead = isoWeekday(first) - 1;
  const working = new Set(monthCal.workingDays);
  const holidayName = new Map(monthCal.holidayList.map((h) => [h.day, h.name]));
  const leaveOn = (day: string) =>
    leaves.find((l) => (l.status === "approved" || l.status === "pending") && l.starts_on <= day && l.ends_on >= day) ?? null;
  const logDays = new Set(logs.map((l) => l.day));

  const yearEnd = `${today.slice(0, 4)}-12-31`;
  const upcomingHolidays = wideCal.holidayList.filter((h) => h.day >= today && h.day <= yearEnd);

  const leaveTypes = requestableTypes(ctx.engagementType);
  const thisYear = balances?.get(year) ?? null;
  const formBalances = balances
    ? Object.fromEntries(
        Array.from(balances.entries()).map(([y, b]) => [
          y,
          Object.fromEntries(
            leaveTypes.map((lt) => [lt, { entitlement: b.byType[lt].entitlement, pending: b.byType[lt].pending, available: b.byType[lt].available }])
          ),
        ])
      )
    : null;

  const requests = [
    ...leaves.slice(0, 20).map((l) => ({
      id: l.id,
      at: l.created_at,
      label: fill(s.requestLeave, { type: s.leaveTypes[l.type] ?? l.type, from: formatDay(l.starts_on), to: formatDay(l.ends_on) }),
      status: l.status,
    })),
    ...corrections.map((c) => ({
      id: c.id,
      at: c.created_at,
      label: fill(s.requestCorrection, { day: formatDay(c.day) }),
      status: c.status,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 15);

  const weekdays = s.weekdaysShort.split(",");

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-[22px] sm:text-[26px] font-bold text-ink tracking-tight">{title}</h1>
        <p className="text-[13px] text-ink-muted">{payroll ? s.subtitleAttendance : s.subtitleWorkLog}</p>
      </header>

      {thisYear ? (
        <LeaveBalances balances={thisYear} types={leaveTypes} />
      ) : (
        <p role="status" className="rounded-md border border-border bg-surface px-4 py-3 text-[12.5px] text-ink-muted">
          {ls.balancesError}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-4 min-w-0">
          <TodayCard payroll={payroll} openLog={openLog} done={doneToday} />

          <section className={card} aria-labelledby="nrs-month">
            <div className="flex items-center justify-between gap-2">
              <h2 id="nrs-month" className={h2}>
                {formatMonth(month)}
              </h2>
              <div className="flex items-center gap-1">
                <Link
                  href={`/tools/nr-synergy/time?month=${shiftMonth(month, -1)}`}
                  aria-label={s.prevMonth}
                  className="w-8 h-8 rounded-sm flex items-center justify-center text-ink-2 hover:bg-page focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <Icon name="chevronLeft" className="w-4 h-4" />
                </Link>
                {month !== today.slice(0, 7) && (
                  <Link
                    href="/tools/nr-synergy/time"
                    className="px-2 h-8 rounded-sm flex items-center text-[12px] font-bold text-brand-dark hover:bg-page focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    {s.thisMonth}
                  </Link>
                )}
                <Link
                  href={`/tools/nr-synergy/time?month=${shiftMonth(month, 1)}`}
                  aria-label={s.nextMonth}
                  className="w-8 h-8 rounded-sm flex items-center justify-center text-ink-2 hover:bg-page focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <Icon name="chevronRight" className="w-4 h-4" />
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center" aria-hidden>
              {weekdays.map((w) => (
                <span key={w} className="text-[10.5px] font-semibold text-ink-muted">
                  {w}
                </span>
              ))}
            </div>
            <ol className="grid grid-cols-7 gap-1">
              {Array.from({ length: lead }, (_, i) => (
                <li key={`pad-${i}`} aria-hidden />
              ))}
              {days.map((day) => {
                const holiday = holidayName.get(day);
                const leave = leaveOn(day);
                const worked = logDays.has(day);
                const off = !working.has(isoWeekday(day));
                const labels = [
                  formatDay(day),
                  worked ? s.legendWorked : null,
                  leave ? (leave.status === "approved" ? s.legendLeave : s.legendPendingLeave) : null,
                  holiday ? `${s.legendHoliday}: ${holiday}` : null,
                  off && !holiday ? s.legendOff : null,
                ].filter(Boolean);
                const tone = holiday
                  ? "bg-warning-wash"
                  : leave
                    ? leave.status === "approved"
                      ? "bg-brand-wash"
                      : "bg-surface border-dashed !border-brand"
                    : off
                      ? "bg-page"
                      : "bg-surface";
                return (
                  <li
                    key={day}
                    aria-label={labels.join(", ")}
                    title={labels.join(" · ")}
                    className={`relative aspect-square min-h-[38px] rounded-sm border border-border flex flex-col items-center justify-center ${tone} ${
                      day === today ? "ring-2 ring-brand" : ""
                    }`}
                  >
                    <span className={`text-[12px] ${off ? "text-ink-muted" : "text-ink"} font-semibold`}>{Number(day.slice(8))}</span>
                    {worked && <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-good" aria-hidden />}
                  </li>
                );
              })}
            </ol>
            <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-muted">
              <li className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-good" aria-hidden />
                {s.legendWorked}
              </li>
              <li className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-brand-wash border border-border" aria-hidden />
                {s.legendLeave}
              </li>
              <li className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-warning-wash border border-border" aria-hidden />
                {s.legendHoliday}
              </li>
              <li className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-page border border-border" aria-hidden />
                {s.legendOff}
              </li>
            </ul>

            <div className="border-t border-border pt-3">
              <h3 className="text-[12.5px] font-bold text-ink mb-2">{s.monthEntries}</h3>
              {logs.length === 0 ? (
                <p className="text-[12.5px] text-ink-muted">{s.monthEmpty}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {logs.map((l) => (
                    <li key={l.id} className="py-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px]">
                      <span className="font-semibold text-ink w-[92px]">{formatDay(l.day)}</span>
                      <span className="text-ink-2">
                        {formatTimeInTz(l.check_in_at, l.timezone)}–{l.check_out_at ? formatTimeInTz(l.check_out_at, l.timezone) : s.openLog}
                      </span>
                      {l.check_out_at && (
                        <span className="text-ink-muted">{fill(s.hours, { h: hoursBetween(l.check_in_at, l.check_out_at) })}</span>
                      )}
                      <span className="text-ink-muted">{s.modes[l.mode] ?? l.mode}</span>
                      {l.city && <span className="text-ink-muted">{l.city}</span>}
                      {l.is_travel && (
                        <span className="rounded-full bg-brand-wash px-1.5 text-[10.5px] font-bold text-brand-dark">{s.travelBadge}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <CorrectionForm today={today} />
        </div>

        <div className="flex flex-col gap-4 min-w-0">
          <LeaveForm
            today={today}
            types={leaveTypes}
            workingDays={wideCal.workingDays}
            holidays={wideCal.holidayList.map((h) => h.day)}
            balances={formBalances}
            consultant={ctx.engagementType === "consultant"}
          />

          <section className={card} aria-labelledby="nrs-requests">
            <h2 id="nrs-requests" className={h2}>
              {s.requestsHeading}
            </h2>
            {requests.length === 0 ? (
              <p className="text-[12.5px] text-ink-muted">{s.requestsEmpty}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {requests.map((r) => (
                  <li key={r.id} className="py-2 flex items-center justify-between gap-2 text-[12.5px]">
                    <span className="text-ink min-w-0">{r.label}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${STATUS_TONE[r.status] ?? "bg-page"}`}>
                      {s.status[r.status] ?? r.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={card} aria-labelledby="nrs-holidays">
            <h2 id="nrs-holidays" className={h2}>
              {fill(s.holidaysHeading, { country: country?.name ?? member.home_country })}
            </h2>
            {upcomingHolidays.length === 0 ? (
              <p className="text-[12.5px] text-ink-muted">{s.holidaysEmpty}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {upcomingHolidays.map((h) => (
                  <li key={h.day} className="py-1.5 flex items-center justify-between gap-2 text-[12.5px]">
                    <span className="text-ink">{h.name}</span>
                    <span className="text-ink-muted shrink-0">{formatDay(h.day)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}
