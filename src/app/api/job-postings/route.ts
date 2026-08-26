import { NextResponse } from "next/server";
import { requireFeatureAccess, requireUser } from "@/lib/supabase/requireAdmin";

export const maxDuration = 15;

const FEATURE_KEY = "Job Postings.ai";

type PostingInput = {
  fileName?: string;
  title?: string;
  company?: string;
  company_url?: string | null;
  location?: string;
  must_have_skills?: string[];
  good_to_have_skills?: string[];
  qualification?: string;
  min_years_experience?: number | null;
  industry?: string | null;
  ctc_budget?: string | null;
  raw_jd_text?: string;
  // Legacy fields kept for backward-compat with any old callers/drafts.
  description?: string;
  requirements?: string;
  employmentType?: string;
  aiPolishedDescription?: string | null;
};

export async function POST(request: Request) {
  let user, supabase, orgId;
  try {
    ({ user, supabase, orgId } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }

  const body = await request.json().catch(() => null);
  const postings: PostingInput[] = Array.isArray(body?.postings)
    ? body.postings
    : body
    ? [body]
    : [];

  if (postings.length === 0) {
    return NextResponse.json({ error: "No postings to submit." }, { status: 400 });
  }

  const results: Array<{
    fileName: string;
    ok: boolean;
    id?: string;
    title?: string;
    company?: string;
    error?: string;
  }> = [];

  for (const p of postings) {
    const title = (p.title || "").trim();
    if (!title) {
      results.push({ fileName: p.fileName || "untitled", ok: false, error: "Title is required." });
      continue;
    }

    const description = (p.raw_jd_text || p.description || title).trim();

    const { data, error } = await supabase
      .from("job_postings")
      .insert({
        title,
        description,
        company: (p.company || "").trim() || null,
        company_url: (p.company_url || "").trim() || null,
        location: (p.location || "").trim() || null,
        employment_type: (p.employmentType || "").trim() || null,
        must_have_skills: Array.isArray(p.must_have_skills) ? p.must_have_skills.slice(0, 3) : [],
        good_to_have_skills: Array.isArray(p.good_to_have_skills) ? p.good_to_have_skills.slice(0, 3) : [],
        qualification: (p.qualification || "").trim() || null,
        min_years_experience: typeof p.min_years_experience === "number" ? p.min_years_experience : null,
        industry: (p.industry || "").trim() || null,
        ctc_budget: (p.ctc_budget || "").trim() || null,
        raw_jd_text: p.raw_jd_text || null,
        ai_polished_description: p.aiPolishedDescription || null,
        requirements: (p.requirements || "").trim() || null,
        status: "pending_approval",
        created_by: user.id,
        org_id: orgId,
      })
      .select("id, title, company")
      .single();

    if (error) {
      results.push({ fileName: p.fileName || title, ok: false, error: error.message });
      continue;
    }
    results.push({ fileName: p.fileName || title, ok: true, id: data.id, title: data.title, company: data.company });
  }

  return NextResponse.json({ results }, { status: 201 });
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
