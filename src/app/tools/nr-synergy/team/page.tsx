import Link from "next/link";
import { getNrsContext, hasNrsAccess } from "@/lib/nrs/member";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { localDateInTz } from "@/lib/nrs/dates";
import { t } from "@/lib/nrs/i18n/en";
import { team as s, fillTeam as fill } from "@/lib/nrs/i18n/en/team";
import { time as ts } from "@/lib/nrs/i18n/en/time";
import NrsState from "../_components/NrsState";
import ApprovalCard from "./_components/ApprovalCard";
import ExportForm from "./_components/ExportForm";
import { formatDay } from "../time/_lib/tz";
import {
  canUseTeam,
  loadApprovalQueue,
  loadTeamMembers,
  loadTeamOverview,
  resolveScope,
  type QueueItem,
  type TeamLeaveRow,
  type TeamUpdateRow,
  type TodayRow,
} from "./_lib/data";

export const dynamic = "force-dynamic";

const BASE = "/tools/nr-synergy/team";
const card = "rounded-md border border-border bg-surface p-4 flex flex-col gap-3";
const h2 = "text-[14px] font-bold text-ink";

const PROJECT_TONE: Record<string, string> = {
  on_track: "bg-good-wash text-good-text",
  at_risk: "bg-warning-wash text-ink",
  blocked: "bg-critical-wash text-critical",
  completed: "bg-page text-ink-muted",
};

export default async function NrSynergyTeamPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getNrsContext();
  if (!hasNrsAccess(ctx)) return null;
  if (!canUseTeam(ctx)) {
    return <NrsState icon="x" title={t("common.notAvailableTitle")} body={s.forbidden} />;
  }

  const sp = await searchParams;
  const tab = sp.tab === "team" ? "team" : "approvals";
  const scope = resolveScope(ctx, typeof sp.scope === "string" ? sp.scope : null);

  let queue: QueueItem[] = [];
  let today: TodayRow[] = [];
  let leave: TeamLeaveRow[] = [];
  let updates: TeamUpdateRow[] = [];
  try {
    if (tab === "approvals") {
      queue = await loadApprovalQueue(createAdminClient(), ctx);
    } else {
      const supabase = await createClient();
      const members = await loadTeamMembers(supabase, ctx, scope);
      ({ today, leave, updates } = await loadTeamOverview(supabase, members));
    }
  } catch {
    return <NrsState icon="x" title={t("common.error")} body={s.errorGeneric} action={{ href: `${BASE}?tab=${tab}`, label: t("common.retry") }} />;
  }

  const tabCls = (active: boolean) =>
    `px-3 py-1.5 rounded-sm text-[12.5px] font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
      active ? "bg-brand-wash text-brand-dark" : "text-ink-2 hover:text-ink"
    }`;
  const thisMonth = localDateInTz("UTC").slice(0, 7);

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-[22px] sm:text-[26px] font-bold text-ink tracking-tight">{s.title}</h1>
        <p className="text-[13px] text-ink-muted">{s.subtitle}</p>
      </header>

      <nav aria-label={s.tabsLabel} className="inline-flex self-start rounded-md border border-border p-0.5 bg-surface">
        <Link href={`${BASE}?tab=approvals`} aria-current={tab === "approvals" ? "page" : undefined} className={tabCls(tab === "approvals")}>
          {s.tabApprovals}
        </Link>
        <Link href={`${BASE}?tab=team`} aria-current={tab === "team" ? "page" : undefined} className={tabCls(tab === "team")}>
          {s.tabMyTeam}
        </Link>
      </nav>

      {tab === "approvals" ? (
        <section className="flex flex-col gap-3" aria-labelledby="nrs-queue">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="nrs-queue" className={h2}>
              {s.approvalsHeading}
            </h2>
            {queue.length > 0 && <span className="text-[12px] text-ink-muted">{fill(s.approvalsCount, { count: queue.length })}</span>}
          </div>
          {queue.length === 0 ? (
            <NrsState icon="check" title={s.approvalsHeading} body={s.approvalsEmpty} />
          ) : (
            <ul className="flex flex-col gap-3">
              {queue.map((item) => (
                <li key={item.stepId}>
                  <ApprovalCard item={item} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <div className="flex flex-col gap-4">
          {ctx.isHr && ctx.member && (
            <nav aria-label={s.scopeLabel} className="flex items-center gap-2 text-[12.5px]">
              <span className="text-ink-muted">{s.scopeLabel}:</span>
              <Link href={`${BASE}?tab=team&scope=reports`} aria-current={scope === "reports" ? "page" : undefined} className={tabCls(scope === "reports")}>
                {s.scopeReports}
              </Link>
              <Link href={`${BASE}?tab=team&scope=all`} aria-current={scope === "all" ? "page" : undefined} className={tabCls(scope === "all")}>
                {s.scopeAll}
              </Link>
            </nav>
          )}

          <section className={card} aria-labelledby="nrs-today">
            <h2 id="nrs-today" className={h2}>
              {s.myTeamHeading}
            </h2>
            {today.length === 0 ? (
              <p className="text-[12.5px] text-ink-muted">{s.teamEmpty}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {today.map((r) => (
                  <li key={r.memberId} className="py-2 flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3 text-[12.5px]">
                    <span className="sm:w-[34%] min-w-0">
                      <span className="block font-bold text-ink truncate">{r.name}</span>
                      {r.designation && <span className="block text-[11.5px] text-ink-muted truncate">{r.designation}</span>}
                    </span>
                    <span className="sm:w-[26%]">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          r.status === "in"
                            ? "bg-good-wash text-good-text"
                            : r.status === "leave"
                              ? "bg-brand-wash text-brand-dark"
                              : r.status === "out"
                                ? "bg-page text-ink-2"
                                : "bg-page text-ink-muted"
                        }`}
                      >
                        {r.status === "in"
                          ? fill(s.statusIn, { time: r.time ?? "" })
                          : r.status === "out"
                            ? fill(s.statusOut, { time: r.time ?? "" })
                            : r.status === "leave"
                              ? s.statusOnLeave
                              : s.statusNone}
                      </span>
                    </span>
                    <span className="text-ink-2 sm:w-[20%]">
                      <span className="sr-only">{s.colMode}: </span>
                      {r.mode ? ts.modes[r.mode as keyof typeof ts.modes] ?? r.mode : ""}
                    </span>
                    <span className="text-ink-muted sm:flex-1">
                      <span className="sr-only">{s.colCity}: </span>
                      {r.city ?? ""}
                      {r.isTravel ? ` · ${ts.travelBadge}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className={card} aria-labelledby="nrs-team-leave">
              <h2 id="nrs-team-leave" className={h2}>
                {s.leaveHeading}
              </h2>
              {leave.length === 0 ? (
                <p className="text-[12.5px] text-ink-muted">{s.leaveEmpty}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {leave.map((l) => (
                    <li key={l.id} className="py-2 flex items-start justify-between gap-2 text-[12.5px]">
                      <span className="min-w-0">
                        <span className="block font-bold text-ink">{l.name}</span>
                        <span className="block text-ink-muted">
                          {fill(s.leaveRow, {
                            type: s.leaveTypes[l.type as keyof typeof s.leaveTypes] ?? l.type,
                            from: formatDay(l.startsOn),
                            to: formatDay(l.endsOn),
                            days: l.workingDays,
                          })}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                          l.status === "approved" ? "bg-good-wash text-good-text" : "bg-warning-wash text-ink"
                        }`}
                      >
                        {ts.status[l.status as keyof typeof ts.status] ?? l.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={card} aria-labelledby="nrs-team-updates">
              <h2 id="nrs-team-updates" className={h2}>
                {s.updatesHeading}
              </h2>
              {updates.length === 0 ? (
                <p className="text-[12.5px] text-ink-muted">{s.updatesEmpty}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {updates.map((u) => (
                    <li key={u.id} className="py-2 flex flex-col gap-1 text-[12.5px]">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-bold text-ink min-w-0 truncate">{u.project}</span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${PROJECT_TONE[u.status] ?? "bg-page"}`}>
                          {s.projectStatus[u.status as keyof typeof s.projectStatus] ?? u.status}
                        </span>
                      </span>
                      <span className="text-[11.5px] text-ink-muted">
                        {u.name} · {fill(s.weekOf, { date: formatDay(u.weekOf) })}
                      </span>
                      <span className="text-ink-2 whitespace-pre-line line-clamp-3">{u.progress}</span>
                      {u.challenges && <span className="text-ink-muted whitespace-pre-line line-clamp-2">{u.challenges}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <ExportForm defaultMonth={thisMonth} scope={scope} />
        </div>
      )}
    </section>
  );
}
