import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";

// Candidates matched to one Job -- the table that opens when a recruiter
// clicks a Job card. Supports search/filter/sort via query params so the
// heavy lifting stays server-side rather than shipping every match to
// the browser to filter client-side.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase;
  try {
    ({ supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const { id: jobId } = await params;
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const status = url.searchParams.get("status");
  const minScore = url.searchParams.get("minScore");
  const sort = url.searchParams.get("sort") || "score_desc";

  let query = supabase
    .from("shortlist_job_matches")
    .select("*, candidate:shortlist_candidates(*)")
    .eq("job_id", jobId);

  if (status && status !== "all") query = query.eq("status", status);
  if (minScore) query = query.gte("overall_score", Number(minScore) || 0);

  const sortMap: Record<string, { col: string; asc: boolean }> = {
    score_desc: { col: "overall_score", asc: false },
    score_asc: { col: "overall_score", asc: true },
    recent: { col: "created_at", asc: false },
  };
  const s = sortMap[sort] || sortMap.score_desc;
  query = query.order(s.col, { ascending: s.asc, nullsFirst: false });

  const { data: matches, error } = await query.limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let rows = matches || [];
  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter((m) => {
      const c = m.candidate;
      if (!c) return false;
      return (
        (c.name || "").toLowerCase().includes(needle) ||
        (c.current_company || "").toLowerCase().includes(needle) ||
        (c.location || "").toLowerCase().includes(needle) ||
        (c.qualification || "").toLowerCase().includes(needle) ||
        (c.skills || []).some((s: string) => s.toLowerCase().includes(needle))
      );
    });
  }

  return NextResponse.json({ matches: rows });
}
