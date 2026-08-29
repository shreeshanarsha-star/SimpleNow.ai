"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "./Icon";
import { VScroller } from "./Scroller";
import ThemeSwitcher from "./ThemeSwitcher";
import { createClient } from "@/lib/supabase/client";

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
  const [firstName, setFirstName] = useState<string | null>(null);

  // Live clock -- updates every 30s, which is plenty for a "day/date/time"
  // readout that isn't a stopwatch.
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Signed-in user's first name -- lets the greeting read "Good
  // afternoon, Shree" instead of a bare "Good afternoon". Silent no-op
  // for signed-out visitors (greeting still shows, just without a name).
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user;
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const label = profile?.full_name || user.email?.split("@")[0] || null;
      setFirstName(label ? label.split(" ")[0] : null);
    });
    return () => {
      cancelled = true;
    };
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
      })
    : "";
  const timeStr = now
    ? now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : "";
  // Local-time greeting -- uses the visitor's own device clock, so it's
  // automatically correct for whichever timezone they're logging in
  // from, no geolocation lookup needed.
  const greeting = now
    ? now.getHours() < 12
      ? "Good morning"
      : now.getHours() < 17
        ? "Good afternoon"
        : "Good evening"
    : "";

  return (
    // One neat status card instead of a loose row of separate items --
    // greeting + weather + time/date scale down gracefully at each
    // breakpoint, while the two action icons (appearance, notifications)
    // always stay put inside the same card.
    <div className="flex items-center gap-1.5 sm:gap-2.5 pl-1 sm:pl-3.5 pr-1 py-1 rounded-full border border-border bg-page shadow-soft-sm">
      {now && (
        <div className="hidden sm:flex flex-col leading-tight">
          <span className="text-[11.5px] font-semibold text-ink whitespace-nowrap">
            {greeting}
            {firstName ? `, ${firstName}` : ""}
          </span>
          <span className="text-[10px] text-ink-muted whitespace-nowrap">{dateStr}</span>
        </div>
      )}

      {now && <span className="hidden sm:block w-px h-6 bg-border flex-shrink-0" />}

      {weather && (
        <div
          className="hidden sm:flex items-center gap-1 text-[12px] text-ink-2 whitespace-nowrap"
          title={weatherLabel(weather.code)}
        >
          <Icon name={weatherIcon(weather.code)} className="w-[14px] h-[14px] text-ink-muted" />
          <span className="font-medium">{weather.temp}°C</span>
        </div>
      )}

      {now && (
        <span className="hidden md:inline text-[12px] font-semibold text-ink whitespace-nowrap">
          {timeStr}
        </span>
      )}

      {now && <span className="hidden sm:block w-px h-6 bg-border flex-shrink-0" />}

      {/* Appearance -- a personalization preference, not a wayfinding
          control, so it lives here in the persistent global header (same
          pattern as GitHub/Linear/Vercel) rather than competing for space
          with navigation and identity in the sidebar. */}
      <div className="relative">
        <button
          type="button"
          aria-label="Appearance"
          onClick={() => setThemeOpen((v) => !v)}
          className="w-7 h-7 rounded-full flex items-center justify-center text-ink-2 hover:text-ink hover:bg-surface transition-colors flex-shrink-0"
        >
          <Icon name="palette" className="w-[14px] h-[14px]" />
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
          className="relative w-7 h-7 rounded-full flex items-center justify-center text-ink-2 hover:text-ink hover:bg-surface transition-colors flex-shrink-0"
        >
          <Icon name="bell" className="w-[14px] h-[14px]" />
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
