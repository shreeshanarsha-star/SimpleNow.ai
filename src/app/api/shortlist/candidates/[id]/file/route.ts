import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase;
  try {
    ({ supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;

  const { data: candidate, error } = await supabase
    .from("shortlist_candidates")
    .select("file_path, file_name")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!candidate?.file_path) return NextResponse.json({ error: "No CV on file for this candidate." }, { status: 404 });

  const wantsDownload = new URL(request.url).searchParams.get("download") === "1";
  const admin = createAdminClient();
  const { data: signed, error: signError } = await admin.storage
    .from("shortlist")
    .createSignedUrl(candidate.file_path, 300, wantsDownload ? { download: candidate.file_name || true } : undefined);
  if (signError || !signed) {
    return NextResponse.json({ error: signError?.message || "Could not create a link." }, { status: 500 });
  }
  return NextResponse.json({ url: signed.signedUrl, fileName: candidate.file_name });
}
