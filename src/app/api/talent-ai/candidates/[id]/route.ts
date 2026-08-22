import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";

const FEATURE_KEY = "Talent.ai";

// Full candidate detail for the dedicated profile page -- includes notes,
// scorecards, and the parent requisition's label so the page can link back.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase;
  try {
    ({ supabase } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;

  const { data: candidate, error } = await supabase
    .from("talent_candidates")
    .select(
      "*, talent_notes(*), talent_scorecards(*), talent_requisitions(id, req_no, title, location, department), talent_stage_history(created_at)"
    )
    .eq("id", id)
    .single();

  if (error || !candidate) {
    return NextResponse.json({ error: error?.message || "Candidate not found." }, { status: 404 });
  }

  // Same "real stage-history audit trail, not the mutable updated_at
  // column" logic as the requisition candidates list -- see that route
  // for the full rationale.
  {
    const history = (candidate.talent_stage_history as { created_at: string }[] | null) || [];
    const latest = history.reduce<string | null>((max, h) => (!max || h.created_at > max ? h.created_at : max), null);
    (candidate as Record<string, unknown>).stage_entered_at = latest || candidate.created_at;
  }

  // Other applications by the same person (across other requisitions), so
  // recruiters can see this candidate's full history instead of a single
  // disconnected pipeline row.
  let otherApplications: unknown[] = [];
  if (candidate.person_id) {
    const { data: others } = await supabase
      .from("talent_candidates")
      .select("id, stage, created_at, talent_requisitions(id, req_no, title, location, department)")
      .eq("person_id", candidate.person_id)
      .neq("id", id)
      .order("created_at", { ascending: false });
    otherApplications = others || [];
  }

  return NextResponse.json({ candidate, otherApplications });
}

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
  for (const key of [
    "name",
    "email",
    "phone",
    "source",
    "current_company",
    "current_location",
    "qualification",
    "notice_period",
    "linkedin_url",
  ]) {
    if (key in body) patch[key] = body[key];
  }
  if ("rating" in body) patch.rating = body.rating === null ? null : Number(body.rating);
  if ("tags" in body) patch.tags = body.tags;
  if ("stage" in body) patch.stage = body.stage;

  // Rejection is the one stage change that requires a reason -- record it
  // (and when it happened) at the moment of the move, not after the fact.
  // Moving a candidate back out of Rejected clears the old reason instead
  // of leaving a stale one attached to whatever stage they're in now.
  if ("stage" in body && body.stage === "rejected") {
    patch.rejection_reason = body.rejectionReason || null;
    patch.rejected_at = new Date().toISOString();
  } else if ("stage" in body && existing.stage === "rejected" && body.stage !== "rejected") {
    patch.rejection_reason = null;
    patch.rejected_at = null;
  } else if ("rejectionReason" in body) {
    patch.rejection_reason = body.rejectionReason || null;
  }
  if ("experience_years" in body) {
    patch.experience_years = body.experience_years === null ? null : Number(body.experience_years);
  }
  if ("current_ctc" in body) {
    patch.current_ctc = body.current_ctc === null ? null : Number(body.current_ctc);
  }
  if ("expected_ctc" in body) {
    patch.expected_ctc = body.expected_ctc === null ? null : Number(body.expected_ctc);
  }

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
