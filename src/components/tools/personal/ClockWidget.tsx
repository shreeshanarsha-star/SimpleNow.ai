"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import Icon from "@/components/Icon";
import { WORLD_LOCATIONS, type WorldLocation } from "@/lib/clock/locations";
import { geocodeBest, type GeoResult } from "@/lib/clock/geocode";
import { fetchWeatherBatch, type WeatherNow } from "@/lib/clock/weather";
import { isDaytimeGuess, getZonedParts } from "@/lib/clock/businessHours";
import {
  worldLocationToPlace,
  geoResultToPlace,
  pinToPlace,
  snapshotFor,
  type ClockPlace,
} from "@/lib/clock/place";
import LocationCard from "./clock/LocationCard";
import SearchBar from "./clock/SearchBar";
import LocationDetailPanel from "./clock/LocationDetailPanel";
import ComparePanel from "./clock/ComparePanel";
import type { MapMarker } from "./clock/WorldMap";

// react-simple-maps drives d3-zoom transforms off the DOM directly, which
// doesn't hydrate cleanly from a server-rendered pass -- load it client-only.
const WorldMap = dynamic(() => import("./clock/WorldMap"), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full text-[12.5px] text-ink-muted">Loading map…</div>,
});

interface PinRow {
  location_id: string;
  label: string;
  flag: string | null;
  country_code: string | null;
  timezone: string;
  lat: number | null;
  lon: number | null;
  position: number;
}

const DEFAULT_PLACES: ClockPlace[] = WORLD_LOCATIONS.map(worldLocationToPlace);

export default function ClockWidget() {
  const [now, setNow] = useState<Date | null>(null);
  const userTimezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);

  const [pins, setPins] = useState<PinRow[] | null>(null);
  const [placesById, setPlacesById] = useState<Record<string, ClockPlace>>(() => {
    const map: Record<string, ClockPlace> = {};
    DEFAULT_PLACES.forEach((p) => (map[p.id] = p));
    return map;
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [weatherByPlace, setWeatherByPlace] = useState<Record<string, WeatherNow | null | undefined>>({});

  // Tick locally every second -- never a remote call per tick.
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/personal/clock/pins")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setPins(data.pins || []);
      })
      .catch(() => {
        if (!cancelled) setPins([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const myWorldPlaces: ClockPlace[] = useMemo(() => {
    if (pins && pins.length) return pins.map(pinToPlace);
    return DEFAULT_PLACES;
  }, [pins]);

  // Batch-fetch weather for whatever's currently in My World -- keyed off
  // place identity, not the second-by-second clock tick.
  const myWorldKey = myWorldPlaces.map((p) => p.id).join(",");
  useEffect(() => {
    let cancelled = false;
    fetchWeatherBatch(myWorldPlaces.map((p) => ({ lat: p.lat, lon: p.lon }))).then((results) => {
      if (cancelled) return;
      setWeatherByPlace((prev) => {
        const next = { ...prev };
        myWorldPlaces.forEach((p, i) => (next[p.id] = results[i]));
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myWorldKey]);

  const registerPlace = useCallback((place: ClockPlace) => {
    setPlacesById((prev) => (prev[place.id] ? prev : { ...prev, [place.id]: place }));
  }, []);

  const selectWorldLocation = useCallback(
    (loc: WorldLocation, cityIndex?: number) => {
      if (cityIndex == null) {
        const place = worldLocationToPlace(loc);
        registerPlace(place);
        setActiveId(place.id);
        return;
      }
      const city = loc.topCities[cityIndex];
      if (!city) return;
      const place: ClockPlace = {
        id: `${loc.id}:${city.name}`,
        city: city.name,
        country: loc.country,
        countryCode: loc.countryCode,
        flag: loc.flag,
        timezone: city.timezone,
        lat: city.lat,
        lon: city.lon,
        topCities: loc.topCities,
        isDefault: false,
      };
      registerPlace(place);
      setActiveId(place.id);
    },
    [registerPlace]
  );

  const selectGeo = useCallback(
    (g: GeoResult) => {
      const place = geoResultToPlace(g);
      registerPlace(place);
      setActiveId(place.id);
    },
    [registerPlace]
  );

  const handleCountryClick = useCallback(
    async (countryName: string) => {
      const best = await geocodeBest(countryName);
      if (!best) {
        console.info("[Clock] could not resolve map country click:", countryName);
        return;
      }
      const place = geoResultToPlace(best);
      registerPlace(place);
      setActiveId(place.id);
    },
    [registerPlace]
  );

  const handleMarkerClick = useCallback((id: string) => setActiveId(id), []);

  async function togglePin(place: ClockPlace) {
    const isPinned = (pins || []).some((p) => p.location_id === place.id);
    if (isPinned) {
      setPins((prev) => (prev || []).filter((p) => p.location_id !== place.id));
      try {
        await fetch(`/api/personal/clock/pins?location_id=${encodeURIComponent(place.id)}`, { method: "DELETE" });
      } catch {
        /* optimistic -- self-corrects on next load */
      }
    } else {
      const optimisticRow: PinRow = {
        location_id: place.id,
        label: place.city,
        flag: place.flag,
        country_code: place.countryCode || null,
        timezone: place.timezone,
        lat: place.lat,
        lon: place.lon,
        position: (pins || []).length,
      };
      setPins((prev) => [...(prev || []), optimisticRow]);
      try {
        await fetch("/api/personal/clock/pins", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location_id: place.id,
            label: place.city,
            flag: place.flag,
            country_code: place.countryCode || null,
            timezone: place.timezone,
            lat: place.lat,
            lon: place.lon,
          }),
        });
      } catch {
        /* optimistic -- self-corrects on next load */
      }
    }
  }

  function toggleCompare(id: string) {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 5) return prev;
      return [...prev, id];
    });
  }

  const activePlace = activeId ? placesById[activeId] : null;
  const comparePlaces = compareIds.map((id) => placesById[id]).filter(Boolean) as ClockPlace[];

  // Hooks must run every render regardless of the `now` loading gate below,
  // so this stays above the early return and simply no-ops while now===null.
  const mapMarkers: MapMarker[] = useMemo(() => {
    if (!now) return [];
    const seen = new Set<string>();
    const list: MapMarker[] = [];
    const push = (p: ClockPlace) => {
      if (seen.has(p.id)) return;
      seen.add(p.id);
      const parts = getZonedParts(now, p.timezone);
      list.push({
        id: p.id,
        label: p.city,
        lat: p.lat,
        lon: p.lon,
        isDay: isDaytimeGuess(parts.hour),
        active: p.id === activeId,
      });
    };
    myWorldPlaces.forEach(push);
    if (activePlace) push(activePlace);
    return list;
  }, [myWorldPlaces, activePlace, activeId, now]);

  if (!now) return <div className="text-[13px] text-ink-muted">Loading…</div>;

  const mapCenter: [number, number] = activePlace ? [activePlace.lon, activePlace.lat] : [10, 15];
  const mapZoom = activePlace ? 3.5 : 1;

  return (
    <div className="flex flex-col gap-5 max-w-5xl">
      <div>
        <div className="flex items-center gap-2">
          <Icon name="globe" className="w-5 h-5 text-brand" />
          <h2 className="text-[18px] font-bold text-ink">Global Clock</h2>
        </div>
        <p className="text-[12.5px] text-ink-muted mt-0.5">
          Time, weather, and the best moment to reach out -- anywhere in the world.
        </p>
        <div className="mt-3">
          <SearchBar onSelectWorldLocation={selectWorldLocation} onSelectGeo={selectGeo} />
        </div>
      </div>

      {/* What's happening now */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {myWorldPlaces.map((p) => {
          const snap = snapshotFor(p, now);
          return (
            <button
              key={p.id}
              onClick={() => setActiveId(p.id)}
              className="flex-shrink-0 text-[11.5px] font-semibold text-ink-2 bg-page hover:bg-brand-wash hover:text-brand rounded-full px-3 py-1.5 whitespace-nowrap"
            >
              {p.flag} {p.country} — {snap.phrase}
            </button>
          );
        })}
      </div>

      {/* My World */}
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wide text-ink-muted mb-2">My World</div>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {myWorldPlaces.map((p) => (
            <LocationCard
              key={p.id}
              place={p}
              now={now}
              weather={weatherByPlace[p.id]}
              active={p.id === activeId}
              pinned={(pins || []).some((pin) => pin.location_id === p.id)}
              onClick={() => setActiveId(p.id)}
              onTogglePin={() => togglePin(p)}
            />
          ))}
        </div>
      </div>

      {/* Detail panel */}
      {activePlace && (
        <LocationDetailPanel
          place={activePlace}
          now={now}
          userTimezone={userTimezone}
          pinned={(pins || []).some((pin) => pin.location_id === activePlace.id)}
          onTogglePin={() => togglePin(activePlace)}
          inCompare={compareIds.includes(activePlace.id)}
          canAddCompare={compareIds.length < 5}
          onToggleCompare={() => toggleCompare(activePlace.id)}
        />
      )}

      {/* Compare */}
      <ComparePanel
        places={comparePlaces}
        now={now}
        weatherByPlace={weatherByPlace}
        onRemove={(id) => setCompareIds((prev) => prev.filter((x) => x !== id))}
        onClear={() => setCompareIds([])}
      />

      {/* World map */}
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wide text-ink-muted mb-2">World Map</div>
        <div className="border border-border rounded-lg bg-page overflow-hidden h-[320px] sm:h-[420px]">
          <WorldMap
            markers={mapMarkers}
            center={mapCenter}
            zoom={mapZoom}
            onMarkerClick={handleMarkerClick}
            onCountryClick={handleCountryClick}
          />
        </div>
      </div>
    </div>
  );
}
