import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

const FEATURE_KEY = "Talent.ai";

type ScoredCandidate = Record<string, unknown> & { _score: number };

// Master candidate search: internal database first (every candidate ever
// added to Talent.ai, regardless of which requisition), ranked with a
// boost for people who scored well on a past interview even if they
// weren't selected -- "almost hires" resurface instead of being buried.
// Optionally also hits Serper for external, off-platform sourcing.
export async function GET(req: Request) {
  let supabase;
  try {
    ({ supabase } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const includeExternal = searchParams.get("external") === "true";
  if (!q) return NextResponse.json({ error: "q is required." }, { status: 400 });

  const like = `%${q}%`;
  const { data: candidates, error } = await supabase
    .from("talent_candidates")
    .select("*, talent_scorecards(rating, recommendation), talent_requisitions(title)")
    .or(`name.ilike.${like},email.ilike.${like},resume_text.ilike.${like}`)
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const scored: ScoredCandidate[] = (candidates || []).map((c) => {
    const cards = (c.talent_scorecards || []) as { rating: number | null; recommendation: string | null }[];
    const bestRating = cards.reduce((max, s) => Math.max(max, s.rating || 0), 0);
    const strongRec = cards.some((s) => s.recommendation === "strong_yes" || s.recommendation === "yes");
    let score = 1;
    if (c.tags?.some((t: string) => t.toLowerCase().includes(q.toLowerCase()))) score += 2;
    score += bestRating * 0.5;
    if (strongRec) score += 2;
    return { ...c, _score: score };
  });
  scored.sort((a, b) => b._score - a._score);

  let external: { title: string; link: string; snippet: string }[] = [];
  let externalError: string | null = null;
  if (includeExternal) {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) {
      externalError = "SERPER_API_KEY not set on the server.";
    } else {
      try {
        const res = await fetch("https://google.serper.dev/search", {
          method: "POST",
          headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ q: `${q} site:linkedin.com/in`, num: 10 }),
        });
        if (res.ok) {
          const json = await res.json();
          external = (json.organic || []).map((r: { title: string; link: string; snippet?: string }) => ({
            title: r.title,
            link: r.link,
            snippet: r.snippet || "",
          }));
        } else {
          externalError = `Serper ${res.status}`;
        }
      } catch (err) {
        externalError = err instanceof Error ? err.message : "External search failed.";
      }
    }
  }

  return NextResponse.json({ candidates: scored, external, externalError });
}
