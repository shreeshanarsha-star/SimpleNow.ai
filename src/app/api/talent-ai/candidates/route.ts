import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";
import { parseResumeToCandidate, scoreCandidateFit, scoreCandidateAgainstCriteria, type EligibilityCriteria } from "@/lib/talentAI";
import { normalizeExternalUrl } from "@/lib/url";

const FEATURE_KEY = "Talent.ai";

export async function GET(req: Request) {
  let supabase;
  try {
    ({ supabase } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }

  const { searchParams } = new URL(req.url);
  const requisitionId = searchParams.get("requisitionId");

  let query = supabase
    .from("talent_candidates")
    .select("*")
    .order("created_at", { ascending: false });
  if (requisitionId) query = query.eq("requisition_id", requisitionId);

  const { data: candidates, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ candidates });
}

// Add a candidate. If resumeText is provided and name/email aren't, runs
// the AI parser to fill them in (and, when the requisition's description
// is available, adds a short fit_notes read) -- but a plain manual add
// with just a name always works, no AI required.
export async function POST(req: Request) {
  let supabase, user;
  try {
    ({ supabase, user } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }

  const body = await req.json();
  const requisitionId = body.requisitionId;
  if (!requisitionId) {
    return NextResponse.json({ error: "requisitionId is required." }, { status: 400 });
  }

  let name = (body.name || "").trim();
  let email = body.email || null;
  let phone = body.phone || null;
  let currentCompany: string | null = body.currentCompany || null;
  let currentLocation: string | null = body.currentLocation || null;
  let qualification: string | null = body.qualification || null;
  let linkedinUrl: string | null = body.linkedinUrl || null;
  let experienceYears: number | null = body.experienceYears != null ? Number(body.experienceYears) : null;
  const noticePeriod: string | null = body.noticePeriod || null;
  const currentCtc: number | null = body.currentCtc != null ? Number(body.currentCtc) : null;
  const expectedCtc: number | null = body.expectedCtc != null ? Number(body.expectedCtc) : null;
  let summaryTags: string[] = Array.isArray(body.tags) ? body.tags : [];
  let fitNote: string | null = null;
  const resumeText = body.resumeText || null;
  const resumeFilePath: string | null = body.resumeFilePath || null;
  const resumeFileName: string | null = body.resumeFileName || null;
  let matchScore: number | null = null;
  let matchScoreNote: string | null = null;
  let metMustHaveSkills: string[] | null = null;
  let missingMustHaveSkills: string[] | null = null;

  const { data: requisitionRow } = await supabase
    .from("talent_requisitions")
    .select("org_id, title, description, eligibility_criteria")
    .eq("id", requisitionId)
    .single();
  if (!requisitionRow) {
    return NextResponse.json({ error: "Requisition not found." }, { status: 404 });
  }
  const orgId = requisitionRow.org_id as string;

  // Eligibility criteria (must-have/good-to-have skills the recruiter set,
  // or auto-pulled from the JD) takes priority over plain JD-text scoring
  // when present -- it's a materially more accurate match % since it's
  // graded against what the recruiter actually said they needed, not just
  // general JD similarity.
  const criteria = requisitionRow.eligibility_criteria as EligibilityCriteria | null;
  const hasCriteria = !!criteria && ((criteria.must_have_skills?.length || 0) > 0 || (criteria.good_to_have_skills?.length || 0) > 0);

  // The field-extraction parse and the match score are independent AI
  // calls (parse reads resumeText + role context, score reads resumeText +
  // JD text/criteria -- neither depends on the other's output), so they
  // run concurrently instead of one after another. Previously this route
  // awaited them in series, which doubled the AI wait on every single
  // candidate add and was the main reason bulk resume drops felt slow.
  const jdText = (requisitionRow.description || "").trim();
  const shouldParse = resumeText && (!name || body.autoParse);
  const shouldScore = resumeText && (hasCriteria || jdText);

  const [parseResult, scoreResult] = await Promise.allSettled([
    shouldParse
      ? parseResumeToCandidate(resumeText, `Role: ${requisitionRow.title}\n${requisitionRow.description || ""}`)
      : Promise.resolve(null),
    shouldScore
      ? hasCriteria
        ? scoreCandidateAgainstCriteria(criteria as EligibilityCriteria, resumeText)
        : scoreCandidateFit(resumeText, jdText)
      : Promise.resolve(null),
  ]);

  if (parseResult.status === "fulfilled" && parseResult.value) {
    const parsed = parseResult.value;
    name = name || parsed.name || "Unnamed candidate";
    email = email || parsed.email;
    phone = phone || parsed.phone;
    currentCompany = currentCompany || parsed.current_company;
    currentLocation = currentLocation || parsed.location;
    qualification = qualification || parsed.qualification;
    linkedinUrl = linkedinUrl || parsed.linkedin_url;
    if (experienceYears == null) experienceYears = parsed.years_experience;
    if (parsed.key_skills?.length) summaryTags = Array.from(new Set([...summaryTags, ...parsed.key_skills]));
    fitNote = parsed.fit_notes;
  }
  if (!name) name = "Unnamed candidate";
  linkedinUrl = normalizeExternalUrl(linkedinUrl);

  if (scoreResult.status === "fulfilled" && scoreResult.value) {
    matchScore = scoreResult.value.score;
    matchScoreNote = scoreResult.value.note || null;
    if (hasCriteria) {
      const criteriaResult = scoreResult.value as Awaited<ReturnType<typeof scoreCandidateAgainstCriteria>>;
      metMustHaveSkills = criteriaResult.met_must_have_skills;
      missingMustHaveSkills = criteriaResult.missing_must_have_skills;
    }
  }
  // Both are best-effort by design (a rejected promise here just means the
  // candidate is added unparsed/unscored, same as before) -- no catch
  // needed since Promise.allSettled never rejects.

  // Look up-or-create the person's identity record, scoped to this org and
  // deduped by email (when we have one) so the same person applying to
  // multiple requisitions resolves to a single talent_people row instead of
  // a disconnected duplicate every time.
  let personId: string | null = null;
  if (email) {
    const { data: existingPerson } = await supabase
      .from("talent_people")
      .select("id")
      .eq("org_id", orgId)
      .ilike("email", email)
      .limit(1)
      .maybeSingle();
    if (existingPerson) personId = existingPerson.id;
  }
  if (!personId) {
    const { data: newPerson, error: personError } = await supabase
      .from("talent_people")
      .insert({
        org_id: orgId,
        name,
        email,
        phone,
        resume_text: resumeText,
        source: body.source || "other",
        current_company: currentCompany,
        current_location: currentLocation,
        qualification,
        notice_period: noticePeriod,
        linkedin_url: linkedinUrl,
        experience_years: experienceYears,
        tags: summaryTags,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (personError) {
      return NextResponse.json({ error: personError.message }, { status: 500 });
    }
    personId = newPerson.id;
  }

  const { data: candidate, error } = await supabase
    .from("talent_candidates")
    .insert({
      requisition_id: requisitionId,
      person_id: personId,
      name,
      email,
      phone,
      resume_text: resumeText,
      source: body.source || "other",
      stage: body.stage || "applied",
      tags: summaryTags,
      created_by: user.id,
      current_company: currentCompany,
      current_location: currentLocation,
      qualification,
      linkedin_url: linkedinUrl,
      experience_years: experienceYears,
      notice_period: noticePeriod,
      current_ctc: currentCtc,
      expected_ctc: expectedCtc,
      resume_file_path: resumeFilePath,
      resume_file_name: resumeFileName,
      match_score: matchScore,
      match_score_note: matchScoreNote,
      match_score_computed_at: matchScore != null ? new Date().toISOString() : null,
      met_must_have_skills: metMustHaveSkills,
      missing_must_have_skills: missingMustHaveSkills,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("talent_stage_history").insert({
    candidate_id: candidate.id,
    from_stage: null,
    to_stage: candidate.stage,
    changed_by: user.id,
    note: "Added to pipeline",
  });

  if (fitNote) {
    await supabase.from("talent_notes").insert({
      candidate_id: candidate.id,
      author_id: user.id,
      body: `AI resume read: ${fitNote}`,
    });
  }

  return NextResponse.json({ candidate });
}
