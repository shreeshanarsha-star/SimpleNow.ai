import { NextResponse } from "next/server";
import { requireFeatureAccess, requireUser } from "@/lib/supabase/requireAdmin";

export const maxDuration = 15;

const FEATURE_KEY = "Job Postings.ai";

export async function POST(request: Request) {
  let user, supabase;
  try {
    ({ user, supabase } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const description =
    typeof body?.description === "string" ? body.description.trim() : "";
  const requirements =
    typeof body?.requirements === "string" ? body.requirements.trim() : "";
  const location = typeof body?.location === "string" ? body.location.trim() : "";
  const employmentType =
    typeof body?.employmentType === "string" ? body.employmentType.trim() : "";
  const aiPolishedDescription =
    typeof body?.aiPolishedDescription === "string"
      ? body.aiPolishedDescription.trim()
      : null;

  if (!title || !description) {
    return NextResponse.json(
      { error: "title and description are required." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("job_postings")
    .insert({
      title,
      description,
      requirements: requirements || null,
      location: location || null,
      employment_type: employmentType || null,
      ai_polished_description: aiPolishedDescription,
      status: "pending_approval",
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ jobPosting: data }, { status: 201 });
}

// RLS already scopes results correctly (admin sees all, a granted user sees
// only their own postings) — this route just needs a signed-in user.
export async function GET() {
  let supabase;
  try {
    ({ supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }

  const { data, error } = await supabase
    .from("job_postings")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ jobPostings: data });
}
