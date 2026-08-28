"use client";

import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import type { ClockPlace } from "@/lib/clock/place";
import { snapshotFor } from "@/lib/clock/place";
import {
  formatUtcOffset,
  businessStatusMeta,
  timeDiffLabel,
  dayDiffLabel,
  bestContactWindow,
  getZonedParts,
} from "@/lib/clock/businessHours";
import { fetchWeatherBatch, type WeatherNow } from "@/lib/clock/weather";
import { geocodeSearch } from "@/lib/clock/geocode";
import type { CityRef } from "@/lib/clock/locations";

interface NewsItem {
  headline: string;
  source: string;
  url: string;
  publishedAt: string | null;
  summary: string;
}

interface LocationDetailPanelProps {
  place: ClockPlace;
  now: Date;
  userTimezone: string;
  pinned: boolean;
  onTogglePin: () => void;
  inCompare: boolean;
  canAddCompare: boolean;
  onToggleCompare: () => void;
}

export default function LocationDetailPanel({
  place,
  now,
  userTimezone,
  pinned,
  onTogglePin,
  inCompare,
  canAddCompare,
  onToggleCompare,
}: LocationDetailPanelProps) {
  const [cities, setCities] = useState<CityRef[]>(place.topCities);
  const [weatherByCity, setWeatherByCity] = useState<Record<string, WeatherNow | null>>({});
  const [newsState, setNewsState] = useState<{ loading: boolean; items: NewsItem[]; error: string | null }>({
    loading: true,
    items: [],
    error: null,
  });

  // For a default WORLD_LOCATIONS entry we already have a curated top-cities
  // list. For an ad-hoc search result we don't, so derive one generically:
  // ask the same geocoder for the country name and keep whichever results
  // share this place's country code, ranked by population.
  useEffect(() => {
    let cancelled = false;
    if (place.topCities.length > 1) {
      setCities(place.topCities);
      return;
    }
    setCities([{ name: place.city, timezone: place.timezone, lat: place.lat, lon: place.lon }]);
    if (!place.countryCode) return;
    geocodeSearch(place.country, 8).then((results) => {
      if (cancelled) return;
      const sameCountry = results.filter((r) => r.countryCode === place.countryCode).slice(0, 4);
      if (sameCountry.length) {
        setCities(sameCountry.map((r) => ({ name: r.name, timezone: r.timezone, lat: r.lat, lon: r.lon })));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [place.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    setWeatherByCity({});
    fetchWeatherBatch(cities.map((c) => ({ lat: c.lat, lon: c.lon }))).then((results) => {
      if (cancelled) return;
      const map: Record<string, WeatherNow | null> = {};
      cities.forEach((c, i) => (map[c.name] = results[i]));
      setWeatherByCity(map);
    });
    return () => {
      cancelled = true;
    };
  }, [cities]);

  useEffect(() => {
    let cancelled = false;
    setNewsState({ loading: true, items: [], error: null });
    fetch(`/api/personal/clock/news?location=${encodeURIComponent(`${place.city}, ${place.country}`)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.ok) setNewsState({ loading: false, items: data.items, error: null });
        else setNewsState({ loading: false, items: [], error: "News temporarily unavailable" });
      })
      .catch(() => {
        if (!cancelled) setNewsState({ loading: false, items: [], error: "News temporarily unavailable" });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place.id]);

  const snap = snapshotFor(place, now);
  const userParts = useMemo(() => getZonedParts(now, userTimezone), [now, userTimezone]);
  const statusMeta = businessStatusMeta(snap.status);
  const contact = bestContactWindow(userParts.utcOffsetMinutes, snap.parts.utcOffsetMinutes);
  const timeDiff = timeDiffLabel(userParts.utcOffsetMinutes, snap.parts.utcOffsetMinutes);
  const dayDiff = dayDiffLabel(userParts, snap.parts);

  const timeLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: place.timezone,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(now);
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: place.timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(now);

  const primaryWeather = weatherByCity[cities[0]?.name];

  return (
    <div className="border border-border rounded-lg bg-surface p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-[34px] leading-none">{place.flag}</span>
          <div>
            <div className="text-[17px] font-bold text-ink">
              {place.city}
              {place.city !== place.country && <span className="text-ink-muted font-medium">, {place.country}</span>}
            </div>
            <div className="text-[12px] text-ink-muted mt-0.5">{dateLabel}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onTogglePin}
            className={`text-[12px] font-semibold px-3 py-1.5 rounded-full border flex items-center gap-1.5 ${
              pinned ? "border-warning text-warning bg-warning-wash" : "border-border text-ink-2 hover:bg-page"
            }`}
          >
            <Icon name="star" className="w-3.5 h-3.5" />
            {pinned ? "Pinned" : "Pin"}
          </button>
          <button
            onClick={onToggleCompare}
            disabled={!inCompare && !canAddCompare}
            className={`text-[12px] font-semibold px-3 py-1.5 rounded-full border disabled:opacity-40 ${
              inCompare ? "border-brand text-brand bg-brand-wash" : "border-border text-ink-2 hover:bg-page"
            }`}
          >
            {inCompare ? "In Compare" : "Add to Compare"}
          </button>
        </div>
      </div>

      <div className="flex items-end gap-4 mt-4 flex-wrap">
        <div className="text-[44px] font-bold tabular-nums text-ink leading-none">{timeLabel}</div>
        <div className="flex flex-col gap-1 pb-1.5">
          <span className="text-[11.5px] font-semibold text-ink-2">{formatUtcOffset(snap.parts.utcOffsetMinutes)}</span>
          <span className="text-[11.5px] font-semibold flex items-center gap-1">
            <span aria-hidden>{statusMeta.dot}</span>
            <span className={statusMeta.className}>{statusMeta.label}</span>
          </span>
        </div>
      </div>

      <div className="text-[12.5px] text-ink-2 mt-2">
        {place.city} is <span className="font-semibold text-ink">{timeDiff}</span> · {dayDiff}
      </div>

      {contact.hasOverlap ? (
        <div className="mt-3 bg-good-wash text-good-text text-[12.5px] rounded-md px-3.5 py-2.5">
          Best time to contact (your time): <span className="font-bold">{contact.startLabel} – {contact.endLabel}</span>
        </div>
      ) : (
        <div className="mt-3 bg-page text-ink-muted text-[12.5px] rounded-md px-3.5 py-2.5">
          No overlapping business hours today -- try a message instead of a call.
        </div>
      )}

      {/* Weather -- capital/primary + top cities */}
      <div className="mt-5">
        <div className="text-[11px] font-bold uppercase tracking-wide text-ink-muted mb-2">Weather</div>
        <div className="flex gap-2.5 overflow-x-auto pb-1">
          {cities.slice(0, 5).map((c) => {
            const w = weatherByCity[c.name];
            return (
              <div key={c.name} className="flex-shrink-0 w-[118px] border border-border rounded-md px-3 py-2.5">
                <div className="text-[11.5px] font-semibold text-ink truncate">{c.name}</div>
                {w === undefined ? (
                  <div className="text-[11px] text-ink-muted mt-1">Loading…</div>
                ) : w ? (
                  <>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Icon name={w.icon} className="w-3.5 h-3.5 text-ink-2" />
                      <span className="text-[15px] font-bold text-ink">{w.tempC}°C</span>
                    </div>
                    <div className="text-[10.5px] text-ink-muted mt-0.5">
                      {w.label}
                      {w.feelsLikeC != null ? ` · feels ${w.feelsLikeC}°` : ""}
                    </div>
                    {(w.highC != null || w.lowC != null) && (
                      <div className="text-[10.5px] text-ink-muted">
                        {w.highC != null ? `H ${w.highC}°` : ""} {w.lowC != null ? `L ${w.lowC}°` : ""}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-[11px] text-ink-muted mt-1">Weather unavailable right now</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* News */}
      <div className="mt-5">
        <div className="text-[11px] font-bold uppercase tracking-wide text-ink-muted mb-2">Today&apos;s Top News</div>
        {newsState.loading ? (
          <div className="text-[12px] text-ink-muted">Loading news…</div>
        ) : newsState.error || newsState.items.length === 0 ? (
          <div className="text-[12px] text-ink-muted">News temporarily unavailable</div>
        ) : (
          <div className="flex flex-col divide-y divide-border border border-border rounded-md overflow-hidden">
            {newsState.items.slice(0, 5).map((n, i) => (
              <a
                key={i}
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2.5 hover:bg-page block"
              >
                <div className="text-[12.5px] font-semibold text-ink leading-snug">{n.headline}</div>
                <div className="text-[10.5px] text-ink-muted mt-0.5">
                  {n.source}
                  {n.publishedAt ? ` · ${n.publishedAt}` : ""}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="text-[11px] text-ink-muted mt-3">Weather: Open-Meteo · News: Serper</div>
    </div>
  );
}
