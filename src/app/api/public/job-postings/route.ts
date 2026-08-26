import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractDocumentText } from "@/lib/contracts/textExtract";
import { structureJD } from "@/lib/jobPostings/structure";
import { getClientIp, checkAndRecordPostingUsage } from "@/lib/jobPostings/gating";

export const maxDuration = 60;

const MAX_FILES = 10;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

// Public, unauthenticated Job Postings.ai — the old askshree-app free-board
// flow. Anyone can upload up to 10 JDs; AI structures each into a listing;
// 3 free postings per IP (checkAndRecordPostingUsage), signed-in users
// bypass the limit entirely. Every posting lands as pending_approval and
// only becomes visible on /jobs once an admin approves + publishes it.
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

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const termsAccepted = form.get("termsAccepted") === "true";
  if (!termsAccepted) {
    return NextResponse.json(
      { error: "You must confirm you're authorized to post this role." },
      { status: 400 }
    );
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "Attach at least one job description." }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Up to ${MAX_FILES} files at a time.` }, { status: 400 });
  }

  const admin = createAdminClient();
  const results: Array<{
    fileName: string;
    ok: boolean;
    id?: string;
    title?: string;
    company?: string;
    error?: string;
  }> = [];

  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      results.push({ fileName: file.name, ok: false, error: "File is over 5MB." });
      continue;
    }
    if (!ALLOWED_TYPES.includes(file.type) && !/\.(pdf|doc|docx)$/i.test(file.name)) {
      results.push({ fileName: file.name, ok: false, error: "Must be a PDF or Word document." });
      continue;
    }

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const { fullText } = await extractDocumentText(buffer, file.name, file.type);
      if (!fullText || fullText.trim().length < 30) {
        results.push({ fileName: file.name, ok: false, error: "Couldn't read any text from this file." });
        continue;
      }

      const structured = await structureJD(fullText);

      const { data, error } = await admin
        .from("job_postings")
        .insert({
          title: structured.title,
          company: structured.company,
          company_url: structured.company_url,
          location: structured.location,
          must_have_skills: structured.must_have_skills,
          good_to_have_skills: structured.good_to_have_skills,
          qualification: structured.qualification,
          min_years_experience: structured.min_years_experience,
          industry: structured.industry,
          ctc_budget: structured.ctc_budget,
          description: fullText,
          raw_jd_text: fullText,
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
        results.push({ fileName: file.name, ok: false, error: error.message });
        continue;
      }

      results.push({ fileName: file.name, ok: true, id: data.id, title: data.title, company: data.company });
    } catch (err) {
      results.push({
        fileName: file.name,
        ok: false,
        error: err instanceof Error ? err.message : "Couldn't process this file.",
      });
    }
  }

  return NextResponse.json({ results, usageStatus: usage.status });
}
