import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

const FEATURE_KEY = "Smart Source.ai";

// Signed URL to a Smart Source candidate's originally-dropped CV file, for
// the pipeline table's "click the name" behavior: open LinkedIn if there's
// a profile_url, otherwise fall back to this. Candidates added before
// resume file storage existed, or captured from the extension without a
// CV, simply have no file on record -- resumeFileUrl comes back null, not
// an error, and the caller shows an empty state for that.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase;
  try {
    ({ supabase } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;

  const { data: candidate, error } = await supabase
    .from("smart_source_candidates")
    .select("resume_file_path, resume_file_name, cv_file_name, resume_text")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!candidate) return NextResponse.json({ error: "Candidate not found." }, { status: 404 });

  const c = candidate as {
    resume_file_path?: string | null;
    resume_file_name?: string | null;
    cv_file_name?: string | null;
    resume_text?: string | null;
  };
  const resumeText = c.resume_text?.trim() ? c.resume_text.trim().slice(0, 60_000) : null;
  const fallback = {
    resumeFileUrl: null,
    resumeFileName: c.resume_file_name || c.cv_file_name || null,
    resumeText,
  };

  if (!c.resume_file_path) return NextResponse.json(fallback);

  const admin = createAdminClient();
  const { data: signed, error: signError } = await admin.storage.from("resumes").createSignedUrl(c.resume_file_path, 600);
  if (signError || !signed) {
    console.warn("smart-source resume: signing failed:", signError?.message);
    return NextResponse.json(fallback);
  }

  return NextResponse.json({
    resumeFileUrl: signed.signedUrl,
    resumeFileName: c.resume_file_name || c.cv_file_name || null,
    resumeText,
  });
}
