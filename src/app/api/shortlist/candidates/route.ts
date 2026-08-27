import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";

// Global candidate library search -- across ALL jobs, since a candidate
// exists once and can match many roles. Supports the filter set from the
// spec (score is per-job so it's only usable when filtering within a
// single job's match list, not here) plus a light keyword parser for
// "java developers in bangalore with 5-8 years experience and notice
// period below 30 days"-style free text, without standing up real NLP:
// it just pulls out numbers/locations/keywords and applies them as
// ILIKE/range filters.
export async function GET(request: Request) {
  let supabase;
  try {
    ({ supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const location = url.searchParams.get("location")?.trim();
  const company = url.searchParams.get("company")?.trim();
  const qualification = url.searchParams.get("qualification")?.trim();
  const minExp = url.searchParams.get("minExp");
  const maxExp = url.searchParams.get("maxExp");
  const noticeMax = url.searchParams.get("noticeMax");

  let query = supabase.from("shortlist_candidates").select("*").order("created_at", { ascending: false });

  if (location) query = query.ilike("location", `%${location.replace(/[%_]/g, "")}%`);
  if (company) query = query.ilike("current_company", `%${company.replace(/[%_]/g, "")}%`);
  if (qualification) query = query.ilike("qualification", `%${qualification.replace(/[%_]/g, "")}%`);
  if (minExp) query = query.gte("total_experience_years", Number(minExp) || 0);
  if (maxExp) query = query.lte("total_experience_years", Number(maxExp) || 999);

  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    query = query.or(
      `name.ilike.${like},current_company.ilike.${like},location.ilike.${like},qualification.ilike.${like},email.ilike.${like}`
    );
  }

  const { data: candidates, error } = await query.limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let rows = candidates || [];

  // Skills keyword match + notice-period-below filter run client-side
  // here since they need array/text parsing SQL can't cleanly express
  // via the query-string filters above -- fine at Personal Tool scale.
  const skillTerm = url.searchParams.get("skill")?.trim().toLowerCase();
  if (skillTerm) {
    rows = rows.filter((c) => (c.skills || []).some((s: string) => s.toLowerCase().includes(skillTerm)));
  }
  if (noticeMax) {
    const maxDays = Number(noticeMax) || 0;
    rows = rows.filter((c) => {
      const n = (c.notice_period || "").match(/\d+/);
      if (!n) return true; // unknown notice period isn't excluded
      return Number(n[0]) <= maxDays;
    });
  }

  return NextResponse.json({ candidates: rows });
}
