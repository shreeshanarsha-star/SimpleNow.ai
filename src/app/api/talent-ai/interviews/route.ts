import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";

const FEATURE_KEY = "Talent.ai";

// Reusable interview round templates + scheduled interviews per candidate.
// Scheduling is manual (no live calendar sync this round) -- recruiter
// picks a date/time and it's tracked here for reminders/history.
export async function GET(req: Request) {
  let supabase;
  try {
    ({ supabase } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const { searchParams } = new URL(req.url);
  const candidateId = searchParams.get("candidateId");

  if (candidateId) {
    const { data: interviews, error } = await supabase
      .from("talent_interviews")
      .select("*, talent_scorecards(*)")
      .eq("candidate_id", candidateId)
      .order("scheduled_at", { ascending: true, nullsFirst: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ interviews });
  }

  const { data: roundTemplates, error } = await supabase
    .from("talent_interview_round_templates")
    .select("*")
    .order("sequence", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ roundTemplates });
}

export async function POST(req: Request) {
  let supabase, user;
  try {
    ({ supabase, user } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const body = await req.json().catch(() => null);
  const action = typeof body?.action === "string" ? body.action : "schedule";

  if (action === "create_round_template") {
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "name is required." }, { status: 400 });
    const { data: template, error } = await supabase
      .from("talent_interview_round_templates")
      .insert({ name, sequence: Number(body.sequence) || 1, created_by: user.id })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ template }, { status: 201 });
  }

  if (action === "schedule") {
    const candidateId = typeof body?.candidateId === "string" ? body.candidateId : null;
    const roundName = typeof body?.roundName === "string" ? body.roundName.trim() : "";
    if (!candidateId || !roundName) {
      return NextResponse.json({ error: "candidateId and roundName are required." }, { status: 400 });
    }
    const { data: candidate } = await supabase.from("talent_candidates").select("requisition_id").eq("id", candidateId).single();
    if (!candidate) return NextResponse.json({ error: "Candidate not found." }, { status: 404 });

    const { data: interview, error } = await supabase
      .from("talent_interviews")
      .insert({
        candidate_id: candidateId,
        requisition_id: candidate.requisition_id,
        round_template_id: body.roundTemplateId || null,
        round_name: roundName,
        scheduled_at: body.scheduledAt || null,
        panel: Array.isArray(body.panel) ? body.panel : [],
        created_by: user.id,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ interview }, { status: 201 });
  }

  if (action === "update_status") {
    const interviewId = typeof body?.interviewId === "string" ? body.interviewId : null;
    const status = typeof body?.status === "string" ? body.status : null;
    if (!interviewId || !status) return NextResponse.json({ error: "interviewId and status are required." }, { status: 400 });
    const { error } = await supabase.from("talent_interviews").update({ status, scheduled_at: body.scheduledAt || undefined }).eq("id", interviewId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
