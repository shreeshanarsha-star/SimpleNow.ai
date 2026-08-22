import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";

const FEATURE_KEY = "Talent.ai";

// Update a candidate -- most importantly, moving stage. Every stage change
// is written to talent_stage_history here so the pipeline has a real audit
// trail, not just a mutable current value.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase, user;
  try {
    ({ supabase, user } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;
  const body = await req.json();

  const { data: existing, error: fetchError } = await supabase
    .from("talent_candidates")
    .select("stage")
    .eq("id", id)
    .single();
  if (fetchError || !existing) {
    return NextResponse.json({ error: "Candidate not found." }, { status: 404 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of ["name", "email", "phone", "source"]) {
    if (key in body) patch[key] = body[key];
  }
  if ("rating" in body) patch.rating = body.rating === null ? null : Number(body.rating);
  if ("tags" in body) patch.tags = body.tags;
  if ("stage" in body) patch.stage = body.stage;

  const { data: candidate, error } = await supabase
    .from("talent_candidates")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if ("stage" in body && body.stage !== existing.stage) {
    await supabase.from("talent_stage_history").insert({
      candidate_id: id,
      from_stage: existing.stage,
      to_stage: body.stage,
      changed_by: user.id,
      note: body.stageNote || null,
    });
  }

  return NextResponse.json({ candidate });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase;
  try {
    ({ supabase } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;

  const { error } = await supabase.from("talent_candidates").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
