// A single normalized "place" shape the whole Clock UI works with, whether
// it came from the curated WORLD_LOCATIONS list or a live geocoder search
// result -- so cards, the detail panel, compare, and the map never need to
// branch on where a location came from.

import type { WorldLocation, CityRef } from "./locations";
import type { GeoResult } from "./geocode";
import { getZonedParts, businessStatus, type ZonedParts, type BusinessStatus } from "./businessHours";

export interface ClockPlace {
  id: string;
  city: string;
  country: string;
  countryCode: string;
  flag: string;
  timezone: string;
  lat: number;
  lon: number;
  topCities: CityRef[];
  isDefault: boolean;
}

export function flagEmoji(countryCode: string | null | undefined): string {
  if (!countryCode || countryCode.length !== 2) return "🌍";
  const upper = countryCode.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return "🌍";
  const codePoints = [...upper].map((c) => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

export function worldLocationToPlace(wl: WorldLocation): ClockPlace {
  return {
    id: wl.id,
    city: wl.primaryCity.name,
    country: wl.country,
    countryCode: wl.countryCode,
    flag: wl.flag,
    timezone: wl.primaryCity.timezone,
    lat: wl.primaryCity.lat,
    lon: wl.primaryCity.lon,
    topCities: wl.topCities.length ? wl.topCities : [wl.primaryCity],
    isDefault: true,
  };
}

export function geoResultToPlace(g: GeoResult): ClockPlace {
  return {
    id: `geo:${g.id}`,
    city: g.name,
    country: g.country || g.name,
    countryCode: g.countryCode,
    flag: flagEmoji(g.countryCode),
    timezone: g.timezone,
    lat: g.lat,
    lon: g.lon,
    topCities: [{ name: g.name, timezone: g.timezone, lat: g.lat, lon: g.lon }],
    isDefault: false,
  };
}

export function pinToPlace(pin: {
  location_id: string;
  label: string;
  flag: string | null;
  country_code: string | null;
  timezone: string;
  lat: number | null;
  lon: number | null;
}): ClockPlace {
  return {
    id: pin.location_id,
    city: pin.label,
    country: pin.label,
    countryCode: pin.country_code || "",
    flag: pin.flag || flagEmoji(pin.country_code),
    timezone: pin.timezone,
    lat: pin.lat ?? 0,
    lon: pin.lon ?? 0,
    topCities: [],
    isDefault: false,
  };
}

export interface ActivitySnapshot {
  parts: ZonedParts;
  status: BusinessStatus;
  phrase: string;
}

export function activityPhrase(hour: number, status: BusinessStatus): string {
  if (status === "night") return hour < 5 ? "Late night" : "Night";
  if (hour < 8) return "Early morning";
  if (hour < 12) return "Morning";
  if (status === "working") return "Working day";
  if (status === "starting_soon") return "Starting soon";
  if (hour < 17) return "Afternoon";
  if (hour < 21) return "Evening";
  return "Winding down";
}

export function snapshotFor(place: Pick<ClockPlace, "timezone">, now: Date): ActivitySnapshot {
  const parts = getZonedParts(now, place.timezone);
  const status = businessStatus(parts);
  return { parts, status, phrase: activityPhrase(parts.hour, status) };
}
