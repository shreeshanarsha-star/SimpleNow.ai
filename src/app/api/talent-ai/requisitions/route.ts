import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";

const FEATURE_KEY = "Talent.ai";
const REQ_TYPES = new Set(["new", "replacement", "perpetual"]);
const WORK_MODES = new Set(["remote", "hybrid", "onsite"]);

// RLS scopes results correctly (admin sees all requisitions, a granted
// user sees only their own) -- this route just needs feature access.
export async function GET() {
  let supabase;
  try {
    ({ supabase } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }

  const { data: requisitions, error } = await supabase
    .from("talent_requisitions")
    .select("*, talent_candidates(id, stage)")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ requisitions });
}

export async function POST(req: Request) {
  let supabase, user;
  try {
    ({ supabase, user } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }

  const body = await req.json();
  const title = (body.title || "").trim();
  if (!title) {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }

  const requisitionType = REQ_TYPES.has(body.requisitionType) ? body.requisitionType : "new";
  if (requisitionType === "replacement" && !(body.replacementName || "").trim()) {
    return NextResponse.json(
      { error: "Replacement name is required for a replacement requisition." },
      { status: 400 }
    );
  }
  const workMode = WORK_MODES.has(body.workMode) ? body.workMode : null;

  const { data: requisition, error } = await supabase
    .from("talent_requisitions")
    .insert({
      title,
      department: body.department || null,
      location: body.location || null,
      employment_type: body.employmentType || "full-time",
      headcount: Number(body.headcount) || 1,
      status: body.status || "open",
      priority: body.priority || "medium",
      hiring_manager: body.hiringManager || null,
      description: body.description || null, // relabeled "Justification" in the UI
      created_by: user.id,
      requisition_type: requisitionType,
      replacement_name: requisitionType === "replacement" ? body.replacementName || null : null,
      replacement_employee_id:
        requisitionType === "replacement" ? body.replacementEmployeeId || null : null,
      is_confidential: !!body.isConfidential,
      is_internal_only: !!body.isInternalOnly,
      cost_center: body.costCenter || null,
      comments: body.comments || null,
      target_hire_date: body.targetHireDate || null,
      work_mode: workMode,
      comp_min: body.compMin === "" || body.compMin == null ? null : Number(body.compMin),
      comp_max: body.compMax === "" || body.compMax == null ? null : Number(body.compMax),
      job_level: body.jobLevel || null,
      jd_source_text: body.jdSourceText || null,
      jd_file_name: body.jdFileName || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ requisition });
}
