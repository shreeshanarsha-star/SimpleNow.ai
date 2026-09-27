import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";
import { askAboutCandidate } from "@/lib/smartSourceAsk";

const FEATURE_KEY = "Smart Source.ai";

// One-line AI Q&A about a specific candidate -- "Ask about this candidate"
// box in the evaluation panel. Not persisted (unlike the 5-line summary):
// every ask is a fresh live search + model call, scoped to whatever
// company/profile info is already on the candidate row.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase;
  try {
    ({ supabase } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;

  let question = "";
  try {
    const body = await request.json();
    question = typeof body?.question === "string" ? body.question.trim() : "";
  } catch {
    // fall through to the empty-question error below
  }
  if (!question) return NextResponse.json({ error: "Ask a question first." }, { status: 400 });
  if (question.length > 300) return NextResponse.json({ error: "Keep the question a bit shorter." }, { status: 400 });

  const { data: candidate, error } = await supabase
    .from("smart_source_candidates")
    .select("name, designation, company, location, experience_years, qualification, resume_text")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!candidate) return NextResponse.json({ error: "Candidate not found." }, { status: 404 });

  try {
    const answer = await askAboutCandidate({
      name: candidate.name,
      designation: candidate.designation,
      company: candidate.company,
      location: candidate.location,
      experience_years: candidate.experience_years,
      qualification: candidate.qualification,
      raw_text: candidate.resume_text,
      question,
    });
    return NextResponse.json({ answer });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't answer that." }, { status: 500 });
  }
}
