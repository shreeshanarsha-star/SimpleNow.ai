import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractDocumentText } from "@/lib/contracts/textExtract";
import {
  classifyDocument,
  extractJob,
  extractCandidate,
  scoreCandidateAgainstJob,
  findLikelyDuplicate,
  hashText,
  hashBytes,
} from "@/lib/shortlistAI";

// Shortlist.ai -- one document per request (the client loops over a
// multi-file drop and calls this once per file, so it can show real
// "N / total analyzed" progress and one failed file never blocks the
// rest). Never loses the original file even if AI classification or
// extraction fails partway through.
export const maxDuration = 90;

const MAX_BYTES = 15 * 1024 * 1024;
const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export async function POST(request: Request) {
  let user, supabase;
  try {
    ({ user, supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file to process." }, { status: 400 });
  }
  if (file.size === 0) return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That file is too large (max 15MB)." }, { status: 400 });

  const lowerName = file.name.toLowerCase();
  const extFromName = (lowerName.match(/\.(pdf|docx?|)$/)?.[1] || "");
  const ext = EXT_BY_MIME[file.type] || extFromName;
  if (!ext || !["pdf", "doc", "docx"].includes(ext)) {
    return NextResponse.json(
      { fileName: file.name, status: "unknown", message: "Unsupported file type -- Shortlist.ai reads PDF and Word documents." },
      { status: 200 }
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const admin = createAdminClient();

  // 1. Read.
  let fullText = "";
  try {
    const extracted = await extractDocumentText(Buffer.from(bytes), file.name, file.type);
    fullText = extracted.fullText || "";
  } catch (err) {
    return NextResponse.json({
      fileName: file.name,
      status: "error",
      message: err instanceof Error ? `Couldn't read this file: ${err.message}` : "Couldn't read this file.",
    });
  }
  if (!fullText || fullText.trim().length < 30) {
    return NextResponse.json({
      fileName: file.name,
      status: "unknown",
      message: "Couldn't find enough readable text in this document.",
    });
  }

  // 2. Analyze -- classify JD vs CV vs unknown.
  let classification;
  try {
    classification = await classifyDocument(fullText);
  } catch (err) {
    return NextResponse.json({
      fileName: file.name,
      status: "error",
      message: err instanceof Error ? `AI classification failed: ${err.message}` : "AI classification failed.",
    });
  }

  if (classification.kind === "unknown") {
    return NextResponse.json({
      fileName: file.name,
      status: "unknown",
      message: classification.reason || "Couldn't identify this as a job description or a resume.",
    });
  }

  const fileId = randomUUID();
  const kindFolder = classification.kind === "jd" ? "jobs" : "candidates";
  const filePath = `${user.id}/${kindFolder}/${fileId}.${ext}`;

  const { error: uploadError } = await admin.storage
    .from("shortlist")
    .upload(filePath, bytes, { contentType: file.type || "application/octet-stream", upsert: false });
  if (uploadError) {
    return NextResponse.json({
      fileName: file.name,
      status: "error",
      message: `Couldn't save this file: ${uploadError.message}`,
    });
  }

  // --- Job Description path -------------------------------------------------
  if (classification.kind === "jd") {
    const jdHash = hashText(fullText);
    const { data: existingJob } = await supabase
      .from("shortlist_jobs")
      .select("*")
      .eq("jd_hash", jdHash)
      .maybeSingle();
    if (existingJob) {
      return NextResponse.json({ fileName: file.name, status: "job_reused", job: existingJob });
    }

    let extracted;
    try {
      extracted = await extractJob(fullText);
    } catch (err) {
      // The file is safe either way -- still create a bare Job so the
      // recruiter isn't left with nothing, but be honest it needs review.
      const { data: job } = await admin
        .from("shortlist_jobs")
        .insert({
          id: fileId,
          user_id: user.id,
          title: file.name.replace(/\.(pdf|docx?|)$/i, ""),
          jd_file_path: filePath,
          jd_file_name: file.name,
          jd_mime_type: file.type || null,
          jd_text: fullText,
          jd_hash: jdHash,
          status: "open",
          ai_status: "failed",
          ai_error: err instanceof Error ? err.message : "AI extraction failed.",
        })
        .select()
        .single();
      return NextResponse.json({
        fileName: file.name,
        status: "job_created",
        job,
        message: "Saved the JD, but AI extraction failed -- fields need manual entry.",
      });
    }

    const { data: job, error: insertError } = await admin
      .from("shortlist_jobs")
      .insert({
        id: fileId,
        user_id: user.id,
        title: extracted.title,
        company: extracted.company,
        job_ref: extracted.job_ref,
        department: extracted.department,
        location: extracted.location,
        work_mode: extracted.work_mode,
        experience_required: extracted.experience_required,
        min_experience_years: extracted.min_experience_years,
        qualification: extracted.qualification,
        required_skills: extracted.required_skills,
        preferred_skills: extracted.preferred_skills,
        industry: extracted.industry,
        comp_min: extracted.comp_min,
        comp_max: extracted.comp_max,
        comp_currency: extracted.comp_currency,
        notice_period_requirement: extracted.notice_period_requirement,
        other_requirements: extracted.other_requirements,
        role_summary: extracted.role_summary,
        jd_file_path: filePath,
        jd_file_name: file.name,
        jd_mime_type: file.type || null,
        jd_text: fullText,
        jd_hash: jdHash,
        status: "open",
        ai_status: "done",
      })
      .select()
      .single();
    if (insertError) {
      return NextResponse.json({ fileName: file.name, status: "error", message: insertError.message });
    }

    await admin.from("shortlist_activity_log").insert({
      user_id: user.id,
      entity_type: "job",
      entity_id: job.id,
      action: "jd_uploaded",
      detail: { file_name: file.name },
    });

    // Match this brand-new job against the candidate library already on
    // file -- "drop JD -> search existing candidates" from the spec,
    // not just newly-dropped CVs.
    await matchJobAgainstExistingCandidates(admin, user.id, job).catch(() => null);

    return NextResponse.json({ fileName: file.name, status: "job_created", job });
  }

  // --- CV path -------------------------------------------------
  const resumeHash = hashBytes(bytes);
  const { data: exactDuplicate } = await supabase
    .from("shortlist_candidates")
    .select("*")
    .eq("resume_hash", resumeHash)
    .maybeSingle();
  if (exactDuplicate) {
    await matchCandidateAgainstAllJobs(admin, user.id, exactDuplicate).catch(() => null);
    return NextResponse.json({
      fileName: file.name,
      status: "candidate_reused",
      candidate: exactDuplicate,
      message: "This exact CV is already in your candidate library -- re-matched against your jobs.",
    });
  }

  let extracted;
  try {
    extracted = await extractCandidate(fullText);
  } catch (err) {
    const { data: candidate } = await admin
      .from("shortlist_candidates")
      .insert({
        id: fileId,
        user_id: user.id,
        name: file.name.replace(/\.(pdf|docx?|)$/i, ""),
        file_path: filePath,
        file_name: file.name,
        mime_type: file.type || null,
        resume_text: fullText,
        resume_hash: resumeHash,
        ai_status: "failed",
        ai_error: err instanceof Error ? err.message : "AI extraction failed.",
      })
      .select()
      .single();
    return NextResponse.json({
      fileName: file.name,
      status: "candidate_created",
      candidate,
      message: "Saved the CV, but AI extraction failed -- fields need manual entry.",
    });
  }

  // Existing-candidate duplicate check via shared identifiers (email/
  // phone/linkedin/exact name) -- flagged, never silently merged.
  const { data: existingCandidates } = await supabase
    .from("shortlist_candidates")
    .select("id, name, email, phone, linkedin_url")
    .neq("resume_hash", resumeHash);
  const likelyDup = findLikelyDuplicate(
    { email: extracted.email, phone: extracted.phone, linkedin_url: extracted.linkedin_url, name: extracted.name },
    existingCandidates || []
  );

  const { data: candidate, error: candError } = await admin
    .from("shortlist_candidates")
    .insert({
      id: fileId,
      user_id: user.id,
      name: extracted.name,
      email: extracted.email,
      phone: extracted.phone,
      linkedin_url: extracted.linkedin_url,
      current_company: extracted.current_company,
      previous_companies: extracted.previous_companies,
      total_experience_years: extracted.total_experience_years,
      relevant_experience_years: extracted.relevant_experience_years,
      qualification: extracted.qualification,
      skills: extracted.skills,
      location: extracted.location,
      preferred_location: extracted.preferred_location,
      current_compensation: extracted.current_compensation,
      expected_compensation: extracted.expected_compensation,
      notice_period: extracted.notice_period,
      summary: extracted.summary,
      file_path: filePath,
      file_name: file.name,
      mime_type: file.type || null,
      resume_text: fullText,
      resume_hash: resumeHash,
      dedupe_status: likelyDup ? "possible_duplicate" : "none",
      duplicate_of: likelyDup ? likelyDup.id : null,
      ai_status: "done",
    })
    .select()
    .single();
  if (candError) {
    return NextResponse.json({ fileName: file.name, status: "error", message: candError.message });
  }

  await admin.from("shortlist_activity_log").insert({
    user_id: user.id,
    entity_type: "candidate",
    entity_id: candidate.id,
    action: "cv_uploaded",
    detail: { file_name: file.name },
  });

  await matchCandidateAgainstAllJobs(admin, user.id, candidate).catch(() => null);

  return NextResponse.json({
    fileName: file.name,
    status: "candidate_created",
    candidate,
    possibleDuplicate: likelyDup ? { id: likelyDup.id, name: likelyDup.name } : null,
  });
}

// Shared matching helpers -- reused by both the JD path (match a new job
// against the existing candidate library) and the CV path (match a new
// candidate against every open job). Scored in parallel, capped, so one
// slow AI call doesn't serialize the whole batch; a single dimension
// failing never aborts the others.
async function matchCandidateAgainstAllJobs(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  candidate: Record<string, unknown>
) {
  const { data: jobs } = await admin
    .from("shortlist_jobs")
    .select("*")
    .eq("user_id", userId)
    .neq("status", "closed")
    .order("created_at", { ascending: false })
    .limit(25);
  if (!jobs?.length) return;
  await Promise.all(jobs.map((job) => scoreAndUpsertMatch(admin, userId, job, candidate).catch(() => null)));
}

async function matchJobAgainstExistingCandidates(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  job: Record<string, unknown>
) {
  const { data: candidates } = await admin
    .from("shortlist_candidates")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(25);
  if (!candidates?.length) return;
  await Promise.all(candidates.map((c) => scoreAndUpsertMatch(admin, userId, job, c).catch(() => null)));
}

async function scoreAndUpsertMatch(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  job: Record<string, unknown>,
  candidate: Record<string, unknown>
) {
  const evaluation = await scoreCandidateAgainstJob(
    job as unknown as Parameters<typeof scoreCandidateAgainstJob>[0],
    candidate as unknown as Parameters<typeof scoreCandidateAgainstJob>[1],
    (candidate.resume_text as string) || ""
  );
  await admin.from("shortlist_job_matches").upsert(
    {
      user_id: userId,
      job_id: job.id,
      candidate_id: candidate.id,
      overall_score: evaluation.overall_score,
      score_breakdown: evaluation.score_breakdown,
      evaluation: evaluation.evaluation,
      strengths: evaluation.strengths,
      concerns: evaluation.concerns,
      missing_requirements: evaluation.missing_requirements,
      matching_skills: evaluation.matching_skills,
      evaluated_at: new Date().toISOString(),
    },
    { onConflict: "job_id,candidate_id", ignoreDuplicates: false }
  );
}

