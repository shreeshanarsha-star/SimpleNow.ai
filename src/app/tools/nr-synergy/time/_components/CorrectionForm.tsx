"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { time as s } from "@/lib/nrs/i18n/en/time";
import { t } from "@/lib/nrs/i18n/en";
import { postJson } from "../_lib/client";

const input =
  "w-full rounded-sm border border-border bg-surface px-3 py-2 text-[13px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand";

export default function CorrectionForm({ today }: { today: string }) {
  const router = useRouter();
  const ids = useId();
  const [day, setDay] = useState(today);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!checkIn && !checkOut) {
      setError(s.correctionNeedTime);
      return;
    }
    setBusy(true);
    const res = await postJson<{ status: string }>("/api/nr-synergy/time/correction", {
      day,
      check_in: checkIn || null,
      check_out: checkOut || null,
      reason: reason.trim(),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSuccess(s.correctionSent);
    setCheckIn("");
    setCheckOut("");
    setReason("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="rounded-md border border-border bg-surface p-4 flex flex-col gap-3" aria-labelledby={`${ids}-h`}>
      <div>
        <h2 id={`${ids}-h`} className="text-[14px] font-bold text-ink">
          {s.correctionHeading}
        </h2>
        <p className="text-[12px] text-ink-muted">{s.correctionHint}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-semibold text-ink-muted">{s.correctionDay}</span>
          <input type="date" required max={today} value={day} onChange={(e) => setDay(e.target.value)} className={input} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-semibold text-ink-muted">{s.correctionIn}</span>
          <input type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className={input} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-semibold text-ink-muted">{s.correctionOut}</span>
          <input type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className={input} />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-[11.5px] font-semibold text-ink-muted">{s.correctionReason}</span>
        <textarea required value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={1000} className={input} />
      </label>
      <button
        type="submit"
        disabled={busy || !reason.trim()}
        className="self-start rounded-sm border border-border bg-surface px-4 py-2 text-[13px] font-bold text-ink hover:bg-page focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
      >
        {busy ? t("common.loading") : s.correctionSubmit}
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
