import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";
import { searchTalentCandidates } from "@/lib/talentCandidateSearch";

const FEATURE_KEY = "Talent.ai";

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

  let scored;
  try {
    scored = await searchTalentCandidates(supabase, [q]);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Search failed." }, { status: 500 });
  }

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
