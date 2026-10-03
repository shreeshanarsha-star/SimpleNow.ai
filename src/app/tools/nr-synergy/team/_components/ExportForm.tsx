"use client";

import { useId, useState } from "react";
import Icon from "@/components/Icon";
import { team as s } from "@/lib/nrs/i18n/en/team";

export default function ExportForm({ defaultMonth, scope }: { defaultMonth: string; scope: "reports" | "all" }) {
  const ids = useId();
  const [month, setMonth] = useState(defaultMonth);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/nr-synergy/team/export?month=${encodeURIComponent(month)}&scope=${scope}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? s.exportFailed);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nr-synergy-attendance-${month}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError(s.exportFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={download} className="rounded-md border border-border bg-surface p-4 flex flex-col gap-3" aria-labelledby={`${ids}-h`}>
      <h2 id={`${ids}-h`} className="text-[14px] font-bold text-ink">
        {s.exportHeading}
      </h2>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-col gap-1 sm:w-[200px]">
          <span className="text-[11.5px] font-semibold text-ink-muted">{s.exportMonth}</span>
          <input
            type="month"
            required
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-sm border border-border bg-surface px-3 py-2 text-[13px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !month}
          className="inline-flex items-center justify-center gap-2 rounded-sm bg-brand text-white px-4 py-2 text-[13px] font-bold shadow-soft-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-60"
        >
          <Icon name="download" className="w-4 h-4" />
          {busy ? s.exporting : s.exportButton}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-[12px] font-semibold text-critical">
          {error}
        </p>
      )}
    </form>
  );
}
