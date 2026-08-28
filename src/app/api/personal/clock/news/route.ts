import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";

export const dynamic = "force-dynamic";

// Personal Tools: Global Clock -- "Today's Top News" for a selected location.
// Reuses the same Serper.dev key already configured for the AskShree agent's
// search_web action (SERPER_API_KEY, server-side only -- never sent to the
// client). Real results only: if Serper fails or returns nothing usable we
// report failure and the UI shows "News temporarily unavailable" rather than
// fabricating headlines.

interface NewsItem {
  headline: string;
  source: string;
  url: string;
  publishedAt: string | null;
  summary: string;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes -- news doesn't need to be fetched every render
const cache = new Map<string, { at: number; items: NewsItem[] }>();

export async function GET(req: Request) {
  try {
    await requireUser();
  } catch (res) {
    return res as Response;
  }

  const { searchParams } = new URL(req.url);
  const location = (searchParams.get("location") || "").trim();
  if (!location) {
    return NextResponse.json({ ok: false, error: "Missing location." }, { status: 400 });
  }

  const cacheKey = location.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json({ ok: true, items: cached.items, cached: true });
  }

  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    console.error("[clock/news] SERPER_API_KEY is not set");
    return NextResponse.json({ ok: false, error: "News is not configured on the server." }, { status: 200 });
  }

  try {
    const res = await fetch("https://google.serper.dev/news", {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q: `${location} news`, num: 8 }),
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      console.error("[clock/news] Serper returned", res.status, bodyText.slice(0, 300));
      return NextResponse.json({ ok: false, error: "News retrieval failed." }, { status: 200 });
    }
    const json = await res.json();
    const raw: Array<{
      title?: string;
      link?: string;
      snippet?: string;
      date?: string;
      source?: string;
    }> = Array.isArray(json.news) ? json.news : [];

    const items: NewsItem[] = raw
      .filter((n) => n.title && n.link)
      .slice(0, 5)
      .map((n) => ({
        headline: n.title || "",
        source: n.source || "News",
        url: n.link || "",
        publishedAt: n.date || null,
        summary: n.snippet || "",
      }));

    if (!items.length) {
      return NextResponse.json({ ok: false, error: "No news found." }, { status: 200 });
    }

    cache.set(cacheKey, { at: Date.now(), items });
    return NextResponse.json({ ok: true, items, cached: false });
  } catch (err) {
    console.error("[clock/news] fetch failed", err);
    return NextResponse.json({ ok: false, error: "News retrieval failed." }, { status: 200 });
  }
}
