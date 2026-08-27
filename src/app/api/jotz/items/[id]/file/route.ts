import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

// Owner-only signed download/view link -- same pattern as
// /api/contracts/[id]/download: never expose the storage path directly,
// and RLS on jotz_items (checked here via the per-request client) is what
// stops one user from ever requesting another user's file.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let supabase;
  try {
    ({ supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const { id } = await params;

  const { data: item, error } = await supabase
    .from("jotz_items")
    .select("file_path, file_name")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!item?.file_path) return NextResponse.json({ error: "No file on this item." }, { status: 404 });

  // ?download=1 -> forces Content-Disposition: attachment (Download button).
  // Otherwise the URL stays "inline" so View / Share open the file directly
  // in the browser (images/PDFs render in-tab) instead of always downloading.
  const wantsDownload = new URL(request.url).searchParams.get("download") === "1";

  const admin = createAdminClient();
  const { data: signed, error: signError } = await admin.storage
    .from("jotz")
    .createSignedUrl(item.file_path, 300, wantsDownload ? { download: item.file_name || true } : undefined);
  if (signError || !signed) {
    return NextResponse.json({ error: signError?.message || "Could not create a link." }, { status: 500 });
  }

  return NextResponse.json({ url: signed.signedUrl, fileName: item.file_name });
}
