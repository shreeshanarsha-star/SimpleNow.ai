import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";
import {
  extractSearchCriteria,
  searchWithFallback,
  scoreResults,
  crossMatchInternal,
  type SearchCriteria,
  type InputMode,
} from "@/lib/smartSourceAI";

// One search can involve: an extraction call, up to 4 SerpApi fallback
// rounds x 2 parallel pages each, and up to 8 concurrent scoring batches
// (200 results / 25 per batch). 90s matches Smart Screen.ai's ceiling and
// covers worst-case real-world latency with room to spare.
export const maxDuration = 90;
const FEATURE_KEY = "Smart Source.ai";
// Re-running the exact same query within this window reuses the cached
// result instead of re-spending SerpApi/model calls.
const CACHE_WINDOW_HOURS = 24;

export async function POST(request: Request) {
  let user, supabase, orgId;
  try {
    ({ user, supabase, orgId } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }

  const body = await request.json().catch(() => null);
  const mode = body?.mode as InputMode | undefined;
  if (!mode || !["jd", "describe", "manual"].includes(mode)) {
    return NextResponse.json({ error: "Choose how you'd like to describe the role." }, { status: 400 });
  }

  let criteria: SearchCriteria;
  let queryText: string;

  try {
    if (mode === "manual") {
      const m = body?.manual || {};
      queryText = [m.role_title, m.location, (m.skills || []).join(", ")].filter(Boolean).join(" | ");
      if (!m.role_title && !(m.skills || []).length) {
        return NextResponse.json({ error: "Add a role title or at least one skill." }, { status: 400 });
      }
      criteria = {
        role_title: m.role_title || null,
        company: m.company || null,
        location: m.location || null,
        skills: Array.isArray(m.skills) ? m.skills : [],
        min_experience_years: typeof m.min_experience_years === "number" ? m.min_experience_years : null,
        domain: m.domain || null,
        keywords: m.keywords || null,
      };
    } else {
      queryText = typeof body?.text === "string" ? body.text.trim() : "";
      if (!queryText) {
        return NextResponse.json(
          { error: mode === "jd" ? "Paste a job description first." : "Describe who you're looking for first." },
          { status: 400 }
        );
      }
      criteria = await extractSearchCriteria(mode, queryText);
    }
  } catch (err) {
    return NextResponse.json(
      { error: `Could not understand the input: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 502 }
    );
  }

  if (!criteria.role_title && !criteria.company && !(criteria.skills || []).length) {
    return NextResponse.json(
      { error: "Couldn't identify a role, company, or skills from that -- try adding more detail." },
      { status: 400 }
    );
  }

  // Cache check: reuse a recent identical search for this org instead of
  // re-spending SerpApi/model calls.
  const since = new Date(Date.now() - CACHE_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const { data: cached } = await supabase
    .from("smart_source_searches")
    .select("*, smart_source_candidates(*)")
    .eq("org_id", orgId)
    .eq("query_text", queryText)
    .eq("status", "completed")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cached) {
    return NextResponse.json({ search: cached, candidates: cached.smart_source_candidates, cached: true });
  }

  const { data: search, error: searchError } = await supabase
    .from("smart_source_searches")
    .insert({
      org_id: orgId,
      created_by: user.id,
      input_mode: mode,
      query_text: queryText,
      extracted_role: criteria.role_title,
      extracted_skills: criteria.skills,
      extracted_location: criteria.location,
      extracted_min_experience: criteria.min_experience_years,
      search_query: "",
      status: "processing",
    })
    .select()
    .single();

  if (searchError || !search) {
    return NextResponse.json({ error: searchError?.message || "Could not start the search." }, { status: 500 });
  }

  const outcome = await searchWithFallback(criteria);
  if (!outcome.ok) {
    await supabase.from("smart_source_searches").update({ status: "failed" }).eq("id", search.id);
    const reason =
      outcome.reason === "no_serpapi_key_configured"
        ? "Search isn't configured yet -- ask the platform owner to add the SerpApi key."
        : `Search failed: ${outcome.detail || outcome.reason}`;
    return NextResponse.json({ error: reason }, { status: 502 });
  }

  let scored;
  try {
    scored = await scoreResults(outcome.results, criteria);
  } catch (err) {
    await supabase.from("smart_source_searches").update({ status: "failed" }).eq("id", search.id);
    return NextResponse.json(
      { error: `Could not score results: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 502 }
    );
  }

  let internalMatches: Awaited<ReturnType<typeof crossMatchInternal>> = [];
  if (orgId) {
    try {
      internalMatches = await crossMatchInternal(supabase, orgId, scored);
    } catch {
      // Cross-match is a nice-to-have, never fail the whole search over it.
    }
  }
  const matchByUrl = new Map(internalMatches.map((m) => [m.profile_url, m]));

  const rows = scored.map((c) => {
    const match = matchByUrl.get(c.profile_url);
    return {
      search_id: search.id,
      org_id: orgId,
      name: c.name,
      designation: c.designation,
      company: c.company,
      location: c.location,
      experience_years: c.experience_years,
      compensation: [c.current_ctc, c.expected_ctc].filter(Boolean).join(" -> ") || null,
      qualification: c.qualification,
      skills: c.skills,
      profile_url: c.profile_url,
      match_score: c.match_score,
      evaluation_summary: c.evaluation_summary,
      evaluation_strengths: c.evaluation_strengths,
      evaluation_gaps: c.evaluation_gaps,
      source: "linkedin",
      internal_person_id: match?.internal_person_id || null,
      already_in_pipeline: match?.already_in_pipeline || false,
    };
  });

  const { data: candidates, error: candError } = await supabase
    .from("smart_source_candidates")
    .insert(rows)
    .select();

  if (candError) {
    await supabase.from("smart_source_searches").update({ status: "failed" }).eq("id", search.id);
    return NextResponse.json({ error: candError.message }, { status: 500 });
  }

  const { data: updatedSearch } = await supabase
    .from("smart_source_searches")
    .update({ status: "completed", search_query: outcome.queryUsed || "" })
    .eq("id", search.id)
    .select()
    .single();

  return NextResponse.json({ search: updatedSearch || search, candidates, cached: false });
}
