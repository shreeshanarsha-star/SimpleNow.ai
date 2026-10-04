"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "./Icon";

// NR Synergy check-in pill for the global top-bar status card. Renders
// nothing for anyone who isn't an NR Synergy member (the status endpoint
// answers { member: false }). Check-in / check-out reuse the Time APIs.

type Mode = "office" | "home" | "client_visit" | "travel" | "trade_fair";

const MODES: { key: Mode; label: string; emoji: string }[] = [
  { key: "office", label: "Office", emoji: "🏢" },
  { key: "home", label: "Home", emoji: "🏡" },
  { key: "client_visit", label: "Client visit", emoji: "🤝" },
  { key: "travel", label: "Travel", emoji: "✈️" },
  { key: "trade_fair", label: "Trade fair", emoji: "🎪" },
];

interface Status {
  member: boolean;
  firstName?: string;
  open?: { since: string; mode: Mode } | null;
  workedTodayMin?: number;
}

function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

export default function TopbarCheckIn() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("office");
  const [, setTick] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/nr-synergy/time/status", { cache: "no-store" });
      if (!res.ok) return;
      setStatus((await res.json()) as Status);
    } catch {
      // the pill is a convenience; stay quiet
    }
  }, []);

  useEffect(() => {
    void load();
    const poll = setInterval(load, 120_000);
    const tick = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!status?.member) return null;

  const live = status.open ?? null;
  const liveMin = live ? Math.max(0, Math.round((Date.now() - new Date(live.since).getTime()) / 60_000)) : 0;
  const totalMin = (status.workedTodayMin ?? 0) + liveMin;
  const liveMode = live ? MODES.find((m) => m.key === live.mode) ?? MODES[0] : null;

  async function act(kind: "in" | "out") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/nr-synergy/time/${kind === "in" ? "check-in" : "check-out"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "in" ? { mode, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } : {}),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(b?.error ?? "Couldn't save. Try again.");
        return;
      }
      await load();
      setOpen(false);
      router.refresh();
    } catch {
      setError("Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={rootRef} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={live ? `Checked in for ${fmtDuration(liveMin)}. Open check-out` : "Check in"}
        className={`group flex items-center gap-1.5 h-7 rounded-full pl-1 pr-2.5 text-[11.5px] font-semibold whitespace-nowrap transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
          live
            ? "bg-good-wash text-good-text hover:brightness-95"
            : "bg-gradient-to-r from-brand to-brand-dark text-white shadow-[0_2px_8px_-2px_rgb(var(--brand-rgb)/0.6)] hover:-translate-y-[1px]"
        }`}
      >
        <span
          aria-hidden="true"
          className={`relative w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${live ? "bg-surface" : "bg-white/20"}`}
        >
          {live ? (
            <>
              <span className="absolute inset-0 rounded-full bg-good/30 animate-ping" />
              <span className="relative">{liveMode?.emoji}</span>
            </>
          ) : (
            <span className="inline-block group-hover:animate-bounce">👋</span>
          )}
        </span>
        {live ? <span className="tabular-nums">{fmtDuration(liveMin)}</span> : <span>Check in</span>}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={live ? "Check out" : "Check in"}
          className="absolute right-0 top-[calc(100%+10px)] w-64 rounded-2xl border border-border bg-surface p-3.5 shadow-[0_18px_40px_-12px_rgba(16,24,40,.3)] z-50"
        >
          {live ? (
            <>
              <p className="text-[13px] font-bold text-ink">
                {liveMode?.emoji} You&apos;re in · {liveMode?.label}
              </p>
              <p className="text-[11.5px] text-ink-muted mt-0.5">
                Since {new Date(live.since).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · today {fmtDuration(totalMin)}
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void act("out")}
                className="mt-3 w-full h-9 rounded-full bg-ink text-surface text-[12.5px] font-bold hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Saving…" : "Check out 🌙"}
              </button>
            </>
          ) : (
            <>
              <p className="text-[13px] font-bold text-ink">
                Hi {status.firstName ?? "there"} 👋 Where are you working today?
              </p>
              {totalMin > 0 && <p className="text-[11.5px] text-ink-muted mt-0.5">Worked today: {fmtDuration(totalMin)}</p>}
              <div className="mt-2.5 grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Work mode">
                {MODES.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    role="radio"
                    aria-checked={mode === m.key}
                    onClick={() => setMode(m.key)}
                    className={`flex items-center gap-1.5 rounded-xl border px-2 py-1.5 text-[12px] text-left transition-colors ${
                      mode === m.key ? "border-brand bg-brand-wash text-brand-dark font-bold" : "border-border text-ink-2 hover:bg-page"
                    }`}
                  >
                    <span aria-hidden="true">{m.emoji}</span>
                    {m.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void act("in")}
                className="mt-3 w-full h-9 rounded-full bg-gradient-to-r from-brand to-brand-dark text-white text-[12.5px] font-bold shadow-[0_3px_10px_-3px_rgb(var(--brand-rgb)/0.6)] hover:opacity-95 disabled:opacity-50"
              >
                {busy ? "Saving…" : "Check in ☀️"}
              </button>
            </>
          )}
          {error && (
            <p role="alert" className="mt-2 text-[11.5px] font-bold text-critical">
              {error}
            </p>
          )}
          <a href="/tools/nr-synergy/time" className="mt-2 block text-center text-[11px] font-semibold text-brand hover:underline">
            Open Time →
          </a>
        </div>
      )}
    </div>
  );
}
