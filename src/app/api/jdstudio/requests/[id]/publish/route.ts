import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";

// One-click handoff of an approved JD to the existing public Job
// Postings.ai board -- inserts a draft-status row the owner can then
// publish from that tool's own approval flow (job_postings.status
// already gates "draft" -> "pending_approval" -> "approved" -> "published").
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let user, supabase;
  try {
    ({ user, supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }

  const { data: req } = await supabase.from("jdstudio_requests").select("*").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!req) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (req.status !== "approved") {
    return NextResponse.json({ error: "Only an approved JD can be published." }, { status: 400 });
  }
  if (req.job_posting_id) {
    return NextResponse.json({ error: "Already published to Job Postings.ai." }, { status: 400 });
  }

  const draft = req.ai_draft_json || {};
  const { data: posting, error } = await supabase
    .from("job_postings")
    .insert({
      title: req.job_title || "Untitled role",
      department: req.department,
      location: draft.location_mode || null,
      employment_type: draft.employment_type || null,
      description: draft.summary || null,
      requirements: [...(draft.responsibilities || []), ...(draft.must_have_skills || [])].join("\n"),
      must_have_skills: draft.must_have_skills || [],
      good_to_have_skills: draft.good_to_have_skills || [],
      qualification: draft.qualifications || null,
      ctc_budget: draft.compensation_range || null,
      raw_jd_text: [draft.summary, ...(draft.responsibilities || [])].filter(Boolean).join("\n\n"),
      status: "draft",
      created_by: user.id,
      source: "jd_studio_ai",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: updated } = await supabase
    .from("jdstudio_requests")
    .update({ status: "published", job_posting_id: posting.id, published_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  return NextResponse.json({ request: updated, jobPosting: posting });
}
