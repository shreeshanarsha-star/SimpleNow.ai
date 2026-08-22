import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";
import { summarizePipeline } from "@/lib/talentAI";

const FEATURE_KEY = "Talent.ai";
const REQ_TYPES = new Set(["new", "replacement", "perpetual"]);
const WORK_MODES = new Set(["remote", "hybrid", "onsite"]);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase;
  try {
    ({ supabase } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;

  const { data: requisition, error } = await supabase
    .from("talent_requisitions")
    .select("*, talent_candidates(*, talent_notes(*), talent_scorecards(*))")
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  return NextResponse.json({ requisition });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase, user;
  try {
    ({ supabase, user } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;
  const body = await req.json();

  const { data: existing } = await supabase
    .from("talent_requisitions")
    .select("status, title, created_by")
    .eq("id", id)
    .single();

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of [
    "title",
    "department",
    "location",
    "status",
    "priority",
    "hiring_manager",
    "description", // relabeled "Justification" in the UI
    "replacement_name",
    "replacement_employee_id",
    "cost_center",
    "comments",
    "target_hire_date",
    "job_level",
  ]) {
    if (key in body) patch[key] = body[key];
  }
  if ("employmentType" in body) patch.employment_type = body.employmentType;
  if ("headcount" in body) patch.headcount = Number(body.headcount) || 1;
  if ("requisitionType" in body && REQ_TYPES.has(body.requisitionType)) {
    patch.requisition_type = body.requisitionType;
  }
  if ("workMode" in body) {
    patch.work_mode = WORK_MODES.has(body.workMode) ? body.workMode : null;
  }
  if ("isConfidential" in body) patch.is_confidential = !!body.isConfidential;
  if ("isInternalOnly" in body) patch.is_internal_only = !!body.isInternalOnly;
  if ("compMin" in body) {
    patch.comp_min = body.compMin === "" || body.compMin == null ? null : Number(body.compMin);
  }
  if ("compMax" in body) {
    patch.comp_max = body.compMax === "" || body.compMax == null ? null : Number(body.compMax);
  }

  const { data: requisition, error } = await supabase
    .from("talent_requisitions")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Status changed: log an audit row and, if the change wasn't made by the
  // requisition's own owner, let them know in-app that something moved.
  const nextStatus = typeof patch.status === "string" ? patch.status : null;
  if (existing && nextStatus && nextStatus !== existing.status) {
    await supabase.from("talent_requisition_status_history").insert({
      requisition_id: id,
      from_status: existing.status,
      to_status: nextStatus,
      changed_by: user.id,
      note: typeof body.statusNote === "string" ? body.statusNote : null,
    });

    if (existing.created_by && existing.created_by !== user.id) {
      await supabase.from("notifications").insert({
        user_id: existing.created_by,
        feature_key: FEATURE_KEY,
        title: `Requisition "${existing.title}" is now ${nextStatus.replace(/_/g, " ")}`,
        body: null,
        link: `/tools/talent-ai?requisition=${id}`,
        channel: "in_app",
      });
    }
  }

  return NextResponse.json({ requisition });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase;
  try {
    ({ supabase } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;

  const { error } = await supabase.from("talent_requisitions").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// On-demand AI summary of this requisition's pipeline -- separate action
// route (not baked into GET) so it only calls the model when asked.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase;
  try {
    ({ supabase } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (body.action !== "summarize") {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const { data: requisition, error: reqError } = await supabase
    .from("talent_requisitions")
    .select("title")
    .eq("id", id)
    .single();
  if (reqError || !requisition) {
    return NextResponse.json({ error: "Requisition not found." }, { status: 404 });
  }

  const { data: candidates, error: candError } = await supabase
    .from("talent_candidates")
    .select("name, stage, rating, tags, created_at")
    .eq("requisition_id", id);
  if (candError) {
    return NextResponse.json({ error: candError.message }, { status: 500 });
  }

  const now = Date.now();
  const shaped = (candidates || []).map((c) => ({
    name: c.name,
    stage: c.stage,
    rating: c.rating,
    tags: c.tags || [],
    days_in_stage: Math.max(0, Math.round((now - new Date(c.created_at).getTime()) / 86_400_000)),
  }));

  try {
    const summary = await summarizePipeline(requisition.title, shaped);
    const stageCounts: Record<string, number> = {};
    for (const c of shaped) stageCounts[c.stage] = (stageCounts[c.stage] || 0) + 1;
    return NextResponse.json({ summary: { ...summary, stage_counts: stageCounts } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI summary failed." },
      { status: 500 }
    );
  }
}
