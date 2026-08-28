"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { WORLD_LOCATIONS, type WorldLocation } from "@/lib/clock/locations";
import { geocodeSearch, type GeoResult } from "@/lib/clock/geocode";

interface Suggestion {
  key: string;
  kind: "country" | "city";
  label: string;
  sublabel?: string;
  flag: string;
  onSelect: () => void;
}

interface SearchBarProps {
  onSelectWorldLocation: (loc: WorldLocation, cityIndex?: number) => void;
  onSelectGeo: (result: GeoResult) => void;
}

export default function SearchBar({ onSelectWorldLocation, onSelectGeo }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [geoResults, setGeoResults] = useState<GeoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setGeoResults([]);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const results = await geocodeSearch(q, 6);
      setGeoResults(results);
      setLoading(false);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const q = query.trim().toLowerCase();
  const countryMatches: WorldLocation[] =
    q.length >= 1 ? WORLD_LOCATIONS.filter((l) => l.country.toLowerCase().includes(q)) : [];

  const suggestions: Suggestion[] = [];
  for (const loc of countryMatches.slice(0, 3)) {
    suggestions.push({
      key: `wl-${loc.id}`,
      kind: "country",
      label: loc.country,
      flag: loc.flag,
      onSelect: () => onSelectWorldLocation(loc),
    });
    for (const city of loc.topCities.slice(0, 3)) {
      suggestions.push({
        key: `wl-${loc.id}-${city.name}`,
        kind: "city",
        label: city.name,
        sublabel: loc.country,
        flag: loc.flag,
        onSelect: () => onSelectWorldLocation(loc, loc.topCities.indexOf(city)),
      });
    }
  }
  const usedNames = new Set(suggestions.map((s) => s.label.toLowerCase()));
  for (const g of geoResults) {
    if (usedNames.has(g.name.toLowerCase())) continue;
    suggestions.push({
      key: `geo-${g.id}`,
      kind: "city",
      label: g.name,
      sublabel: [g.admin1, g.country].filter(Boolean).join(", "),
      flag: "📍",
      onSelect: () => onSelectGeo(g),
    });
  }

  function choose(s: Suggestion) {
    s.onSelect();
    setQuery("");
    setGeoResults([]);
    setOpen(false);
  }

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <div className="flex items-center gap-2 border border-border rounded-full bg-surface px-4 py-2.5 focus-within:border-brand">
        <Icon name="search" className="w-4 h-4 text-ink-muted flex-shrink-0" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search a country or city — e.g. Mexico, Poland, New York"
          aria-label="Search for a country or city"
          className="flex-1 min-w-0 text-[13px] bg-transparent outline-none placeholder:text-ink-muted"
        />
        {loading && <span className="text-[11px] text-ink-muted flex-shrink-0">…</span>}
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute z-20 mt-1.5 w-full border border-border rounded-lg bg-surface shadow-soft max-h-80 overflow-y-auto">
          {suggestions.map((s) => (
            <button
              key={s.key}
              onClick={() => choose(s)}
              className={`w-full text-left flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-page ${
                s.kind === "city" ? "pl-6" : ""
              }`}
            >
              <span className="text-[15px] leading-none flex-shrink-0">{s.flag}</span>
              <span className="min-w-0">
                <span className="text-[12.5px] font-semibold text-ink block truncate">{s.label}</span>
                {s.sublabel && <span className="text-[11px] text-ink-muted block truncate">{s.sublabel}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
      {open && q.length >= 2 && !loading && suggestions.length === 0 && (
        <div className="absolute z-20 mt-1.5 w-full border border-border rounded-lg bg-surface shadow-soft px-3.5 py-3 text-[12.5px] text-ink-muted">
          No matching location found.
        </div>
      )}
    </div>
  );
}
