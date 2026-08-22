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
  // Field coverage widened past name/email/resume to the profile fields
  // recruiters actually search by (current company, location,
  // qualification, phone) -- a query for "Bangalore" or "MBA" used to
  // return nothing even when candidates with that exact field existed.
  const { data: candidates, error } = await supabase
    .from("talent_candidates")
    .select(
      "*, talent_scorecards(rating, recommendation), talent_requisitions(req_no, title, location)"
    )
    .or(
      `name.ilike.${like},email.ilike.${like},phone.ilike.${like},resume_text.ilike.${like},current_company.ilike.${like},current_location.ilike.${like},qualification.ilike.${like}`
    )
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const qLower = q.toLowerCase();
  function snippetAround(text: string | null, needle: string): string | null {
    if (!text) return null;
    const idx = text.toLowerCase().indexOf(needle);
    if (idx === -1) return null;
    const start = Math.max(0, idx - 60);
    const end = Math.min(text.length, idx + needle.length + 60);
    return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
  }

  let scored: ScoredCandidate[] = (candidates || []).map((c) => {
    const cards = (c.talent_scorecards || []) as { rating: number | null; recommendation: string | null }[];
    const bestRating = cards.reduce((max, s) => Math.max(max, s.rating || 0), 0);
    const strongRec = cards.some((s) => s.recommendation === "strong_yes" || s.recommendation === "yes");
    let score = 1;
    if (c.tags?.some((t: string) => t.toLowerCase().includes(qLower))) score += 2;
    if ((c.name || "").toLowerCase().includes(qLower)) score += 3;
    score += bestRating * 0.5;
    if (strongRec) score += 2;
    const resumeSnippet = snippetAround(c.resume_text as string | null, qLower);
    return { ...c, _score: score, _resumeSnippet: resumeSnippet };
  });
  scored.sort((a, b) => b._score - a._score);

  // Person-level dedupe (Phase 1's talent_people identity split makes
  // this possible): the same person applying to three requisitions used
  // to show up as three near-identical rows. Keep each person's
  // highest-scoring application as the representative row and note how
  // many other applications they have, so recruiters see one entry per
  // person with a way to see the rest (the candidate profile page
  // already surfaces "other applications by this person").
  const seenPersonIds = new Set<string>();
  const otherAppCountByPerson = new Map<string, number>();
  for (const c of scored) {
    const pid = c.person_id as string | null;
    if (pid) otherAppCountByPerson.set(pid, (otherAppCountByPerson.get(pid) || 0) + 1);
  }
  scored = scored.filter((c) => {
    const pid = c.person_id as string | null;
    if (!pid) return true;
    if (seenPersonIds.has(pid)) return false;
    seenPersonIds.add(pid);
    return true;
  });
  scored = scored.map((c) => {
    const pid = c.person_id as string | null;
    const otherCount = pid ? (otherAppCountByPerson.get(pid) || 1) - 1 : 0;
    return { ...c, _otherApplicationsCount: otherCount };
  });

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
