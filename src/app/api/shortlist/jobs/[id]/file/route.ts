import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

// Signed JD view/download link -- same inline-by-default pattern as
// Jotz's file route: plain request stays "inline" so the CV/JD viewer
// can embed it directly, ?download=1 forces Content-Disposition: attachment.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase;
  try {
    ({ supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;

  const { data: job, error } = await supabase
    .from("shortlist_jobs")
    .select("jd_file_path, jd_file_name")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!job?.jd_file_path) return NextResponse.json({ error: "No JD file on this job." }, { status: 404 });

  const wantsDownload = new URL(request.url).searchParams.get("download") === "1";
  const admin = createAdminClient();
  const { data: signed, error: signError } = await admin.storage
    .from("shortlist")
    .createSignedUrl(job.jd_file_path, 300, wantsDownload ? { download: job.jd_file_name || true } : undefined);
  if (signError || !signed) {
    return NextResponse.json({ error: signError?.message || "Could not create a link." }, { status: 500 });
  }
  return NextResponse.json({ url: signed.signedUrl, fileName: job.jd_file_name });
}
