import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractDocumentText } from "@/lib/contracts/textExtract";
import { screenCandidate, parseCandidateProfile } from "@/lib/jobPostings/screen";
import { createQuestionnaire } from "@/lib/jobPostings/questionnaire";
import { getClientIp, checkAndRecordApplyUsage } from "@/lib/jobPostings/gating";
import { sendEmail } from "@/lib/email";

export const maxDuration = 60;

const AUTO_APPLY_SCAN_LIMIT = 30;
const AUTO_APPLY_CAP = 10;
const SEARCH_MODE_CAP = 10;
const SHORTLIST_THRESHOLD = 70;

const APPLY_FROM_ADDRESS = process.env.APPLY_EMAIL_FROM || "SimpleNow Apply.ai <noreply@simplenow.ai>";

// Public, unauthenticated Apply.ai -- the old askshree-app repo's CV-first
// flow, recreated. Upload a resume once; either auto-apply (AI screens it
// against the most recent open postings and applies to the top matches)
// or search + pick specific roles. Every screen result is stored on
// job_applications for admin visibility; a match >= 70 additionally
// triggers a self-report questionnaire email -- only a verified pass on
// that reaches the job's poster directly (see
// /api/apply-questionnaire/[token]/submit).
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ip = getClientIp(request);
  const usage = await checkAndRecordApplyUsage(ip, user?.id ?? null);
  if (!usage.allowed) {
    return NextResponse.json({ locked: true, message: usage.message }, { status: 402 });
  }

  const body = await request.json().catch(() => null);
  const resumeFile = body?.resumeFile;
  const jobPostingIds: string[] = Array.isArray(body?.jobPostingIds) ? body.jobPostingIds : [];
  const mode = body?.mode === "auto_apply" ? "auto_apply" : "search";
  const whatsappOptIn = !!body?.whatsappOptIn;
  const termsAccepted = !!body?.termsAccepted;

  if (!termsAccepted) {
    return NextResponse.json({ error: "You must accept the Terms & Conditions to apply." }, { status: 400 });
  }
  if (!resumeFile?.base64) {
    return NextResponse.json({ error: "Upload your CV." }, { status: 400 });
  }

  const buffer = Buffer.from(resumeFile.base64, "base64");
  const { fullText: resumeText } = await extractDocumentText(
    buffer,
    resumeFile.fileName || "resume",
    resumeFile.mimeType || ""
  );
  if (!resumeText || resumeText.trim().length < 20) {
    return NextResponse.json({ error: "Could not read that CV. Try a different file." }, { status: 400 });
  }

  const admin = createAdminClient();
  const parsed = await parseCandidateProfile(resumeText);

  // Dedupe: exact match on email or phone (both nearly always present from
  // an uploaded CV), same as the old repo's v1 dedup.
  let candidate: Record<string, unknown> | null = null;
  if (parsed.email || parsed.phone) {
    const orFilters: string[] = [];
    if (parsed.email) orFilters.push(`email.eq.${parsed.email}`);
    if (parsed.phone) orFilters.push(`phone.eq.${parsed.phone}`);
    const { data: existing } = await admin.from("apply_candidates").select("*").or(orFilters.join(",")).limit(1);
    if (existing?.length) candidate = existing[0];
  }

  // Store the resume alongside the candidate record.
  const safeName = (resumeFile.fileName || "resume").replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const resumePath = `apply-ai/${Date.now()}-${safeName}`;
  await admin.storage
    .from("resumes")
    .upload(resumePath, buffer, { contentType: resumeFile.mimeType || "application/octet-stream", upsert: false })
    .catch(() => null);

  if (candidate) {
    await admin
      .from("apply_candidates")
      .update({
        resume_text: resumeText,
        resume_path: resumePath,
        skills: parsed.skills.length ? parsed.skills : candidate.skills,
        years_experience: parsed.years_experience ?? candidate.years_experience,
        whatsapp_opt_in: whatsappOptIn || candidate.whatsapp_opt_in,
        terms_accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", candidate.id as string);
  } else {
    const { data: newCandidate, error } = await admin
      .from("apply_candidates")
      .insert({
        name: parsed.name,
        email: parsed.email,
        phone: parsed.phone,
        location: parsed.location,
        years_experience: parsed.years_experience,
        skills: parsed.skills,
        resume_text: resumeText,
        resume_path: resumePath,
        source: mode === "auto_apply" ? "auto_apply" : "job_posting_apply",
        whatsapp_opt_in: whatsappOptIn,
        terms_accepted_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    candidate = newCandidate;
  }

  const finalCandidate = candidate as Record<string, unknown>;

  const nowIso = new Date().toISOString();
  let targetPostings: Array<Record<string, unknown>> = [];
  if (mode === "auto_apply") {
    const { data } = await admin
      .from("job_postings")
      .select("*")
      .eq("status", "published")
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order("created_at", { ascending: false })
      .limit(AUTO_APPLY_SCAN_LIMIT);
    targetPostings = data || [];
  } else {
    if (jobPostingIds.length === 0) {
      return NextResponse.json({ error: "Select at least one job to apply to." }, { status: 400 });
    }
    const { data } = await admin
      .from("job_postings")
      .select("*")
      .eq("status", "published")
      .in("id", jobPostingIds.slice(0, SEARCH_MODE_CAP));
    targetPostings = data || [];
  }

  type ApplyResult = {
    jobId: string;
    jobTitle: string;
    company: string | null;
    matchScore: number;
    applicationId: string;
  };
  const results: ApplyResult[] = [];

  for (const job of targetPostings) {
    try {
      const screen = await screenCandidate(
        {
          title: job.title as string,
          company: (job.company as string) ?? null,
          must_have_skills: (job.must_have_skills as string[]) ?? [],
          good_to_have_skills: (job.good_to_have_skills as string[]) ?? [],
          qualification: (job.qualification as string) ?? null,
          min_years_experience: (job.min_years_experience as number) ?? null,
        },
        resumeText
      );

      const { data: application, error: appError } = await admin
        .from("job_applications")
        .insert({
          job_posting_id: job.id,
          candidate_name: finalCandidate.name || parsed.name,
          candidate_email: finalCandidate.email || parsed.email || "unknown@example.com",
          candidate_phone: finalCandidate.phone || parsed.phone,
          resume_path: resumePath,
          status: "pending_approval",
          match_score: screen.match_score,
          matched_skills: screen.matched_skills,
          missing_skills: screen.missing_skills,
          ai_evidence: screen.evidence,
          ai_cover_note: screen.cover_note,
          applied_via: mode,
          apply_candidate_id: finalCandidate.id,
        })
        .select()
        .single();

      if (appError || !application) continue;

      results.push({
        jobId: job.id as string,
        jobTitle: job.title as string,
        company: (job.company as string) ?? null,
        matchScore: screen.match_score,
        applicationId: application.id,
      });
    } catch {
      continue;
    }
  }

  const applied = mode === "auto_apply" ? results.sort((a, b) => b.matchScore - a.matchScore).slice(0, AUTO_APPLY_CAP) : results;

  // Clearing the CV-based bar doesn't reach the job poster directly -- it
  // earns the candidate a questionnaire, confirming the job's actual
  // requirements in their own words. Only a verified pass on that gets
  // the poster notified (see the questionnaire submit route).
  for (const r of applied) {
    if (r.matchScore >= SHORTLIST_THRESHOLD && finalCandidate.email) {
      try {
        const q = await createQuestionnaire(r.applicationId);
        await sendQuestionnaireEmail(finalCandidate as { name?: string; email?: string }, r, q.token);
      } catch {
        continue;
      }
    }
  }

  return NextResponse.json({ candidateId: finalCandidate.id, applied, usageStatus: usage.status });
}

async function sendQuestionnaireEmail(
  candidate: { name?: string; email?: string },
  r: { jobTitle: string; company: string | null },
  token: string
) {
  const link = `${process.env.NEXT_PUBLIC_BASE_URL || "https://simplenow.ai"}/apply-questionnaire/${token}`;
  const html = `
    <p>Hi ${candidate.name || "there"},</p>
    <p>Your CV looks like a strong fit for <strong>${r.jobTitle}</strong>${
      r.company ? ` at <strong>${r.company}</strong>` : ""
    }. Before we pass your profile to the employer, a quick 2-minute questionnaire confirms you meet
       their actual requirements -- it's what gets your profile in front of them, not lost in a pile.</p>
    <p><a href="${link}">${link}</a></p>
  `;
  return sendEmail({
    to: candidate.email as string,
    from: APPLY_FROM_ADDRESS,
    subject: `Quick questionnaire -- ${r.jobTitle}${r.company ? ` at ${r.company}` : ""}`,
    html,
  });
}
