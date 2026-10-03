"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { time as s, fillTime as fill } from "@/lib/nrs/i18n/en/time";
import { postJson } from "../_lib/client";
import { formatTimeInTz } from "../_lib/tz";

export interface OpenLog {
  id: string;
  day: string;
  check_in_at: string;
  check_out_at: string | null;
  timezone: string;
  mode: keyof typeof s.modes;
  city: string | null;
  country_code: string | null;
  is_travel: boolean;
}

const MODES = Object.keys(s.modes) as (keyof typeof s.modes)[];

interface GeoResult {
  city: string | null;
  country_code: string | null;
  lat: number;
  lng: number;
}

function currentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  });
}

async function lookupCity(): Promise<{ geo: GeoResult | null; notice: string | null }> {
  let pos: GeolocationPosition;
  try {
    pos = await currentPosition();
  } catch {
    return { geo: null, notice: s.locationDenied };
  }
  const lat = Math.round(pos.coords.latitude * 100) / 100;
  const lng = Math.round(pos.coords.longitude * 100) / 100;
  try {
    const res = await fetch(`/api/nr-synergy/geo?lat=${lat}&lng=${lng}`);
    if (!res.ok) return { geo: null, notice: s.locationFailed };
    const body = (await res.json()) as GeoResult;
    return { geo: { city: body.city, country_code: body.country_code, lat, lng }, notice: null };
  } catch {
    return { geo: null, notice: s.locationFailed };
  }
}

export default function TodayCard({
  payroll,
  openLog,
  done,
}: {
  payroll: boolean;
  openLog: OpenLog | null;
  done: { time: string; hours: string } | null;
}) {
  const router = useRouter();
  const ids = useId();
  const [mode, setMode] = useState<keyof typeof s.modes>("office");
  const [shareCity, setShareCity] = useState(false);
  const [busy, setBusy] = useState<null | "locating" | "in" | "out">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function checkIn() {
    setError(null);
    setNotice(null);
    let geo: GeoResult | null = null;
    if (shareCity) {
      setBusy("locating");
      const r = await lookupCity();
      geo = r.geo;
      if (r.notice) setNotice(r.notice);
    }
    setBusy("in");
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const res = await postJson<{ log: OpenLog }>("/api/nr-synergy/time/check-in", {
      mode,
      timezone: tz,
      ...(geo ? { city: geo.city, country_code: geo.country_code, lat: geo.lat, lng: geo.lng } : {}),
    });
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  async function checkOut() {
    setError(null);
    setNotice(null);
    setBusy("out");
    const res = await postJson<{ log: OpenLog }>("/api/nr-synergy/time/check-out", {});
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  const startLabel = payroll ? s.checkIn : s.logStart;
  const endLabel = payroll ? s.checkOut : s.logEnd;
  const btn =
    "inline-flex items-center justify-center gap-2 rounded-sm px-4 py-2.5 text-[13px] font-bold shadow-soft-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-60";

  return (
    <section className="rounded-md border border-border bg-surface p-4 flex flex-col gap-3" aria-labelledby={`${ids}-h`}>
      <h2 id={`${ids}-h`} className="text-[14px] font-bold text-ink">
        {s.todayHeading}
      </h2>

      {openLog ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 w-8 h-8 rounded-full bg-good-wash text-good-text flex items-center justify-center shrink-0">
              <Icon name="check" className="w-4 h-4" />
            </span>
            <div>
              <p className="text-[13.5px] font-bold text-ink">
                {fill(s.checkedInAt, { time: formatTimeInTz(openLog.check_in_at, openLog.timezone) })}
              </p>
              <p className="text-[12px] text-ink-muted">
                {[s.modes[openLog.mode] ?? openLog.mode, openLog.city ? fill(s.at, { city: openLog.city }) : null]
                  .filter(Boolean)
                  .join(" ")}
                {openLog.is_travel ? ` · ${s.travelBadge}` : ""}
              </p>
            </div>
          </div>
          <button type="button" onClick={checkOut} disabled={busy !== null} className={`${btn} bg-ink text-surface`}>
            <Icon name="logout" className="w-4 h-4" />
            {busy === "out" ? s.checkingOut : endLabel}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[12.5px] text-ink-muted">
            {done ? fill(s.doneForDay, { hours: fill(s.hours, { h: done.hours }) }) : payroll ? s.notCheckedIn : s.notLogged}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex flex-col gap-1 sm:w-[200px]">
              <span className="text-[11.5px] font-semibold text-ink-muted">{s.workMode}</span>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as keyof typeof s.modes)}
                className="rounded-sm border border-border bg-surface px-3 py-2 text-[13px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {s.modes[m]}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={checkIn} disabled={busy !== null} className={`${btn} bg-brand text-white`}>
              <Icon name="clock" className="w-4 h-4" />
              {busy === "locating" ? s.locating : busy === "in" ? s.checkingIn : startLabel}
            </button>
          </div>
          <label className="flex items-start gap-2 text-[12.5px] text-ink-2">
            <input
              type="checkbox"
              checked={shareCity}
              onChange={(e) => setShareCity(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[rgb(var(--brand-rgb))]"
            />
            <span className="flex items-center gap-1">
              <Icon name="mapPin" className="w-3.5 h-3.5 shrink-0" />
              {s.shareCity}
            </span>
          </label>
        </div>
      )}

      <div aria-live="polite">
        {notice && <p className="text-[12px] text-ink-muted">{notice}</p>}
        {error && (
          <p role="alert" className="text-[12px] text-critical font-semibold">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
