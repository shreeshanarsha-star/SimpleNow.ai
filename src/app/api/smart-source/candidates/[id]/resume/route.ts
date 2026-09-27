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
    .select("resume_file_path, resume_file_name")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!candidate) return NextResponse.json({ error: "Candidate not found." }, { status: 404 });

  const resumeFilePath = (candidate as { resume_file_path?: string | null }).resume_file_path;
  if (!resumeFilePath) {
    return NextResponse.json({ resumeFileUrl: null, resumeFileName: null });
  }

  const admin = createAdminClient();
  const { data: signed, error: signError } = await admin.storage.from("resumes").createSignedUrl(resumeFilePath, 600);
  if (signError || !signed) {
    return NextResponse.json({ resumeFileUrl: null, resumeFileName: null });
  }

  return NextResponse.json({
    resumeFileUrl: signed.signedUrl,
    resumeFileName: (candidate as { resume_file_name?: string | null }).resume_file_name || null,
  });
}
