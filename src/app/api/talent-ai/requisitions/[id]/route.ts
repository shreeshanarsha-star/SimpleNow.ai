import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";
import { summarizePipeline } from "@/lib/talentAI";

const FEATURE_KEY = "Talent.ai";

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
  let supabase;
  try {
    ({ supabase } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;
  const body = await req.json();

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of ["title", "department", "location", "status", "priority", "hiring_manager", "description"]) {
    if (key in body) patch[key] = body[key];
  }
  if ("employmentType" in body) patch.employment_type = body.employmentType;
  if ("headcount" in body) patch.headcount = Number(body.headcount) || 1;

  const { data: requisition, error } = await supabase
    .from("talent_requisitions")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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
