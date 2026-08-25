import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";

const FEATURE_KEY = "Smart Source.ai";

// Smart Source.ai's own project lists -- independent of Talent.ai/ATS.
// Unlike talent_candidate_lists (whose members always FK to a
// talent_candidates row, which itself requires a requisition), these save
// straight against smart_source_candidates, so an org without any ATS
// subscription can still keep a running shortlist of sourced candidates.
export async function GET() {
  let supabase, orgId;
  try {
    ({ supabase, orgId } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }

  const { data, error } = await supabase
    .from("smart_source_projects")
    .select("id, name, created_at, smart_source_project_members(count)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const projects = (data || []).map((p) => ({
    id: p.id,
    name: p.name,
    created_at: p.created_at,
    candidateCount: Array.isArray(p.smart_source_project_members)
      ? p.smart_source_project_members[0]?.count ?? 0
      : 0,
  }));

  return NextResponse.json({ projects });
}
