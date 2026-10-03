"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { workingDaysBetween } from "@/lib/nrs/dates";
import { isUnlimitedType, splitWorkingDaysByYear, type LeaveType } from "@/lib/nrs/leave";
import { leave as ls, fillLeave, fmtDays } from "@/lib/nrs/i18n/en/leave";
import { time as s, fillTime as fill } from "@/lib/nrs/i18n/en/time";
import { t } from "@/lib/nrs/i18n/en";
import { postJson } from "../_lib/client";

export interface FormTypeBalance {
  entitlement: number | null;
  pending: number;
  available: number | null;
}
/** year -> type -> balance */
export type FormBalances = Record<string, Partial<Record<LeaveType, FormTypeBalance>>>;

const input =
  "w-full rounded-sm border border-border bg-surface px-3 py-2 text-[13px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand";

export default function LeaveForm({
  today,
  types,
  workingDays,
  holidays,
  balances,
  consultant = false,
}: {
  today: string;
  types: LeaveType[];
  workingDays: number[];
  holidays: string[];
  /** null when balances couldn't be loaded (the server still checks). */
  balances: FormBalances | null;
  consultant?: boolean;
}) {
  const router = useRouter();
  const ids = useId();
  const [type, setType] = useState<LeaveType>(types[0] ?? "annual");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const holidaySet = useMemo(() => new Set(holidays), [holidays]);
  const count = useMemo(() => {
    if (!from || !to || to < from) return null;
    try {
      return workingDaysBetween(from, to, { workingDays, holidays: holidaySet });
    } catch {
      return null;
    }
  }, [from, to, workingDays, holidaySet]);

  const label = (lt: LeaveType) => (lt === "annual" && consultant ? ls.consultantAnnual : s.leaveTypes[lt]);
  const thisYear = today.slice(0, 4);
  const current = balances?.[thisYear]?.[type] ?? null;

  // Client-side balance check per calendar year (the API re-checks).
  const shortfall = useMemo(() => {
    if (!balances || isUnlimitedType(type) || !from || !to || to < from) return null;
    let split: Map<number, number>;
    try {
      split = splitWorkingDaysByYear(from, to, { workingDays, holidays: holidaySet });
    } catch {
      return null;
    }
    for (const [year, requested] of Array.from(split.entries())) {
      const b = balances[String(year)]?.[type];
      if (!b) continue;
      const available = Math.max(0, b.available ?? 0);
      if (requested > available + 1e-9) {
        return (b.entitlement ?? 0) <= 0
          ? fillLeave(ls.formNoAllowance, { type: label(type).toLowerCase(), year })
          : fillLeave(ls.formExceeds, { requested: fmtDays(requested), available: fmtDays(available), year });
      }
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balances, type, from, to, workingDays, holidaySet, consultant]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (shortfall) {
      setError(shortfall);
      return;
    }
    setError(null);
    setSuccess(null);
    setBusy(true);
    const res = await postJson<{ status: "pending" | "approved" }>("/api/nr-synergy/time/leave", {
      type,
      starts_on: from,
      ends_on: to,
      note: note.trim() || null,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSuccess(res.data.status === "approved" ? s.leaveSentApproved : s.leaveSent);
    setNote("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="rounded-md border border-border bg-surface p-4 flex flex-col gap-3" aria-labelledby={`${ids}-h`}>
      <h2 id={`${ids}-h`} className="text-[14px] font-bold text-ink">
        {s.leaveHeading}
      </h2>
      <label className="flex flex-col gap-1">
        <span className="text-[11.5px] font-semibold text-ink-muted">{s.leaveType}</span>
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value as LeaveType);
            setError(null);
          }}
          aria-describedby={`${ids}-bal`}
          className={input}
        >
          {types.map((lt) => (
            <option key={lt} value={lt}>
              {label(lt)}
            </option>
          ))}
        </select>
      </label>
      <p id={`${ids}-bal`} className="-mt-1 text-[11.5px] text-ink-muted">
        {isUnlimitedType(type)
          ? fillLeave(ls.formUnlimited, { type: label(type) })
          : current
            ? `${fillLeave(ls.formRemaining, {
                type: label(type),
                available: fmtDays(Math.max(0, current.available ?? 0)),
                entitlement: fmtDays(current.entitlement ?? 0),
              })}${current.pending > 0 ? ` ${fillLeave(ls.formRemainingPending, { pending: fmtDays(current.pending) })}` : ""}`
            : ""}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-semibold text-ink-muted">{s.leaveFrom}</span>
          <input
            type="date"
            required
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              if (to < e.target.value) setTo(e.target.value);
            }}
            className={input}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-semibold text-ink-muted">{s.leaveTo}</span>
          <input type="date" required min={from} value={to} onChange={(e) => setTo(e.target.value)} className={input} />
        </label>
      </div>
      <div aria-live="polite" className="flex flex-col gap-1">
        <p className="text-[12px] text-ink-2">
          {count == null ? "" : count === 0 ? s.leaveNoWorkingDays : count === 1 ? s.leaveWorkingDaysOne : fill(s.leaveWorkingDays, { count })}
        </p>
        {shortfall && (
          <p className="rounded-sm bg-critical-wash px-2.5 py-1.5 text-[12px] font-semibold text-critical">{shortfall}</p>
        )}
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-[11.5px] font-semibold text-ink-muted">{s.leaveNote}</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} className={input} />
      </label>
      <button
        type="submit"
        disabled={busy || !count || !!shortfall}
        className="self-start rounded-sm bg-brand text-white px-4 py-2 text-[13px] font-bold shadow-soft-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {busy ? t("common.loading") : s.leaveSubmit}
      </button>
      <div aria-live="polite">
        {success && <p className="text-[12px] font-semibold text-good-text">{success}</p>}
        {error && (
          <p role="alert" className="text-[12px] font-semibold text-critical">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
