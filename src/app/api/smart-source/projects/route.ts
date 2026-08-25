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
    .select("id, name")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ projects: data || [] });
}
