import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";
import { summarizeCandidateProfile } from "@/lib/smartSourceSummary";

const FEATURE_KEY = "Smart Source.ai";

// Generates (or regenerates) the 5-line AI profile summary for a candidate
// already on file, and persists it -- called from the "Summarize" /
// "Regenerate" button in the web app's evaluation view, both before and
// after the candidate has been added to a project (the candidate row
// itself is created at search/CV-drop time either way).
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase;
  try {
    ({ supabase } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;

  const { data: candidate, error } = await supabase
    .from("smart_source_candidates")
    .select("name, designation, company, location, experience_years, qualification, resume_text")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!candidate) return NextResponse.json({ error: "Candidate not found." }, { status: 404 });

  let lines: string[];
  try {
    lines = await summarizeCandidateProfile({
      name: candidate.name,
      designation: candidate.designation,
      company: candidate.company,
      location: candidate.location,
      experience_years: candidate.experience_years,
      qualification: candidate.qualification,
      raw_text: candidate.resume_text,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't generate a summary." }, { status: 500 });
  }

  const summaryText = lines.join("\n");
  const { error: updateError } = await supabase
    .from("smart_source_candidates")
    .update({ ai_summary: summaryText, ai_summary_generated_at: new Date().toISOString() })
    .eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ lines });
}
