import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

// Candidate detail -- profile + every job match, so the profile view
// (spec section 12) has everything in one call.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase;
  try {
    ({ supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;

  const { data: candidate, error } = await supabase.from("shortlist_candidates").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!candidate) return NextResponse.json({ error: "Candidate not found." }, { status: 404 });

  const { data: matches } = await supabase
    .from("shortlist_job_matches")
    .select("*, job:shortlist_jobs(id, title, company, status)")
    .eq("candidate_id", id)
    .order("overall_score", { ascending: false, nullsFirst: false });

  const { data: notes } = await supabase
    .from("shortlist_candidate_notes")
    .select("*")
    .eq("candidate_id", id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ candidate, matches: matches || [], notes: notes || [] });
}

// Every AI-extracted field is manually editable (spec section 13). Fields
// touched here get remembered in manual_fields so a future AI
// re-extraction (there is none automatic today, but this keeps the door
// open) never silently overwrites a recruiter's correction.
const EDITABLE_FIELDS = [
  "name", "email", "phone", "linkedin_url", "current_company", "previous_companies",
  "total_experience_years", "relevant_experience_years", "qualification", "skills",
  "location", "preferred_location", "current_compensation", "expected_compensation",
  "notice_period", "summary",
];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase, user;
  try {
    ({ supabase, user } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const { data: existing } = await supabase.from("shortlist_candidates").select("manual_fields").eq("id", id).maybeSingle();
  const manualFields = new Set<string>(existing?.manual_fields || []);

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of EDITABLE_FIELDS) {
    if (key in body) {
      patch[key] = body[key];
      manualFields.add(key);
    }
  }
  patch.manual_fields = Array.from(manualFields);

  const { data: candidate, error } = await supabase.from("shortlist_candidates").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const admin = createAdminClient();
  await admin.from("shortlist_activity_log").insert({
    user_id: user.id,
    entity_type: "candidate",
    entity_id: id,
    action: "manual_edit",
    detail: { fields: Object.keys(body).filter((k) => EDITABLE_FIELDS.includes(k)) },
  });

  return NextResponse.json({ candidate });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase, user;
  try {
    ({ supabase, user } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;

  const { data: candidate } = await supabase.from("shortlist_candidates").select("id, file_path, user_id").eq("id", id).maybeSingle();
  if (!candidate) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { error } = await supabase.from("shortlist_candidates").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (candidate.file_path && candidate.user_id === user.id) {
    const admin = createAdminClient();
    await admin.storage.from("shortlist").remove([candidate.file_path]).catch(() => null);
  }

  return NextResponse.json({ ok: true });
}
