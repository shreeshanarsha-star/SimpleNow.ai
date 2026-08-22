import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";
import { parseResumeToCandidate } from "@/lib/talentAI";

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

  const { data: requisitionRow } = await supabase
    .from("talent_requisitions")
    .select("org_id, title, description")
    .eq("id", requisitionId)
    .single();
  if (!requisitionRow) {
    return NextResponse.json({ error: "Requisition not found." }, { status: 404 });
  }
  const orgId = requisitionRow.org_id as string;

  if (resumeText && (!name || body.autoParse)) {
    try {
      const requisitionContext = `Role: ${requisitionRow.title}\n${requisitionRow.description || ""}`;

      const parsed = await parseResumeToCandidate(resumeText, requisitionContext);
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
    } catch {
      // AI parse is best-effort -- fall through to whatever the form supplied.
      name = name || "Unnamed candidate";
    }
  }
  if (!name) name = "Unnamed candidate";

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
