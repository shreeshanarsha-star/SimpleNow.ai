import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";
import {
  HOLD_REASONS,
  REJECT_REASONS,
  WITHDRAW_REASONS,
  enabledStages,
  isBgvKey,
  isStageKey,
  isStatusKey,
  isStatusAllowed,
  resolveTransition,
  stageLabel,
  statusDef,
  statusLabel,
  type InterviewDetails,
  type PipelineDetails,
  type StageKey,
  type StatusKey,
} from "@/lib/smartSourcePipeline";

const FEATURE_KEY = "Smart Source.ai";
const MAX_BULK = 200;

// Stage/Status changes for one or many candidates in a project.
//
// POST body:
//   candidateIds: string[]                 (1..200)
//   stage, status                          target position (validated per stage)
//   reason?        required for reject / withdraw / hold statuses
//   hold_until?    required for hold (YYYY-MM-DD review date)
//   note?          free text stored on the history event
//   interview?     { scheduled_at, mode, panel, rating, feedback } for the target stage
//   offered_ctc?, doj?
//   -- or, on its own --
//   bgv_status: "initiated" | "cleared" | "discrepancy" | null
//
// Advancing statuses (Shortlist, Offer accepted) are recorded and then the
// candidate is moved to the next enabled stage automatically; both steps are
// written to smart_source_member_events.

type MemberRow = {
  id: string;
  candidate_id: string;
  pipeline_stage: string;
  pipeline_status: string;
  pipeline_details: PipelineDetails | null;
  bgv_status: string | null;
};

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function cleanStr(v: unknown, max = 500): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

function isIsoDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(v).getTime());
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase;
  try {
    ({ supabase } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const { id: projectId } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return bad("Invalid request.");

  const candidateIds: string[] = Array.isArray(body.candidateIds)
    ? body.candidateIds.filter((x: unknown): x is string => typeof x === "string" && x.length > 0)
    : [];
  if (!candidateIds.length) return bad("Select at least one candidate.");
  if (candidateIds.length > MAX_BULK) return bad(`You can update up to ${MAX_BULK} candidates at a time.`);

  const { data: project, error: projectError } = await supabase
    .from("smart_source_projects")
    .select("id, stage_template")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) return bad(projectError.message, 500);
  if (!project) return bad("That project couldn't be found.", 404);

  const { data: memberData, error: membersError } = await supabase
    .from("smart_source_project_members")
    .select("id, candidate_id, pipeline_stage, pipeline_status, pipeline_details, bgv_status")
    .eq("project_id", projectId)
    .in("candidate_id", candidateIds);
  if (membersError) return bad(membersError.message, 500);
  const members = (memberData || []) as MemberRow[];
  if (!members.length) return bad("Those candidates aren't in this project.", 404);

  const now = new Date().toISOString();

  // ---- BGV-only update --------------------------------------------------
  if (body.stage === undefined && body.status === undefined && "bgv_status" in body) {
    const bgv = body.bgv_status === null ? null : isBgvKey(body.bgv_status) ? body.bgv_status : undefined;
    if (bgv === undefined) return bad("Unknown BGV status.");
    const ids = members.map((m) => m.id);
    const { error } = await supabase
      .from("smart_source_project_members")
      .update({ bgv_status: bgv, updated_at: now })
      .in("id", ids);
    if (error) return bad(error.message, 500);
    await supabase.from("smart_source_member_events").insert(
      members.map((m) => ({
        member_id: m.id,
        project_id: projectId,
        candidate_id: m.candidate_id,
        from_stage: m.pipeline_stage,
        from_status: m.pipeline_status,
        to_stage: m.pipeline_stage,
        to_status: m.pipeline_status,
        note: bgv ? `BGV: ${bgv}` : "BGV cleared from record",
      }))
    );
    return NextResponse.json({
      updated: members.map((m) => ({ candidateId: m.candidate_id, bgv_status: bgv })),
    });
  }

  // ---- Stage / status change -------------------------------------------
  if (!isStageKey(body.stage)) return bad("Choose a valid stage.");
  if (!isStatusKey(body.status)) return bad("Choose a valid status.");
  const stage: StageKey = body.stage;
  const status: StatusKey = body.status;
  if (!isStatusAllowed(stage, status)) {
    return bad(`"${statusLabel(status)}" isn't a valid status for ${stageLabel(stage)}.`);
  }

  const template: string[] | null = Array.isArray(project.stage_template) ? project.stage_template : null;
  const enabled = enabledStages(template);
  // A stage switched off for this project can still be kept by candidates
  // already sitting in it, but nobody new can be moved into it.
  if (!enabled.includes(stage) && members.some((m) => m.pipeline_stage !== stage)) {
    return bad(`${stageLabel(stage)} is switched off for this project.`);
  }

  const def = statusDef(status);
  const needs = def.needs ?? [];
  const reason = cleanStr(body.reason, 200);
  if (needs.includes("reason_reject") && !(reason && (REJECT_REASONS as readonly string[]).includes(reason))) {
    return bad("Pick a rejection reason.");
  }
  if (needs.includes("reason_withdraw") && !(reason && (WITHDRAW_REASONS as readonly string[]).includes(reason))) {
    return bad("Pick why the candidate withdrew.");
  }
  if (needs.includes("reason_hold") && !(reason && (HOLD_REASONS as readonly string[]).includes(reason))) {
    return bad("Pick a hold reason.");
  }
  let holdUntil: string | null = null;
  if (status === "hold") {
    const h = cleanStr(body.hold_until, 10);
    if (!h || !isIsoDate(h)) return bad("Set a review date for this hold.");
    holdUntil = h;
  }

  const interviewIn = body.interview && typeof body.interview === "object" ? body.interview : null;
  let interviewPatch: InterviewDetails | null = null;
  if (interviewIn) {
    interviewPatch = {};
    if ("scheduled_at" in interviewIn) {
      const s = cleanStr(interviewIn.scheduled_at, 40);
      if (s && Number.isNaN(new Date(s).getTime())) return bad("Invalid interview date/time.");
      interviewPatch.scheduled_at = s;
    }
    if ("mode" in interviewIn) interviewPatch.mode = cleanStr(interviewIn.mode, 40);
    if ("panel" in interviewIn) interviewPatch.panel = cleanStr(interviewIn.panel, 300);
    if ("feedback" in interviewIn) interviewPatch.feedback = cleanStr(interviewIn.feedback, 4000);
    if ("rating" in interviewIn) {
      const r = interviewIn.rating === null || interviewIn.rating === "" ? null : Number(interviewIn.rating);
      if (r !== null && !(Number.isInteger(r) && r >= 1 && r <= 5)) return bad("Rating must be 1 to 5.");
      interviewPatch.rating = r;
    }
  }
  if (needs.includes("schedule") && !interviewPatch?.scheduled_at) {
    return bad("Set the interview date and time.");
  }
  const offeredCtc = "offered_ctc" in body ? cleanStr(body.offered_ctc, 60) : undefined;
  let doj: string | null | undefined = undefined;
  if ("doj" in body) {
    doj = cleanStr(body.doj, 10);
    if (doj && !isIsoDate(doj)) return bad("Invalid date of joining.");
  }
  const note = cleanStr(body.note, 2000);

  const steps = resolveTransition({ stage, status }, template);
  const final = steps[steps.length - 1];
  const finalExit = statusDef(final.status).exit;

  const updated: Record<string, unknown>[] = [];
  const events: Record<string, unknown>[] = [];

  for (const m of members) {
    const details: PipelineDetails = { ...(m.pipeline_details || {}) };
    if (interviewPatch) {
      details.interviews = { ...(details.interviews || {}) };
      details.interviews[stage] = { ...(details.interviews[stage] || {}), ...interviewPatch };
    }
    if (offeredCtc !== undefined) details.offered_ctc = offeredCtc;
    if (doj !== undefined) details.doj = doj;

    const stageChanged = m.pipeline_stage !== final.stage;
    const patch: Record<string, unknown> = {
      pipeline_stage: final.stage,
      pipeline_status: final.status,
      status_reason: finalExit ? reason : null,
      hold_until: final.status === "hold" ? holdUntil : null,
      pipeline_details: details,
      status_changed_at: now,
      updated_at: now,
    };
    if (stageChanged) patch.stage_changed_at = now;

    const { error } = await supabase.from("smart_source_project_members").update(patch).eq("id", m.id);
    if (error) return bad(error.message, 500);

    let from = { stage: m.pipeline_stage, status: m.pipeline_status };
    for (const step of steps) {
      events.push({
        member_id: m.id,
        project_id: projectId,
        candidate_id: m.candidate_id,
        from_stage: from.stage,
        from_status: from.status,
        to_stage: step.stage,
        to_status: step.status,
        reason: step.auto ? null : reason,
        note: step.auto ? null : note,
        auto: step.auto,
      });
      from = { stage: step.stage, status: step.status };
    }

    updated.push({
      candidateId: m.candidate_id,
      pipeline_stage: final.stage,
      pipeline_status: final.status,
      status_reason: patch.status_reason,
      hold_until: patch.hold_until,
      pipeline_details: details,
      stage_changed_at: stageChanged ? now : undefined,
      status_changed_at: now,
      bgv_status: m.bgv_status,
    });
  }

  // History is best-effort: the position change above is what matters, so a
  // failed history insert is logged rather than surfaced as a failed save.
  if (events.length) {
    const { error: eventsError } = await supabase.from("smart_source_member_events").insert(events);
    if (eventsError) console.warn("smart-source pipeline: history insert failed:", eventsError.message);
  }

  return NextResponse.json({
    updated,
    autoAdvanced: steps.length > 1 ? { stage: final.stage, status: final.status } : null,
  });
}

// History for one candidate in this project, newest first.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase;
  try {
    ({ supabase } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const { id: projectId } = await params;
  const candidateId = new URL(request.url).searchParams.get("candidateId");
  if (!candidateId) return bad("candidateId is required.");

  const { data, error } = await supabase
    .from("smart_source_member_events")
    .select("id, from_stage, from_status, to_stage, to_status, reason, note, auto, actor, created_at")
    .eq("project_id", projectId)
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return bad(error.message, 500);

  const actorIds = Array.from(new Set((data || []).map((e) => e.actor).filter(Boolean))) as string[];
  const names: Record<string, string> = {};
  if (actorIds.length) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", actorIds);
    for (const p of (profiles || []) as { id: string; full_name?: string | null; email?: string | null }[]) {
      names[p.id] = p.full_name || p.email || "Team member";
    }
  }

  return NextResponse.json({
    events: (data || []).map((e) => ({ ...e, actor_name: e.actor ? names[e.actor] || null : null })),
  });
}
