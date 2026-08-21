"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";

// Bengaluru -- fallback location used only when the browser doesn't
// share a real one (geolocation denied/unavailable). Askshree is
// India-based, so this is a reasonable default rather than a guess.
const DEFAULT_COORDS = { lat: 12.9716, lon: 77.5946 };

function weatherIcon(code: number): string {
  if (code === 0) return "sun";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "cloudRain";
  if (code >= 95) return "cloudLightning";
  return "cloud";
}

function weatherLabel(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 3) return "Partly cloudy";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Showers";
  if (code >= 95) return "Storm";
  return "Overcast";
}

export default function TopbarStatus() {
  const [now, setNow] = useState<Date | null>(null);
  const [weather, setWeather] = useState<{ temp: number; code: number } | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);

  // Live clock -- updates every 30s, which is plenty for a "day/date/time"
  // readout that isn't a stopwatch.
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Real weather from Open-Meteo (free, keyless, CORS-enabled) -- tries
  // the browser's actual location first, falls back to Bengaluru
  // silently if geolocation is denied or unavailable. No fake data: if
  // the fetch fails, the weather chip just doesn't render.
  useEffect(() => {
    let cancelled = false;
    function fetchWeather(lat: number, lon: number) {
      fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`
      )
        .then((r) => r.json())
        .then((d) => {
          if (cancelled || !d?.current) return;
          setWeather({
            temp: Math.round(d.current.temperature_2m),
            code: d.current.weather_code,
          });
        })
        .catch(() => {});
    }
    if (typeof window !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude),
        () => fetchWeather(DEFAULT_COORDS.lat, DEFAULT_COORDS.lon),
        { timeout: 4000 }
      );
    } else {
      fetchWeather(DEFAULT_COORDS.lat, DEFAULT_COORDS.lon);
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const dateStr = now
    ? now.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";
  const timeStr = now
    ? now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : "";

  return (
    <div className="flex items-center gap-4">
      <span className="hidden xl:inline text-[10px] font-semibold uppercase tracking-[0.12em] text-brand whitespace-nowrap">
        Simpler ways. Smarter work.
      </span>
      <span className="hidden xl:block w-px h-4 bg-border" />

      {weather && (
        <>
          <div
            className="hidden sm:flex items-center gap-1.5 text-[12px] text-ink-2 whitespace-nowrap"
            title={weatherLabel(weather.code)}
          >
            <Icon name={weatherIcon(weather.code)} className="w-[15px] h-[15px] text-ink-muted" />
            <span className="font-medium">{weather.temp}°C</span>
          </div>
          <span className="hidden sm:block w-px h-4 bg-border" />
        </>
      )}

      {now && (
        <div className="hidden md:flex flex-col items-end leading-tight whitespace-nowrap">
          <span className="text-[12px] font-semibold text-ink">{timeStr}</span>
          <span className="text-[10.5px] text-ink-muted">{dateStr}</span>
        </div>
      )}

      <div className="relative">
        <button
          type="button"
          aria-label="Notifications"
          onClick={() => setNotifOpen((v) => !v)}
          className="w-8 h-8 rounded-full border border-border bg-surface flex items-center justify-center text-ink-2 hover:border-border-strong hover:text-ink transition-colors flex-shrink-0"
        >
          <Icon name="bell" className="w-[15px] h-[15px]" />
        </button>
        {notifOpen && (
          <>
            <button
              type="button"
              aria-label="Close notifications"
              onClick={() => setNotifOpen(false)}
              className="fixed inset-0 z-10 cursor-default"
            />
            <div className="absolute right-0 top-[calc(100%+8px)] w-56 bg-surface border border-border rounded-md shadow-soft-sm p-3 z-20">
              <div className="text-[12px] font-semibold text-ink mb-0.5">Notifications</div>
              <div className="text-[11.5px] text-ink-muted">No new notifications yet.</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
