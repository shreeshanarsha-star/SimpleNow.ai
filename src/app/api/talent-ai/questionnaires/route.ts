import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";

const FEATURE_KEY = "Talent.ai";

export type Question = { id: string; text: string; type: "text" | "rating" | "yesno" };

// Reusable questionnaire templates + recruiter-recorded responses per
// candidate. No public candidate-facing link today (Candidate Portal is
// out of scope for this round) -- recruiter records answers directly.
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
    const { data: responses, error } = await supabase
      .from("talent_candidate_questionnaire_responses")
      .select("*, talent_questionnaire_templates(title, questions)")
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ responses });
  }

  const { data: templates, error } = await supabase
    .from("talent_questionnaire_templates")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates });
}

export async function POST(req: Request) {
  let supabase, user;
  try {
    ({ supabase, user } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const body = await req.json().catch(() => null);
  const action = typeof body?.action === "string" ? body.action : "create_template";

  if (action === "create_template") {
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const questions: Question[] = Array.isArray(body?.questions) ? body.questions : [];
    if (!title || questions.length === 0) {
      return NextResponse.json({ error: "title and at least one question are required." }, { status: 400 });
    }
    const { data: template, error } = await supabase
      .from("talent_questionnaire_templates")
      .insert({ title, questions, created_by: user.id })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ template }, { status: 201 });
  }

  if (action === "record_response") {
    const templateId = typeof body?.templateId === "string" ? body.templateId : null;
    const candidateId = typeof body?.candidateId === "string" ? body.candidateId : null;
    const answers = typeof body?.answers === "object" && body.answers ? body.answers : {};
    if (!templateId || !candidateId) {
      return NextResponse.json({ error: "templateId and candidateId are required." }, { status: 400 });
    }
    const { data: candidate } = await supabase.from("talent_candidates").select("requisition_id").eq("id", candidateId).single();
    const { data: response, error } = await supabase
      .from("talent_candidate_questionnaire_responses")
      .insert({
        template_id: templateId,
        candidate_id: candidateId,
        requisition_id: candidate?.requisition_id || null,
        answers,
        submitted_at: new Date().toISOString(),
        created_by: user.id,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ response }, { status: 201 });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
