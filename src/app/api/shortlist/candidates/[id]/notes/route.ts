import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

// Recruiter notes -- deliberately a separate table from AI evaluation
// fields (spec section 22) so AI can never overwrite them.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase;
  try {
    ({ supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;
  const { data: notes, error } = await supabase
    .from("shortlist_candidate_notes")
    .select("*")
    .eq("candidate_id", id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notes: notes || [] });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase, user;
  try {
    ({ supabase, user } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (!note) return NextResponse.json({ error: "Note text is required." }, { status: 400 });
  const jobId = typeof body.job_id === "string" ? body.job_id : null;

  const { data: created, error } = await supabase
    .from("shortlist_candidate_notes")
    .insert({ user_id: user.id, candidate_id: id, job_id: jobId, note })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const admin = createAdminClient();
  await admin.from("shortlist_activity_log").insert({
    user_id: user.id,
    entity_type: "candidate",
    entity_id: id,
    action: "note_added",
    detail: { job_id: jobId },
  });

  return NextResponse.json({ note: created });
}
