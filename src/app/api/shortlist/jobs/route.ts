import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";

// List/search the signed-in user's Shortlist.ai jobs. RLS (user_id =
// auth.uid()) enforces isolation; this route layers optional search/
// status filtering on top, same "not feature-gated" Personal Tool rule
// as every other Shortlist.ai route.
export async function GET(request: Request) {
  let supabase;
  try {
    ({ supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const status = url.searchParams.get("status");

  let query = supabase
    .from("shortlist_jobs")
    .select("*, shortlist_job_matches(count)")
    .order("created_at", { ascending: false });

  if (status && ["open", "on_hold", "closed"].includes(status)) {
    query = query.eq("status", status);
  }
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    query = query.or(`title.ilike.${like},company.ilike.${like},location.ilike.${like}`);
  }

  const { data: jobs, error } = await query.limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Also pull shortlisted counts per job in one extra query rather than
  // N+1 -- small tables at Personal Tool scale, a single grouped query
  // is plenty.
  const jobIds = (jobs || []).map((j) => j.id);
  let shortlistedCounts: Record<string, number> = {};
  if (jobIds.length) {
    const { data: matches } = await supabase
      .from("shortlist_job_matches")
      .select("job_id, status")
      .in("job_id", jobIds)
      .in("status", ["shortlisted", "shared", "interview", "selected"]);
    shortlistedCounts = (matches || []).reduce((acc: Record<string, number>, m) => {
      acc[m.job_id] = (acc[m.job_id] || 0) + 1;
      return acc;
    }, {});
  }

  const result = (jobs || []).map((j) => ({
    ...j,
    candidate_count: Array.isArray(j.shortlist_job_matches) ? j.shortlist_job_matches[0]?.count || 0 : 0,
    shortlisted_count: shortlistedCounts[j.id] || 0,
    shortlist_job_matches: undefined,
  }));

  return NextResponse.json({ jobs: result });
}
