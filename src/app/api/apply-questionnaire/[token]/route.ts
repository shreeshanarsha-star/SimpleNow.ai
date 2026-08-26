import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Loads the candidate-facing questionnaire screen. No auth gate -- this
// link is emailed directly to a candidate, secured by its own unique
// token, same reasoning as the sign/[token] and assessment/[token]
// flows already in this app. Ported from the old askshree-app repo.
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: q } = await admin
    .from("application_questionnaires")
    .select("*, job_applications(id, job_posting_id, apply_candidate_id, apply_candidates(name))")
    .eq("token", token)
    .maybeSingle();

  if (!q) {
    return NextResponse.json({ error: "This link is not valid." }, { status: 404 });
  }
  if (q.status === "completed") {
    return NextResponse.json({ error: "You already completed this questionnaire.", completed: true }, { status: 409 });
  }

  const application = q.job_applications as {
    id: string;
    job_posting_id: string;
    apply_candidates?: { name?: string } | null;
  };

  const { data: job } = await admin
    .from("job_postings")
    .select("title, company, must_have_skills, good_to_have_skills, qualification, location")
    .eq("id", application.job_posting_id)
    .maybeSingle();

  if (!job) {
    return NextResponse.json({ error: "That job posting is no longer available." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    candidateName: application.apply_candidates?.name || "",
    job: {
      title: job.title,
      company: job.company,
      mustHaveSkills: job.must_have_skills || [],
      goodToHaveSkills: job.good_to_have_skills || [],
      qualification: job.qualification || "",
      location: job.location || "",
    },
  });
}
