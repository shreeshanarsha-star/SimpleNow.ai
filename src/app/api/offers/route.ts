import { NextResponse } from "next/server";
import { requireFeatureAccess, requireUser } from "@/lib/supabase/requireAdmin";

export const maxDuration = 15;
const FEATURE_KEY = "Offer.ai";

export async function POST(request: Request) {
  let user, supabase, orgId;
  try {
    ({ user, supabase, orgId } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }

  const body = await request.json().catch(() => null);
  const candidateName = typeof body?.candidateName === "string" ? body.candidateName.trim() : "";
  const candidateEmail = typeof body?.candidateEmail === "string" ? body.candidateEmail.trim() : "";
  const roleTitle = typeof body?.roleTitle === "string" ? body.roleTitle.trim() : "";
  const proposedCtcAnnual = typeof body?.proposedCtcAnnual === "number" ? body.proposedCtcAnnual : null;
  const currency = typeof body?.currency === "string" ? body.currency.trim() : "INR";
  const components = Array.isArray(body?.components) ? body.components : [];
  const noticePeriod = typeof body?.noticePeriod === "string" ? body.noticePeriod.trim() : null;
  const joiningDate = typeof body?.joiningDate === "string" && body.joiningDate ? body.joiningDate : null;
  const draftNotes = typeof body?.draftNotes === "string" ? body.draftNotes.trim() : null;
  const aiPolishedLetter =
    typeof body?.aiPolishedLetter === "string" ? body.aiPolishedLetter.trim() : null;
  const talentCandidateId =
    typeof body?.talentCandidateId === "string" && body.talentCandidateId ? body.talentCandidateId : null;

  if (!candidateName || !candidateEmail || !roleTitle) {
    return NextResponse.json(
      { error: "Candidate name, email, and role are required." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("offers")
    .insert({
      created_by: user.id,
      candidate_name: candidateName,
      candidate_email: candidateEmail,
      role_title: roleTitle,
      proposed_ctc_annual: proposedCtcAnnual,
      currency: currency || "INR",
      components,
      notice_period: noticePeriod,
      joining_date: joiningDate,
      draft_notes: draftNotes,
      ai_polished_letter: aiPolishedLetter,
      status: "pending_approval",
      org_id: orgId,
      talent_candidate_id: talentCandidateId,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ offer: data }, { status: 201 });
}

export async function GET() {
  let supabase;
  try {
    ({ supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const { data, error } = await supabase
    .from("offers")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ offers: data });
}
