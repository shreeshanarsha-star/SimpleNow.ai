import { NextResponse } from "next/server";
import { requireNrs } from "@/lib/nrs/member";
import { jsonError, roundCoord } from "../time/_lib/server";

// GET /api/nr-synergy/geo?lat=..&lng=..
// Reverse geocodes to city + country only (OpenStreetMap Nominatim).
// Coordinates are rounded to 2 decimals before leaving the server and are
// never stored here.
const NOMINATIM = "https://nominatim.openstreetmap.org/reverse";
const USER_AGENT = "NR-Synergy/1.0 (simplenow.ai)";

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
  state?: string;
  country?: string;
  country_code?: string;
}

export async function GET(req: Request) {
  try {
    await requireNrs("time");
  } catch (res) {
    return res as Response;
  }

  const url = new URL(req.url);
  const lat = roundCoord(Number(url.searchParams.get("lat")), 90);
  const lng = roundCoord(Number(url.searchParams.get("lng")), 180);
  if (lat == null || lng == null || url.searchParams.get("lat") === null || url.searchParams.get("lng") === null) {
    return jsonError("lat and lng are required.", 400);
  }

  const q = new URL(NOMINATIM);
  q.searchParams.set("format", "jsonv2");
  q.searchParams.set("lat", lat.toFixed(2));
  q.searchParams.set("lon", lng.toFixed(2));
  q.searchParams.set("zoom", "10");
  q.searchParams.set("addressdetails", "1");
  q.searchParams.set("accept-language", "en");

  try {
    const res = await fetch(q, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) return jsonError("Location lookup is unavailable right now.", 502);
    const body = (await res.json()) as { address?: NominatimAddress };
    const a = body.address ?? {};
    const city = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? a.state ?? null;
    const countryCode = a.country_code ? a.country_code.toUpperCase().slice(0, 2) : null;
    return NextResponse.json({ city, country_code: countryCode, country: a.country ?? null, lat, lng });
  } catch {
    return jsonError("Location lookup is unavailable right now.", 502);
  }
}
