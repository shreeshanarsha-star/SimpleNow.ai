import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { HttpError } from "@/lib/nrs/invoice/kit";
import { guard, isUuid, jsonError } from "@/app/tools/nr-synergy/_home/server";
import { audienceMatches, type DocAudience } from "@/app/tools/nr-synergy/knowledge/_lib";
import { policyDownloadName, policySignedUrl } from "@/app/api/nr-synergy/admin/versions/_pdf";

export const dynamic = "force-dynamic";

// GET ?version_id=&download=1  ->  { url } (signed, 10 minutes)
// The caller must be able to see the document in their Library: the version
// is published, the document isn't archived, it is global or for their home
// country, and its audience matches them. The version is read with the
// caller's own client (RLS), then re-checked here; the file is signed with
// the service role because the bucket has no client policies.
export async function GET(req: Request) {
  const g = await guard("knowledge");
  if (!g.ok) return g.res;
  const { ctx, member, supabase } = g;

  const params = new URL(req.url).searchParams;
  const versionId = params.get("version_id");
  if (!isUuid(versionId)) return jsonError("version_id is required");

  const { data: verData, error: vErr } = await supabase
    .from("nrs_document_versions")
    .select("id, org_id, document_id, version, file_path, published_at")
    .eq("id", versionId)
    .maybeSingle();
  if (vErr) return jsonError(vErr.message, 500);
  const version = verData as {
    id: string;
    org_id: string;
    document_id: string;
    version: string;
    file_path: string | null;
    published_at: string | null;
  } | null;
  if (!version || !version.published_at || version.org_id !== member.org_id) return jsonError("Document not found", 404);

  const { data: docData, error: dErr } = await supabase
    .from("nrs_documents")
    .select("id, title, audience, country_code, archived_at")
    .eq("id", version.document_id)
    .eq("org_id", member.org_id)
    .maybeSingle();
  if (dErr) return jsonError(dErr.message, 500);
  const doc = docData as { id: string; title: string; audience: DocAudience; country_code: string | null; archived_at: string | null } | null;
  if (!doc || doc.archived_at) return jsonError("Document not found", 404);
  if (doc.country_code && doc.country_code !== member.home_country) return jsonError("Document not found", 404);
  if (!audienceMatches(doc.audience, ctx)) return jsonError("Document not found", 404);
  if (!version.file_path) return jsonError("This version has no PDF", 404);

  try {
    const url = await policySignedUrl(createAdminClient(), member.org_id, version.file_path, {
      download: params.get("download") === "1" ? policyDownloadName(doc.title, version.version) : undefined,
    });
    return NextResponse.json({ url, expiresIn: 600 }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof HttpError) return jsonError(e.message, e.status);
    return jsonError("Could not open the file", 500);
  }
}
