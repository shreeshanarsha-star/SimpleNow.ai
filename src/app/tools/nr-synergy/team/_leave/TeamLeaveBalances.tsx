import { getNrsContext } from "@/lib/nrs/member";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { localDateInTz } from "@/lib/nrs/dates";
import type { LeaveBalances, LeaveType, LeaveTypeBalance } from "@/lib/nrs/leave";
import { leave as s, fillLeave as fill, fmtDays } from "@/lib/nrs/i18n/en/leave";
import { loadLeaveBalances } from "../../time/_lib/balances";
import { BalanceBar, typeLabel } from "../../time/_components/LeaveBalances";

// Team · leave balances (server component, self-loading). Managers see their
// direct reports; HR sees every active member of the org.
// Mount anywhere in the Team tab: <TeamLeaveBalances /> (optionally year={2026}).
// Managers' reports are read with the caller's RLS client (manager_id = me);
// HR's list and all balances use the service role, always scoped to the org.

interface ReportRow {
  id: string;
  full_name: string;
  designation: string | null;
  home_country: string;
  joined_on: string | null;
  left_on: string | null;
}

const COLS: LeaveType[] = ["annual", "sick", "personal"];

function Cell({ b, label, consultant }: { b: LeaveTypeBalance; label: string; consultant: boolean }) {
  const ent = b.entitlement ?? 0;
  const empty = ent === 0 && b.used === 0 && b.pending === 0;
  const remaining = b.remaining ?? 0;
  return (
    <div className="min-w-0 flex flex-col gap-1">
      <span className="text-[10.5px] font-semibold text-ink-muted sm:hidden">{typeLabel(b.type, consultant)}</span>
      {empty ? (
        <span className="text-[12.5px] text-ink-muted">
          <span aria-hidden>{s.team.noAllowance}</span>
          <span className="sr-only">{`${label}: ${s.notEntitled}`}</span>
        </span>
      ) : (
        <>
          <span className="sr-only">
            {fill(s.barLabel, {
              type: label,
              used: fmtDays(b.used),
              pending: fmtDays(b.pending),
              remaining: fmtDays(remaining),
              entitlement: fmtDays(ent),
            })}
          </span>
          <span aria-hidden className={`text-[12.5px] font-bold tabular-nums ${remaining < 0 ? "text-critical" : "text-ink"}`}>
            {fill(s.team.remainingOf, { remaining: fmtDays(remaining), entitlement: fmtDays(ent) })}
          </span>
          <BalanceBar b={b} className="max-w-[140px]" />
          {b.pending > 0 && (
            <span aria-hidden className="text-[10.5px] font-semibold text-ink-2">{fill(s.team.pendingTag, { n: fmtDays(b.pending) })}</span>
          )}
        </>
      )}
    </div>
  );
}

export default async function TeamLeaveBalances({ year }: { year?: number } = {}) {
  const ctx = await getNrsContext();
  const me = ctx?.member;
  const hr = !!ctx?.isHr;
  const shell = (children: React.ReactNode) => (
    <section className="rounded-md border border-border bg-surface p-4 flex flex-col gap-3" aria-labelledby="nrs-team-leave">
      <div className="flex flex-col gap-0.5">
        <h2 id="nrs-team-leave" className="text-[14px] font-bold text-ink">
          {s.team.heading}
        </h2>
        <p className="text-[11.5px] text-ink-muted">{fill(hr ? s.team.hintHr : s.team.hint, { year: year ?? Number(localDateInTz("UTC").slice(0, 4)) })}</p>
      </div>
      {children}
    </section>
  );
  if (!ctx || !ctx.orgId || (!me && !hr)) return shell(<p className="text-[12.5px] text-ink-muted">{s.team.empty}</p>);
  const orgId = ctx.orgId;
  const y = year ?? Number(localDateInTz("UTC").slice(0, 4));

  let reports: ReportRow[];
  let balances: Map<string, Map<number, LeaveBalances>>;
  try {
    const admin = createAdminClient();
    let q = (hr ? admin : await createClient())
      .from("nrs_members")
      .select("id, full_name, designation, home_country, joined_on, left_on")
      .eq("org_id", orgId)
      .eq("status", "active")
      .is("deleted_at", null);
    if (!hr && me) q = q.eq("manager_id", me.id);
    const { data, error } = await q.order("full_name", { ascending: true }).limit(500);
    if (error) throw new Error(error.message);
    reports = (data ?? []) as ReportRow[];
    balances = await loadLeaveBalances(admin, orgId, reports, [y]);
  } catch {
    return shell(
      <p role="alert" className="text-[12.5px] text-critical">
        {s.team.error}
      </p>
    );
  }
  if (!reports.length) return shell(<p className="text-[12.5px] text-ink-muted">{hr ? s.team.emptyHr : s.team.empty}</p>);

  return shell(
    <div className="flex flex-col">
      <div
        className="hidden sm:grid grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))_minmax(0,0.8fr)] gap-3 border-b border-border pb-2 text-[11px] font-semibold text-ink-muted"
        aria-hidden
      >
        <span>{s.team.member}</span>
        {COLS.map((t) => (
          <span key={t}>{s.types[t]}</span>
        ))}
        <span>{s.team.unpaidUsed}</span>
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {reports.map((r) => {
          const b = balances.get(r.id)?.get(y);
          const consultant = b?.engagementType === "consultant";
          return (
            <li
              key={r.id}
              className="py-3 grid grid-cols-3 sm:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))_minmax(0,0.8fr)] gap-x-3 gap-y-2 items-start"
            >
              <div className="col-span-3 sm:col-span-1 min-w-0">
                <p className="text-[13px] font-bold text-ink truncate">{r.full_name}</p>
                <p className="text-[11.5px] text-ink-muted truncate">
                  {[r.designation, r.home_country, s.team.engagement[b?.engagementType ?? "none"]].filter(Boolean).join(" · ")}
                </p>
              </div>
              {b ? (
                <>
                  {COLS.map((t) => (
                    <Cell key={t} b={b.byType[t]} label={typeLabel(t, consultant)} consultant={consultant} />
                  ))}
                  <div className="col-span-3 sm:col-span-1 text-[12px] text-ink-2">
                    <span className="sm:hidden text-ink-muted">{s.team.unpaidUsed}: </span>
                    <span className="tabular-nums">{fill(s.days, { n: fmtDays(b.byType.unpaid.used) })}</span>
                  </div>
                </>
              ) : (
                <p className="col-span-3 sm:col-span-4 text-[12px] text-ink-muted">{s.sourceNone}</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
