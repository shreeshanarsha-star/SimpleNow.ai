// Free, keyless Open-Meteo geocoding -- same API + disambiguation approach
// (rank by population) already used by the Ask Shree agent's get_weather
// action, applied here to power the Clock's search box and search->map-pin
// flow. Deliberately not hardcoded/guessed coordinates: every arbitrary
// place a user searches for is resolved through this live dataset.

export interface GeoResult {
  id: string;
  name: string;
  country: string;
  countryCode: string;
  admin1: string | null;
  lat: number;
  lon: number;
  timezone: string;
  population: number;
  /** True when this result is itself a country capital-ish top hit, used to decide whether to show it as a "country" suggestion vs a plain city. */
  featureCode?: string;
}

const CITY_ALIASES: Record<string, string> = {
  bangalore: "Bengaluru",
  bombay: "Mumbai",
  calcutta: "Kolkata",
  madras: "Chennai",
  poona: "Pune",
  mysore: "Mysuru",
  cochin: "Kochi",
  trivandrum: "Thiruvananthapuram",
  baroda: "Vadodara",
  gurgaon: "Gurugram",
  nyc: "New York",
  ny: "New York",
  la: "Los Angeles",
};

function normalizeQuery(q: string): string {
  const trimmed = q.trim();
  const firstWord = trimmed.split(/[\s,]+/)[0]?.toLowerCase();
  const alias = firstWord ? CITY_ALIASES[firstWord] : undefined;
  if (!alias) return trimmed;
  return alias + trimmed.slice(firstWord!.length);
}

const cache = new Map<string, { at: number; data: GeoResult[] }>();
const CACHE_MS = 30 * 60 * 1000;

export async function geocodeSearch(query: string, count = 10): Promise<GeoResult[]> {
  const q = normalizeQuery(query);
  if (!q) return [];
  const key = `${q.toLowerCase()}:${count}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=${count}&language=en&format=json`
    );
    if (!res.ok) return [];
    const json = await res.json();
    const raw: any[] = json?.results || [];
    const results: GeoResult[] = raw
      .map((r) => ({
        id: `${r.id ?? `${r.latitude},${r.longitude}`}`,
        name: r.name,
        country: r.country || "",
        countryCode: r.country_code || "",
        admin1: r.admin1 || null,
        lat: r.latitude,
        lon: r.longitude,
        timezone: r.timezone || "UTC",
        population: r.population || 0,
        featureCode: r.feature_code,
      }))
      // Highest population first -- "the place most people mean" beats an
      // obscure same-named village, matching the disambiguation the agent
      // already relies on for weather lookups.
      .sort((a, b) => b.population - a.population);
    cache.set(key, { at: Date.now(), data: results });
    return results;
  } catch {
    return [];
  }
}

// Best-effort "the single most relevant hit" for a query, used when the
// user picks a suggestion or presses enter without picking one.
export async function geocodeBest(query: string): Promise<GeoResult | null> {
  const results = await geocodeSearch(query, 5);
  return results[0] || null;
}
