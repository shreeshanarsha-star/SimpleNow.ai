import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateExpression } from "./calc";

export type ActionRiskTier = "read" | "write_reversible" | "write_commitment" | "financial";

export type ActionResult = {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
};

export type ActionContext = {
  userId: string;
  supabase: SupabaseClient<any>;
  // Best-effort browser geolocation, passed by the client with the query
  // (same pattern as the Topbar weather chip) -- never required, only used
  // when a tool needs "near me" / "here" resolved and no place name was given.
  clientLat?: number;
  clientLon?: number;
};

export type ActionSpec = {
  name: string;
  description: string;
  // JSON Schema, passed straight through as an OpenAI tool `parameters` block.
  parameters: Record<string, unknown>;
  riskTier: ActionRiskTier;
  run: (args: any, ctx: ActionContext) => Promise<ActionResult>;
};

const DEFAULT_COORDS = { lat: 12.9716, lon: 77.5946 }; // Bangalore -- same fallback the Topbar weather chip already uses

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

// --- search_web -------------------------------------------------------
const searchWeb: ActionSpec = {
  name: "search_web",
  description:
    "Search the live web for current information -- news, facts, places, products, restaurants, local businesses, or anything requiring up-to-date real-world data. Also the best-effort option for location-ish requests (directions, 'near me', restaurants, shops) since there is no dedicated maps/places API connected -- present results honestly as web search findings, not verified structured place/route data.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "The search query." },
    },
    required: ["query"],
  },
  riskTier: "read",
  async run(args) {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) return { ok: false, error: "Web search is not configured on the server." };
    const query = String(args?.query || "").trim();
    if (!query) return { ok: false, error: "No search query given." };
    try {
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ q: query, num: 6 }),
      });
      if (!res.ok) return { ok: false, error: `Search failed (${res.status}).` };
      const json = await res.json();
      const results = (json.organic || [])
        .slice(0, 6)
        .map((r: { title?: string; link?: string; snippet?: string }) => ({
          title: r.title || "",
          link: r.link || "",
          snippet: r.snippet || "",
        }));
      const answerBox = json.answerBox
        ? { title: json.answerBox.title || null, answer: json.answerBox.answer || json.answerBox.snippet || null }
        : null;
      return { ok: true, data: { query, results, answerBox } };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Web search failed." };
    }
  },
};

// --- get_weather --------------------------------------------------------
const getWeather: ActionSpec = {
  name: "get_weather",
  description:
    "Get the current weather and tomorrow's forecast for a real location. Never guess weather -- always call this tool for any weather question.",
  parameters: {
    type: "object",
    properties: {
      location: { type: "string", description: "City or place name, if the user mentioned one (e.g. 'Mumbai', 'Koramangala, Bangalore'). Omit if the user means their current location." },
    },
  },
  riskTier: "read",
  async run(args, ctx) {
    let lat: number, lon: number, locationLabel: string, usedDefaultLocation = false;
    const location = typeof args?.location === "string" ? args.location.trim() : "";

    if (location) {
      try {
        const geoRes = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`
        );
        const geo = await geoRes.json();
        const hit = geo?.results?.[0];
        if (!hit) return { ok: false, error: `Couldn't find a location matching "${location}".` };
        lat = hit.latitude;
        lon = hit.longitude;
        locationLabel = [hit.name, hit.admin1, hit.country].filter(Boolean).join(", ");
      } catch {
        return { ok: false, error: "Location lookup failed." };
      }
    } else if (ctx.clientLat != null && ctx.clientLon != null) {
      lat = ctx.clientLat;
      lon = ctx.clientLon;
      locationLabel = "your current location";
    } else {
      lat = DEFAULT_COORDS.lat;
      lon = DEFAULT_COORDS.lon;
      locationLabel = "Bangalore (default -- share your city for accuracy)";
      usedDefaultLocation = true;
    }

    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=2`
      );
      if (!res.ok) return { ok: false, error: "Weather service is unavailable right now." };
      const d = await res.json();
      if (!d?.current) return { ok: false, error: "Weather service returned no data." };
      return {
        ok: true,
        data: {
          locationLabel,
          usedDefaultLocation,
          current: {
            tempC: Math.round(d.current.temperature_2m),
            code: d.current.weather_code,
            label: weatherLabel(d.current.weather_code),
            icon: weatherIcon(d.current.weather_code),
          },
          tomorrow: d.daily
            ? {
                maxC: Math.round(d.daily.temperature_2m_max?.[1] ?? d.daily.temperature_2m_max?.[0]),
                minC: Math.round(d.daily.temperature_2m_min?.[1] ?? d.daily.temperature_2m_min?.[0]),
                code: d.daily.weather_code?.[1] ?? d.daily.weather_code?.[0],
                label: weatherLabel(d.daily.weather_code?.[1] ?? d.daily.weather_code?.[0]),
              }
            : null,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Weather lookup failed." };
    }
  },
};

// --- convert_currency -----------------------------------------------------
const convertCurrency: ActionSpec = {
  name: "convert_currency",
  description: "Convert an amount from one currency to another using a live exchange rate. Never guess an exchange rate.",
  parameters: {
    type: "object",
    properties: {
      amount: { type: "number", description: "The amount to convert." },
      from: { type: "string", description: "3-letter source currency code, e.g. USD." },
      to: { type: "string", description: "3-letter target currency code, e.g. INR." },
    },
    required: ["amount", "from", "to"],
  },
  riskTier: "read",
  async run(args) {
    const amount = Number(args?.amount);
    const from = String(args?.from || "").toUpperCase().trim();
    const to = String(args?.to || "").toUpperCase().trim();
    if (!Number.isFinite(amount) || !from || !to) {
      return { ok: false, error: "Need a valid amount, source currency, and target currency." };
    }
    try {
      const res = await fetch(`https://open.er-api.com/v6/latest/${from}`);
      if (!res.ok) return { ok: false, error: "Exchange rate service is unavailable right now." };
      const json = await res.json();
      const rate = json?.rates?.[to];
      if (!rate) return { ok: false, error: `No exchange rate found for ${from} -> ${to}.` };
      return {
        ok: true,
        data: {
          amount,
          from,
          to,
          rate,
          converted: Math.round(amount * rate * 100) / 100,
          updated: json.time_last_update_utc || null,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Currency conversion failed." };
    }
  },
};

// --- calculate --------------------------------------------------------
const calculate: ActionSpec = {
  name: "calculate",
  description: "Evaluate an arithmetic expression exactly (addition, subtraction, multiplication, division, percentage, exponents, parentheses). Always use this for any math instead of computing it yourself.",
  parameters: {
    type: "object",
    properties: {
      expression: { type: "string", description: "e.g. '18% of 5000' should be sent as '5000*0.18', '(120+30)/2'." },
    },
    required: ["expression"],
  },
  riskTier: "read",
  async run(args) {
    const expr = String(args?.expression || "").trim();
    if (!expr) return { ok: false, error: "No expression given." };
    try {
      const result = evaluateExpression(expr);
      return { ok: true, data: { expression: expr, result } };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Could not evaluate that expression." };
    }
  },
};

// --- current_datetime -------------------------------------------------
const currentDatetime: ActionSpec = {
  name: "get_current_datetime",
  description: "Get the current real date and time. Always use this instead of assuming what day/time it is.",
  parameters: { type: "object", properties: {} },
  riskTier: "read",
  async run() {
    const now = new Date();
    return {
      ok: true,
      data: {
        iso: now.toISOString(),
        date: now.toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Kolkata" }),
        time: now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }),
        timezone: "Asia/Kolkata (IST)",
      },
    };
  },
};

// --- memory -------------------------------------------------------------
const saveMemory: ActionSpec = {
  name: "save_memory",
  description:
    "Save a durable fact or preference the user explicitly stated about themselves for future conversations (e.g. food preference, home city, preferred language). Only call this for things clearly meant to be remembered long-term, not one-off details.",
  parameters: {
    type: "object",
    properties: {
      key: { type: "string", description: "Short label, e.g. 'food_preference', 'home_city'." },
      value: { type: "string", description: "The value to remember." },
    },
    required: ["key", "value"],
  },
  riskTier: "write_reversible",
  async run(args, ctx) {
    const key = String(args?.key || "").trim();
    const value = String(args?.value || "").trim();
    if (!key || !value) return { ok: false, error: "Need both a key and a value to remember." };
    const { error } = await ctx.supabase
      .from("ask_shree_memory")
      .upsert({ user_id: ctx.userId, key, value, updated_at: new Date().toISOString() }, { onConflict: "user_id,key" });
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: { key, value, saved: true } };
  },
};

const getMemory: ActionSpec = {
  name: "get_memory",
  description: "Recall previously saved facts/preferences about this user. Call this when it would help answer the current request.",
  parameters: {
    type: "object",
    properties: {
      key: { type: "string", description: "Specific key to recall, or omit to get everything remembered." },
    },
  },
  riskTier: "read",
  async run(args, ctx) {
    let query = ctx.supabase.from("ask_shree_memory").select("key, value").eq("user_id", ctx.userId);
    const key = typeof args?.key === "string" ? args.key.trim() : "";
    if (key) query = query.eq("key", key);
    const { data, error } = await query.limit(30);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: { items: data || [] } };
  },
};

export const ACTION_REGISTRY: ActionSpec[] = [
  searchWeb,
  getWeather,
  convertCurrency,
  calculate,
  currentDatetime,
  saveMemory,
  getMemory,
];

export function getAction(name: string): ActionSpec | undefined {
  return ACTION_REGISTRY.find((a) => a.name === name);
}

export function toOpenAiTools() {
  return ACTION_REGISTRY.map((a) => ({
    type: "function" as const,
    function: {
      name: a.name,
      description: a.description,
      parameters: a.parameters,
    },
  }));
}
