import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { verifyQuestionnaireAnswers } from "@/lib/jobPostings/questionnaire";

export const maxDuration = 30;

const SHORTLIST_CAP = 5;
const APPLY_FROM_ADDRESS = process.env.APPLY_EMAIL_FROM || "SimpleNow Apply.ai <onboarding@resend.dev>";

// Stage 3: candidate submits self-reported answers, verified against the
// JD (rules + one AI judgment call for the fuzzy fields). Only a pass
// results in the job poster ever seeing this candidate -- and only if
// the posting has a confirmed poster_email (public board postings with
// verified email; org-created postings surface shortlisted candidates
// via the existing /admin queue instead, since they have no poster_email
// of their own). No auth gate, token-secured. Ported from the old repo.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid submission." }, { status: 400 });

  const { data: q } = await admin
    .from("application_questionnaires")
    .select("*, job_applications(id, job_posting_id, apply_candidate_id, apply_candidates(name, email, phone))")
    .eq("token", token)
    .maybeSingle();

  if (!q) return NextResponse.json({ error: "This link is not valid." }, { status: 404 });
  if (q.status === "completed") {
    return NextResponse.json({ error: "You already completed this questionnaire.", completed: true }, { status: 409 });
  }

  const application = q.job_applications as {
    id: string;
    job_posting_id: string;
    apply_candidates?: { name?: string; email?: string; phone?: string } | null;
  };

  const { data: job } = await admin.from("job_postings").select("*").eq("id", application.job_posting_id).maybeSingle();
  if (!job) return NextResponse.json({ error: "That job posting is no longer available." }, { status: 404 });

  const answers = {
    technical_skill_answers: Array.isArray(body.technicalSkillAnswers) ? body.technicalSkillAnswers : [],
    good_to_have_answers: Array.isArray(body.goodToHaveAnswers) ? body.goodToHaveAnswers : [],
    location: body.location || null,
    ctc: body.ctc || null,
    total_experience: body.totalExperience != null ? Number(body.totalExperience) : null,
    qualification: body.qualification || null,
    current_industry: body.currentIndustry || null,
    open_to_relocation: !!body.openToRelocation,
  };

  const { passed, reasoning } = await verifyQuestionnaireAnswers(
    {
      min_years_experience: job.min_years_experience,
      location: job.location,
      qualification: job.qualification,
      industry: job.industry,
    },
    answers
  );

  await admin
    .from("application_questionnaires")
    .update({
      technical_skill_answers: answers.technical_skill_answers,
      good_to_have_answers: answers.good_to_have_answers,
      location: answers.location,
      ctc: answers.ctc,
      total_experience: answers.total_experience,
      qualification: answers.qualification,
      current_industry: answers.current_industry,
      open_to_relocation: answers.open_to_relocation,
      status: "completed",
      passed,
      verification_reasoning: reasoning,
      completed_at: new Date().toISOString(),
    })
    .eq("id", q.id);

  if (!passed) {
    return NextResponse.json({ ok: true, passed: false });
  }

  const { count } = await admin
    .from("job_applications")
    .select("id", { count: "exact", head: true })
    .eq("job_posting_id", job.id)
    .eq("shortlisted", true);

  await admin
    .from("job_applications")
    .update({ shortlisted: true, shortlist_sent_at: new Date().toISOString() })
    .eq("id", application.id);

  if (job.poster_email && job.email_verified && (count || 0) < SHORTLIST_CAP) {
    const candidate = application.apply_candidates;
    const html = `
      <p><strong>&#9733; Vetted by SimpleNow</strong> &middot; AI-screened against your must-haves, then confirmed directly by the candidate against your full requirements.</p>
      <h2>New match for ${job.title}${job.company ? ` at ${job.company}` : ""}</h2>
      <div style="margin-bottom:16px; padding-bottom:12px; border-bottom:1px solid #eee;">
        <p><strong>${candidate?.name || "Candidate"}</strong>${candidate?.email ? ` -- ${candidate.email}` : ""}${
      candidate?.phone ? ` -- ${candidate.phone}` : ""
    }</p>
        <p><em>Confirmed:</em> all mandatory skills, ${answers.qualification || "qualification"}, ${
      answers.current_industry || "industry"
    }, ${answers.total_experience ?? "--"}y experience, ${answers.location || "location"}${
      answers.open_to_relocation ? " (open to relocation)" : ""
    }.</p>
      </div>
      <p style="font-size:12px;color:#888;">Only candidates who confirm they meet your stated requirements reach you -- capped at 5 per posting.</p>
    `;
    await sendEmail({
      to: job.poster_email,
      from: APPLY_FROM_ADDRESS,
      subject: `New match for ${job.title}${job.company ? ` at ${job.company}` : ""}`,
      html,
    });
  }

  return NextResponse.json({ ok: true, passed: true });
}
