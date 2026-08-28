"use client";

import { useEffect, useState, useCallback, memo } from "react";
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps";

const GEO_URL = "/data/countries-110m.json";

export interface MapMarker {
  id: string;
  label: string;
  lat: number;
  lon: number;
  isDay: boolean;
  active: boolean;
}

interface WorldMapProps {
  markers: MapMarker[];
  center: [number, number]; // [lon, lat]
  zoom: number;
  onMarkerClick: (id: string) => void;
  onCountryClick: (countryName: string) => void;
}

interface GeoFeature {
  rsmKey: string;
  properties?: { name?: string };
}

function WorldMapInner({ markers, center, zoom, onMarkerClick, onCountryClick }: WorldMapProps) {
  // Fetch the topojson ourselves (rather than handing react-simple-maps a
  // bare URL) so a failed/slow fetch degrades to a visible fallback instead
  // of a silently blank map -- this is the "missing rig part" equivalent
  // for the map: detect, don't crash, fall back.
  const [geoData, setGeoData] = useState<unknown>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(GEO_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`geo fetch ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!cancelled) setGeoData(json);
      })
      .catch((err) => {
        console.warn("[WorldMap] failed to load map data, falling back:", err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCountryClick = useCallback(
    (name: string | undefined) => {
      if (name) onCountryClick(name);
    },
    [onCountryClick]
  );

  if (failed) {
    return (
      <div className="flex items-center justify-center h-full text-[12.5px] text-ink-muted text-center px-6">
        Map unavailable right now. Search still works above.
      </div>
    );
  }

  if (!geoData) {
    return (
      <div className="flex items-center justify-center h-full text-[12.5px] text-ink-muted">Loading map…</div>
    );
  }

  return (
    <ComposableMap
      projectionConfig={{ scale: 148 }}
      style={{ width: "100%", height: "100%" }}
      role="img"
      aria-label="Interactive world map -- click a country or pinned city to see its local time and weather"
    >
      <ZoomableGroup center={center} zoom={zoom} minZoom={1} maxZoom={12}>
        <Geographies geography={geoData as Record<string, unknown>}>
          {({ geographies }: { geographies: GeoFeature[] }) =>
            geographies.map((geo) => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                onClick={() => handleCountryClick(geo.properties?.name)}
                tabIndex={0}
                aria-label={geo.properties?.name || "Country"}
                style={{
                  default: {
                    fill: "var(--page)",
                    stroke: "var(--surface)",
                    strokeWidth: 0.5,
                    outline: "none",
                    cursor: "pointer",
                  },
                  hover: {
                    fill: "var(--brand-wash)",
                    stroke: "var(--surface)",
                    strokeWidth: 0.5,
                    outline: "none",
                    cursor: "pointer",
                  },
                  pressed: {
                    fill: "rgb(var(--brand-rgb))",
                    stroke: "var(--surface)",
                    strokeWidth: 0.5,
                    outline: "none",
                  },
                }}
              />
            ))
          }
        </Geographies>
        {markers.map((m) => (
          <Marker
            key={m.id}
            coordinates={[m.lon, m.lat] as [number, number]}
            onClick={() => onMarkerClick(m.id)}
            tabIndex={0}
            aria-label={`${m.label}, ${m.isDay ? "daytime" : "nighttime"}`}
            style={{ default: { cursor: "pointer" }, hover: { cursor: "pointer" } }}
          >
            <circle
              r={m.active ? 6 : 4}
              fill={m.isDay ? "#fab219" : "var(--brand-dark)"}
              stroke="var(--surface)"
              strokeWidth={1.5}
            />
            {m.active && (
              <text textAnchor="middle" y={-11} fontSize={11} fontWeight={700} fill="var(--ink)">
                {m.label}
              </text>
            )}
          </Marker>
        ))}
      </ZoomableGroup>
    </ComposableMap>
  );
}

// The topojson fetch + d3 zoom transform hold internal state that doesn't
// play well with SSR hydration, so this is always mounted via next/dynamic
// with ssr:false from the parent. Memoized since markers/center/zoom churn
// far less often than the clock-tick re-renders happening one level up.
const WorldMap = memo(WorldMapInner);
export default WorldMap;
