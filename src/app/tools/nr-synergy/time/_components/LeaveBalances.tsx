import type { LeaveBalances as Balances, LeaveType, LeaveTypeBalance } from "@/lib/nrs/leave";
import { leave as s, fillLeave as fill, fmtDays } from "@/lib/nrs/i18n/en/leave";
import { formatDay } from "../_lib/tz";

// Leave balance cards for the Time page (server component, no client state).

export function typeLabel(type: LeaveType, consultant: boolean): string {
  return type === "annual" && consultant ? s.consultantAnnual : s.types[type];
}

/** Used | pending | remaining, as one bar. Decorative: numbers are listed next to it. */
export function BalanceBar({ b, className = "" }: { b: LeaveTypeBalance; className?: string }) {
  const total = Math.max(b.entitlement ?? 0, b.used + b.pending, 0);
  const pct = (n: number) => (total > 0 ? `${Math.min(100, (Math.max(0, n) / total) * 100)}%` : "0%");
  const over = b.remaining != null && b.remaining < 0;
  return (
    <div className={`h-2 w-full rounded-full bg-page border border-border overflow-hidden flex ${className}`} aria-hidden>
      <span className={`h-full ${over ? "bg-critical" : "bg-brand"}`} style={{ width: pct(b.used) }} />
      <span
        className="h-full bg-brand/35 bg-[repeating-linear-gradient(135deg,transparent_0_3px,rgba(255,255,255,.55)_3px_6px)]"
        style={{ width: pct(b.pending) }}
      />
    </div>
  );
}

function Card({ b, label }: { b: LeaveTypeBalance; label: string }) {
  const ent = b.entitlement ?? 0;
  const none = ent === 0 && b.used === 0 && b.pending === 0;
  const remaining = b.remaining ?? 0;
  return (
    <li className="rounded-md border border-border bg-surface p-3.5 flex flex-col gap-2.5 min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[12.5px] font-bold text-ink-2 truncate">{label}</h3>
        {b.pending > 0 && (
          <span className="shrink-0 rounded-full bg-warning-wash px-2 py-0.5 text-[10.5px] font-bold text-ink">
            {fill(s.daysShort, { n: fmtDays(b.pending) })} {s.pending.toLowerCase()}
          </span>
        )}
      </div>
      {none ? (
        <p className="text-[12px] text-ink-muted">{s.notEntitled}</p>
      ) : (
        <>
          <p className="flex items-baseline gap-1.5">
            <span className={`text-[26px] leading-none font-bold tabular-nums ${remaining < 0 ? "text-critical" : "text-ink"}`}>
              {fmtDays(remaining)}
            </span>
            <span className="text-[12px] text-ink-muted">/ {fill(s.days, { n: fmtDays(ent) })}</span>
          </p>
          <BalanceBar b={b} />
          <dl className="grid grid-cols-3 gap-1 text-[11px]">
            {[
              [s.used, b.used],
              [s.pending, b.pending],
              [s.remaining, remaining],
            ].map(([k, v]) => (
              <div key={k as string} className="min-w-0">
                <dt className="text-ink-muted">{k}</dt>
                <dd className="font-bold text-ink tabular-nums">{fmtDays(v as number)}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </li>
  );
}

export default function LeaveBalances({ balances, types }: { balances: Balances; types: LeaveType[] }) {
  const consultant = balances.engagementType === "consultant";
  const cards = types.filter((t) => t === "annual" || t === "sick" || t === "personal");
  const unlimited = types.filter((t) => t === "unpaid" || t === "unavailable");
  const prorated = balances.window && balances.proRataFactor < 0.999 && balances.byType.annual.fullEntitlement;
  const source =
    balances.source === "contract" ? s.sourceContract : balances.source === "country_rules" ? s.sourceCountry : s.sourceNone;

  return (
    <section className="rounded-md border border-border bg-surface p-4 flex flex-col gap-3" aria-labelledby="nrs-balances">
      <div className="flex flex-col gap-0.5">
        <h2 id="nrs-balances" className="text-[14px] font-bold text-ink">
          {fill(s.balancesHeading, { year: balances.year })}
        </h2>
        <p className="text-[11.5px] text-ink-muted">
          {source} {prorated && balances.window
            ? fill(s.proRata, {
                from: formatDay(balances.window.from),
                to: formatDay(balances.window.to),
                full: fmtDays(balances.byType.annual.fullEntitlement ?? 0),
              })
            : ""}
        </p>
      </div>
      <ul className={`grid gap-2.5 ${cards.length >= 3 ? "sm:grid-cols-3" : cards.length === 2 ? "sm:grid-cols-2" : "sm:max-w-[360px]"}`}>
        {cards.map((t) => (
          <Card key={t} b={balances.byType[t]} label={typeLabel(t, consultant)} />
        ))}
      </ul>
      {unlimited.length > 0 && (
        <ul className="flex flex-col gap-1">
          {unlimited.map((t) => (
            <li key={t} className="flex items-start gap-2 rounded-sm bg-page px-3 py-2 text-[11.5px] text-ink-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-muted" aria-hidden />
              <span>
                {t === "unpaid" ? s.unpaidNote : s.unavailableNote}
                {balances.byType[t].used > 0 && (
                  <span className="text-ink-muted"> · {s.used}: {fill(s.days, { n: fmtDays(balances.byType[t].used) })}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-ink-muted">{s.balancesHint}</p>
    </section>
  );
}
