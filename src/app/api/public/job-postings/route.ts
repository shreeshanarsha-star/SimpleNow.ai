import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClientIp, checkAndRecordPostingUsage } from "@/lib/jobPostings/gating";

export const maxDuration = 30;

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
};

// Step 2 of the public posting flow: the user has reviewed (and possibly
// edited) the AI-structured draft(s) from /analyze; this inserts the
// final, user-confirmed postings as pending_approval. This is the only
// step that consumes the 3-free-postings-per-IP quota.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ip = getClientIp(request);
  const usage = await checkAndRecordPostingUsage(ip, user?.id ?? null);
  if (!usage.allowed) {
    return NextResponse.json({ error: usage.message || "Free posting limit reached." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const termsAccepted = !!body?.termsAccepted;
  const postings: PostingInput[] = Array.isArray(body?.postings) ? body.postings : [];

  if (!termsAccepted) {
    return NextResponse.json(
      { error: "You must confirm you're authorized to post this role." },
      { status: 400 }
    );
  }
  if (postings.length === 0) {
    return NextResponse.json({ error: "No postings to submit." }, { status: 400 });
  }

  const admin = createAdminClient();
  const results: Array<{ fileName: string; ok: boolean; id?: string; title?: string; company?: string; error?: string }> = [];

  for (const p of postings) {
    const title = (p.title || "").trim();
    if (!title) {
      results.push({ fileName: p.fileName || "untitled", ok: false, error: "Title is required." });
      continue;
    }

    const { data, error } = await admin
      .from("job_postings")
      .insert({
        title,
        company: (p.company || "").trim() || null,
        company_url: (p.company_url || "").trim() || null,
        location: (p.location || "").trim() || null,
        must_have_skills: Array.isArray(p.must_have_skills) ? p.must_have_skills.slice(0, 3) : [],
        good_to_have_skills: Array.isArray(p.good_to_have_skills) ? p.good_to_have_skills.slice(0, 3) : [],
        qualification: (p.qualification || "").trim() || null,
        min_years_experience: typeof p.min_years_experience === "number" ? p.min_years_experience : null,
        industry: (p.industry || "").trim() || null,
        ctc_budget: (p.ctc_budget || "").trim() || null,
        description: p.raw_jd_text || title,
        raw_jd_text: p.raw_jd_text || null,
        status: "pending_approval",
        source: "public",
        posted_ip: ip,
        terms_accepted_at: new Date().toISOString(),
        created_by: user?.id ?? null,
        org_id: null,
      })
      .select("id, title, company")
      .single();

    if (error) {
      results.push({ fileName: p.fileName || title, ok: false, error: error.message });
      continue;
    }
    results.push({ fileName: p.fileName || title, ok: true, id: data.id, title: data.title, company: data.company });
  }

  return NextResponse.json({ results, usageStatus: usage.status });
}
