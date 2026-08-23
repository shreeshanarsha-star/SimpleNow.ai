"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "./Icon";
import { VScroller } from "./Scroller";
import ThemeSwitcher from "./ThemeSwitcher";

// Bengaluru -- fallback location used only when the browser doesn't
// share a real one (geolocation denied/unavailable). Askshree is
// India-based, so this is a reasonable default rather than a guess.
const DEFAULT_COORDS = { lat: 12.9716, lon: 77.5946 };

type Notification = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
};

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

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.round(diffMs / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function TopbarStatus() {
  const router = useRouter();
  const [now, setNow] = useState<Date | null>(null);
  const [weather, setWeather] = useState<{ temp: number; code: number } | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

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

  // Real in-app notifications -- polled quietly so a requisition owner
  // sees status changes (approved, on hold, filled, etc.) without having
  // to refresh or go looking for them.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/notifications");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setNotifications(data.notifications || []);
      } catch {
        // silent -- notifications are a convenience, not load-bearing
      }
    }
    load();
    const t = setInterval(load, 45_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await fetch("/api/notifications", { method: "PATCH" });
    } catch {
      // best-effort
    }
  }

  async function handleNotifClick(n: Notification) {
    if (!n.read) {
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      fetch(`/api/notifications/${n.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      }).catch(() => {});
    }
    setNotifOpen(false);
    if (n.link) router.push(n.link);
  }

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

      {/* Appearance -- a personalization preference, not a wayfinding
          control, so it lives here in the persistent global header (same
          pattern as GitHub/Linear/Vercel) rather than competing for space
          with navigation and identity in the sidebar. */}
      <div className="relative">
        <button
          type="button"
          aria-label="Appearance"
          onClick={() => setThemeOpen((v) => !v)}
          className="w-8 h-8 rounded-full border border-border bg-surface flex items-center justify-center text-ink-2 hover:border-border-strong hover:text-ink transition-colors flex-shrink-0"
        >
          <Icon name="palette" className="w-[15px] h-[15px]" />
        </button>
        {themeOpen && (
          <>
            <button
              type="button"
              aria-label="Close appearance menu"
              onClick={() => setThemeOpen(false)}
              className="fixed inset-0 z-10 cursor-default"
            />
            <div className="absolute right-0 top-[calc(100%+8px)] w-44 bg-surface border border-border rounded-md shadow-soft-sm z-20 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-2">
                Appearance
              </div>
              <ThemeSwitcher />
            </div>
          </>
        )}
      </div>

      <div className="relative">
        <button
          type="button"
          aria-label="Notifications"
          onClick={() => setNotifOpen((v) => !v)}
          className="relative w-8 h-8 rounded-full border border-border bg-surface flex items-center justify-center text-ink-2 hover:border-border-strong hover:text-ink transition-colors flex-shrink-0"
        >
          <Icon name="bell" className="w-[15px] h-[15px]" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-critical text-white text-[9.5px] font-bold flex items-center justify-center leading-none">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
        {notifOpen && (
          <>
            <button
              type="button"
              aria-label="Close notifications"
              onClick={() => setNotifOpen(false)}
              className="fixed inset-0 z-10 cursor-default"
            />
            <VScroller className="absolute right-0 top-[calc(100%+8px)] w-80 max-h-[420px] bg-surface border border-border rounded-md shadow-soft-sm z-20" trackClassName="max-h-[420px] p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[12px] font-semibold text-ink">Notifications</div>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="text-[11px] font-semibold text-brand"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              {notifications.length === 0 ? (
                <div className="text-[11.5px] text-ink-muted">No new notifications yet.</div>
              ) : (
                <div className="flex flex-col gap-1">
                  {notifications.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => handleNotifClick(n)}
                      className={`text-left rounded-sm px-2 py-2 text-[12px] leading-snug transition-colors ${
                        n.read ? "text-ink-2 hover:bg-page" : "bg-brand-wash text-ink font-medium hover:opacity-90"
                      }`}
                    >
                      <div className="flex items-start gap-1.5">
                        {!n.read && <span className="mt-1 w-1.5 h-1.5 rounded-full bg-brand flex-shrink-0" />}
                        <div className="min-w-0">
                          <div className="truncate">{n.title}</div>
                          {n.body && <div className="text-[11px] text-ink-muted truncate">{n.body}</div>}
                          <div className="text-[10px] text-ink-muted mt-0.5">{timeAgo(n.created_at)}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </VScroller>
          </>
        )}
      </div>
    </div>
  );
}
