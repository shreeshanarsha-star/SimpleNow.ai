import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";

const FEATURE_KEY = "Smart Source.ai";

// Smart Source.ai's own project lists -- independent of Talent.ai/ATS.
// Unlike talent_candidate_lists (whose members always FK to a
// talent_candidates row, which itself requires a requisition), these save
// straight against smart_source_candidates, so an org without any ATS
// subscription can still keep a running shortlist of sourced candidates.
export async function GET() {
  let user, supabase, orgId;
  try {
    ({ user, supabase, orgId } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }

  let query = supabase
    .from("smart_source_projects")
    .select(`
      id,
      name,
      created_at,
      description,
      start_date,
      target_date,
      target_hires,
      status,
      smart_source_project_members(status)
    `)
    .order("created_at", { ascending: false });

  if (orgId) {
    query = query.eq("org_id", orgId);
  } else {
    query = query.or(`org_id.is.null,created_by.eq.${user.id}`);
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const projects = (data || []).map((p: any) => {
    const members: { status: string | null }[] = Array.isArray(p.smart_source_project_members)
      ? p.smart_source_project_members
      : [];
    const candidateCount = members.length;

    let screened = 0;
    let shortlisted = 0;
    let offered = 0;
    let joined = 0;
    let inactive = 0;

    for (const m of members) {
      const st = m.status || "CV Screened";
      if (st === "Joined") {
        joined++;
      } else if (st === "Offered" || st === "To Join") {
        offered++;
      } else if (
        st === "L1 Interview Shortlist" ||
        st === "L2 Interview Shortlist" ||
        st === "HR Interview Shortlist"
      ) {
        shortlisted++;
      } else if (st === "Hold" || st === "Rejected" || st === "Offer Drop" || st === "Backout") {
        inactive++;
      } else {
        screened++;
      }
    }

    const targetHires = typeof p.target_hires === "number" && p.target_hires > 0 ? p.target_hires : 1;

    let completionPercentage = 0;
    if (candidateCount > 0) {
      const weightedProgress =
        (joined * 1.0 + offered * 0.75 + shortlisted * 0.45 + screened * 0.15) / targetHires;
      completionPercentage = Math.min(100, Math.round(weightedProgress * 100));
    }

    return {
      id: p.id,
      name: p.name,
      created_at: p.created_at,
      description: p.description || "",
      start_date: p.start_date || (p.created_at ? p.created_at.slice(0, 10) : null),
      target_date: p.target_date || null,
      target_hires: targetHires,
      status: p.status || "Active",
      candidateCount,
      stageCounts: {
        screened,
        shortlisted,
        offered,
        joined,
        inactive,
      },
      completionPercentage,
    };
  });

  return NextResponse.json({ projects });
}
