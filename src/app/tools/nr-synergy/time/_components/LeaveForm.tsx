"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { workingDaysBetween } from "@/lib/nrs/dates";
import { time as s, fillTime as fill } from "@/lib/nrs/i18n/en/time";
import { t } from "@/lib/nrs/i18n/en";
import { postJson } from "../_lib/client";

const input =
  "w-full rounded-sm border border-border bg-surface px-3 py-2 text-[13px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand";

export default function LeaveForm({
  today,
  types,
  workingDays,
  holidays,
}: {
  today: string;
  types: (keyof typeof s.leaveTypes)[];
  workingDays: number[];
  holidays: string[];
}) {
  const router = useRouter();
  const ids = useId();
  const [type, setType] = useState<keyof typeof s.leaveTypes>(types[0] ?? "annual");
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
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
        <select value={type} onChange={(e) => setType(e.target.value as keyof typeof s.leaveTypes)} className={input}>
          {types.map((lt) => (
            <option key={lt} value={lt}>
              {s.leaveTypes[lt]}
            </option>
          ))}
        </select>
      </label>
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
      <p className="text-[12px] text-ink-2" aria-live="polite">
        {count == null ? "" : count === 0 ? s.leaveNoWorkingDays : count === 1 ? s.leaveWorkingDaysOne : fill(s.leaveWorkingDays, { count })}
      </p>
      <label className="flex flex-col gap-1">
        <span className="text-[11.5px] font-semibold text-ink-muted">{s.leaveNote}</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} className={input} />
      </label>
      <button
        type="submit"
        disabled={busy || !count}
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
