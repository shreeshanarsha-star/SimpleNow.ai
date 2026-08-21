import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 15;

// Public — candidates apply without an account. RLS already enforces that
// inserts only succeed against a published job_posting; this route adds
// friendlier validation/error messages on top of that DB-level guarantee.
export async function POST(request: Request) {
  const supabase = await createClient();

  const body = await request.json().catch(() => null);
  const jobPostingId = typeof body?.jobPostingId === "string" ? body.jobPostingId : "";
  const candidateName =
    typeof body?.candidateName === "string" ? body.candidateName.trim() : "";
  const candidateEmail =
    typeof body?.candidateEmail === "string" ? body.candidateEmail.trim() : "";
  const candidatePhone =
    typeof body?.candidatePhone === "string" ? body.candidatePhone.trim() : "";
  const coverNote = typeof body?.coverNote === "string" ? body.coverNote.trim() : "";
  const resumePath = typeof body?.resumePath === "string" ? body.resumePath.trim() : "";

  if (!jobPostingId || !candidateName || !candidateEmail || !resumePath) {
    return NextResponse.json(
      { error: "Name, email, resume, and the role you're applying to are required." },
      { status: 400 }
    );
  }

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidateEmail);
  if (!emailOk) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const { data: job } = await supabase
    .from("job_postings")
    .select("id, status")
    .eq("id", jobPostingId)
    .maybeSingle();

  if (!job || job.status !== "published") {
    return NextResponse.json(
      { error: "This role is no longer accepting applications." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("job_applications")
    .insert({
      job_posting_id: jobPostingId,
      candidate_name: candidateName,
      candidate_email: candidateEmail,
      candidate_phone: candidatePhone || null,
      cover_note: coverNote || null,
      resume_path: resumePath,
      status: "pending_approval",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ application: data }, { status: 201 });
}
