import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateExpression } from "./calc";
import { DEPARTMENTS, PERSONAL_TOOLS } from "@/lib/departments";

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

// Open-Meteo's geocoder indexes several Indian cities only under their
// official post-renaming name (e.g. "Bengaluru", not the still-universally-
// used colloquial "Bangalore") and has no fuzzy/alias matching -- searching
// the colloquial name can silently return an unrelated same-named village
// elsewhere in the world (confirmed live: "Bangalore" alone matched a
// village in Sindh, Pakistan, since Bengaluru itself isn't indexed under
// that name at all). Normalize the handful of common cases before geocoding.
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
};

function normalizeCityName(location: string): string {
  const trimmed = location.trim();
  const firstWord = trimmed.split(/[\s,]+/)[0]?.toLowerCase();
  const alias = firstWord ? CITY_ALIASES[firstWord] : undefined;
  if (!alias) return trimmed;
  return alias + trimmed.slice(firstWord!.length);
}

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
    if (!apiKey) {
      console.error("[ask-shree] search_web: SERPER_API_KEY is not set");
      return { ok: false, error: "Web search is not configured on the server." };
    }
    const query = String(args?.query || "").trim();
    if (!query) return { ok: false, error: "No search query given." };
    try {
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ q: query, num: 6 }),
      });
      if (!res.ok) {
        const bodyText = await res.text().catch(() => "");
        console.error("[ask-shree] search_web: Serper returned", res.status, bodyText.slice(0, 300));
        return { ok: false, error: `Search failed (${res.status}).` };
      }
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
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(normalizeCityName(location))}&count=8`
        );
        const geo = await geoRes.json();
        const results: Array<{ latitude: number; longitude: number; name: string; admin1?: string; country?: string; population?: number }> =
          geo?.results || [];
        if (!results.length) return { ok: false, error: `Couldn't find a location matching "${location}".` };
        // The geocoder returns several same-named places worldwide (e.g. a
        // small village in Sindh, Pakistan also called "Bangalore") with no
        // relevance ranking -- picking result[0] blindly used to surface
        // the wrong one. Prefer whichever candidate has the largest
        // population, since that's virtually always the place a casual
        // query like "weather in Bangalore" actually means.
        const hit = results.reduce((best, cur) => ((cur.population || 0) > (best.population || 0) ? cur : best), results[0]);
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

// --- open_feature -------------------------------------------------------
// Lets the agent actually TAKE the user to a real feature/page in the app
// -- "create a requisition", "open job postings", "take me to my candidate
// search" -- instead of just talking about it. Built from the same
// DEPARTMENTS/PERSONAL_TOOLS source of truth the rest of the site uses for
// nav, so a tool only shows up here once it's genuinely live, plus a small
// hand-curated list of specific in-app actions (like opening the new-
// requisition form) that don't have their own top-level nav entry.
type AppDestination = {
  key: string;
  label: string;
  href: string;
  // Matches a tool name in departments.ts exactly (same convention as
  // requireFeatureAccess) -- null means any signed-in user can go there.
  featureKey: string | null;
  hint: string;
};

function buildAppDestinations(): AppDestination[] {
  const destinations: AppDestination[] = [];

  for (const dept of DEPARTMENTS) {
    for (const tool of dept.tools) {
      if (tool.s !== "live" || !tool.href) continue;
      // Bundled tools (e.g. Team Chat) need no feature_access grant, so
      // they can't use featureKey: tool.n here -- that would incorrectly
      // gate them behind a grant that will never exist. They already have
      // their own hand-curated, featureKey: null destination below.
      if (tool.bundled) continue;
      destinations.push({
        key: `tool:${tool.n}`,
        label: tool.n,
        href: tool.href,
        featureKey: tool.n,
        hint: `Open ${tool.n} (${dept.name}).`,
      });
    }
  }

  for (const tool of PERSONAL_TOOLS.tools) {
    if (tool.s !== "live" || !tool.href) continue;
    destinations.push({
      key: `tool:${tool.n}`,
      label: tool.n,
      href: tool.href,
      featureKey: null,
      hint: `Open the ${tool.n} personal tool.`,
    });
  }

  destinations.push({
    key: "team-chat",
    label: "Team Chat",
    href: "/chat",
    featureKey: null,
    hint: "Open Team Chat.",
  });

  // Hand-curated sub-actions -- specific things a user can DO inside a
  // tool, not just the tool's landing page. Each href encodes enough of a
  // query param for the destination page to pick up and act on (see
  // TalentAiBoard's autoOpenNewRequisition prop).
  destinations.push({
    key: "action:talent-ai-new-requisition",
    label: "Talent.ai — new requisition",
    href: "/tools/talent-ai?action=new-requisition",
    featureKey: "Talent.ai",
    hint: "Create a new requisition / open a new job requisition / start a new role opening.",
  });

  return destinations;
}

const APP_DESTINATIONS = buildAppDestinations();

async function checkFeatureAccess(
  supabase: SupabaseClient<any>,
  userId: string,
  featureKey: string | null
): Promise<boolean> {
  if (!featureKey) return true;
  const { data: profile } = await supabase.from("profiles").select("is_admin, org_id").eq("id", userId).single();
  if (profile?.is_admin) return true;
  if (!profile?.org_id) return false;
  const { data: org } = await supabase
    .from("organizations")
    .select("plan, status")
    .eq("id", profile.org_id)
    .maybeSingle();
  if (org?.status !== "approved") return false;
  if (org.plan === "bulk") return true;
  const { data: grant } = await supabase
    .from("feature_access")
    .select("id")
    .eq("org_id", profile.org_id)
    .eq("feature_key", featureKey)
    .maybeSingle();
  return !!grant;
}

const openFeature: ActionSpec = {
  name: "open_feature",
  description:
    "Navigate the user to a real page or action inside Askshree. Only call this when the user clearly wants to GO somewhere or DO something in the app (e.g. \"create a requisition\", \"open job postings\", \"take me to my candidates\") -- never for general questions. Pick the single best-matching key from this list; if nothing genuinely matches, do NOT call this tool -- tell the user honestly that it isn't available. Available destinations:\n" +
    APP_DESTINATIONS.map((d) => `- ${d.key}: ${d.hint}`).join("\n"),
  parameters: {
    type: "object",
    properties: {
      key: { type: "string", enum: APP_DESTINATIONS.map((d) => d.key), description: "The destination key that best matches what the user wants." },
    },
    required: ["key"],
  },
  riskTier: "read",
  async run(args, ctx) {
    const key = typeof args?.key === "string" ? args.key : "";
    const dest = APP_DESTINATIONS.find((d) => d.key === key);
    if (!dest) return { ok: false, error: `Unknown destination "${key}".` };
    const hasAccess = await checkFeatureAccess(ctx.supabase, ctx.userId, dest.featureKey);
    return {
      ok: true,
      data: { key: dest.key, label: dest.label, href: dest.href, hasAccess, featureKey: dest.featureKey },
    };
  },
};

// --- find_top_candidates -------------------------------------------------
// Answers "who is the best candidate for R-2208261" for real, against the
// actual Talent.ai pipeline -- not a web search. Reuses the same
// requisition-number-or-title lookup a recruiter would do by eye, and the
// match_score Talent.ai already computes per candidate. Gated by the same
// license check as open_feature, then reads through the caller's own RLS-
// scoped client (talent_requisitions_talent_read / talent_candidates_talent_read
// already enforce org scoping -- same pattern GET /api/talent-ai/requisitions uses).
const findTopCandidates: ActionSpec = {
  name: "find_top_candidates",
  description:
    'Find and rank the best-matching candidates for a specific Talent.ai job requisition, by requisition number (e.g. "R-2208261") or role title/keywords, returning each with their AI match score and a link to their profile. Use this for things like "who is the best candidate for R-2208261" or "top candidates for the Sales Manager role" -- this is a real database lookup, not a web search.',
  parameters: {
    type: "object",
    properties: {
      requisitionQuery: { type: "string", description: "The requisition number or role title/keywords the user mentioned." },
    },
    required: ["requisitionQuery"],
  },
  riskTier: "read",
  async run(args, ctx) {
    const hasAccess = await checkFeatureAccess(ctx.supabase, ctx.userId, "Talent.ai");
    if (!hasAccess) return { ok: true, data: { hasAccess: false } };

    const q = typeof args?.requisitionQuery === "string" ? args.requisitionQuery.trim() : "";
    if (!q) return { ok: false, error: "No requisition specified." };

    const { data: reqMatches, error: reqError } = await ctx.supabase
      .from("talent_requisitions")
      .select("id, req_no, title")
      .or(`req_no.ilike.%${q}%,title.ilike.%${q}%`)
      .limit(5);
    if (reqError) return { ok: false, error: reqError.message };
    if (!reqMatches || !reqMatches.length) {
      return { ok: true, data: { hasAccess: true, requisitionFound: false, query: q } };
    }

    const exact = reqMatches.find((r) => (r.req_no || "").toLowerCase() === q.toLowerCase());
    const requisition = exact || reqMatches[0];

    const { data: allCandidates, error: candError } = await ctx.supabase
      .from("talent_candidates")
      .select("id, name, stage, match_score, match_score_note, current_company, current_location, experience_years")
      .eq("requisition_id", requisition.id)
      .order("match_score", { ascending: false, nullsFirst: false })
      .limit(8);
    if (candError) return { ok: false, error: candError.message };

    // Prefer candidates still actually in play; only fall back to
    // including rejected ones if that's genuinely all there is, so we
    // never recommend a rejected candidate as "most suitable" when a
    // live one exists.
    const active = (allCandidates || []).filter((c) => c.stage !== "rejected");
    const pool = active.length ? active : allCandidates || [];

    return {
      ok: true,
      data: {
        hasAccess: true,
        requisitionFound: true,
        requisition: {
          reqNo: requisition.req_no,
          title: requisition.title,
          otherPossibleMatches:
            reqMatches.length > 1
              ? reqMatches.filter((r) => r.id !== requisition.id).map((r) => `${r.req_no} ${r.title}`)
              : [],
        },
        candidates: pool.slice(0, 5).map((c) => ({
          name: c.name,
          matchScore: c.match_score,
          matchNote: c.match_score_note,
          stage: c.stage,
          company: c.current_company,
          location: c.current_location,
          experienceYears: c.experience_years,
          link: `/tools/talent-ai/candidates/${c.id}`,
        })),
      },
    };
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
  openFeature,
  findTopCandidates,
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
