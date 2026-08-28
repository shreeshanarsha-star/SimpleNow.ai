// Weather via Open-Meteo -- the same free, keyless, CORS-enabled API
// already used by TopbarStatus.tsx and the Ask Shree agent's get_weather
// action. No server proxy needed: there's no secret to protect here.

export interface WeatherNow {
  tempC: number;
  feelsLikeC: number | null;
  code: number;
  isDay: boolean;
  label: string;
  icon: "sun" | "moon" | "cloud" | "cloudRain" | "cloudLightning";
  highC: number | null;
  lowC: number | null;
  precipProbability: number | null;
}

// Standard WMO weather codes, as returned by Open-Meteo. Mirrors the
// mapping already used elsewhere in this app (TopbarStatus, agent actions)
// so weather reads consistently everywhere.
export function weatherLabel(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 3) return "Partly cloudy";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Showers";
  if (code >= 95) return "Storm";
  return "Overcast";
}

export function weatherIcon(code: number, isDay: boolean): WeatherNow["icon"] {
  if (code === 0) return isDay ? "sun" : "moon";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "cloudRain";
  if (code >= 95) return "cloudLightning";
  return "cloud";
}

const cache = new Map<string, { at: number; data: WeatherNow }>();
const CACHE_MS = 10 * 60 * 1000; // 10 min -- weather doesn't need to be fresher than that

export async function fetchWeather(lat: number, lon: number): Promise<WeatherNow | null> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,apparent_temperature,weather_code,is_day,precipitation_probability` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1`
    );
    if (!res.ok) return null;
    const d = await res.json();
    if (!d?.current) return null;
    const isDay = d.current.is_day === 1;
    const code = d.current.weather_code;
    const weather: WeatherNow = {
      tempC: Math.round(d.current.temperature_2m),
      feelsLikeC:
        typeof d.current.apparent_temperature === "number" ? Math.round(d.current.apparent_temperature) : null,
      code,
      isDay,
      label: weatherLabel(code),
      icon: weatherIcon(code, isDay),
      highC: d.daily?.temperature_2m_max?.[0] != null ? Math.round(d.daily.temperature_2m_max[0]) : null,
      lowC: d.daily?.temperature_2m_min?.[0] != null ? Math.round(d.daily.temperature_2m_min[0]) : null,
      precipProbability:
        d.current.precipitation_probability ?? d.daily?.precipitation_probability_max?.[0] ?? null,
    };
    cache.set(key, { at: Date.now(), data: weather });
    return weather;
  } catch {
    return null;
  }
}

// Fetch weather for several points with limited concurrency -- used for
// "capital + top 4 cities" so a detail panel doesn't fire an unbounded
// burst of requests.
export async function fetchWeatherBatch(
  points: { lat: number; lon: number }[]
): Promise<(WeatherNow | null)[]> {
  return Promise.all(points.map((p) => fetchWeather(p.lat, p.lon)));
}
