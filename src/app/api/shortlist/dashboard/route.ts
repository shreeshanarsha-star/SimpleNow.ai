import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";

// A useful overview, not an analytics dashboard (spec section 24) --
// just the counts a recruiter needs to see at a glance, plus a short
// recently-added and top-matches list.
export async function GET() {
  let supabase;
  try {
    ({ supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }

  const [{ count: totalJobs }, { count: openJobs }, { count: totalCandidates }, { count: shortlisted }, { count: awaitingReview }] =
    await Promise.all([
      supabase.from("shortlist_jobs").select("id", { count: "exact", head: true }),
      supabase.from("shortlist_jobs").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("shortlist_candidates").select("id", { count: "exact", head: true }),
      supabase
        .from("shortlist_job_matches")
        .select("id", { count: "exact", head: true })
        .in("status", ["shortlisted", "shared", "interview", "selected"]),
      supabase.from("shortlist_job_matches").select("id", { count: "exact", head: true }).eq("status", "new"),
    ]);

  const { data: recentCandidates } = await supabase
    .from("shortlist_candidates")
    .select("id, name, current_company, location, created_at")
    .order("created_at", { ascending: false })
    .limit(6);

  const { data: topMatches } = await supabase
    .from("shortlist_job_matches")
    .select("id, overall_score, candidate:shortlist_candidates(id, name), job:shortlist_jobs(id, title, company)")
    .order("overall_score", { ascending: false, nullsFirst: false })
    .limit(6);

  return NextResponse.json({
    totalJobs: totalJobs || 0,
    openJobs: openJobs || 0,
    totalCandidates: totalCandidates || 0,
    shortlisted: shortlisted || 0,
    awaitingReview: awaitingReview || 0,
    recentCandidates: recentCandidates || [],
    topMatches: topMatches || [],
  });
}
