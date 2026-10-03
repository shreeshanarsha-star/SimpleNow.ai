import { NextResponse } from "next/server";
import { guard, isUuid, jsonError, readBody } from "@/app/tools/nr-synergy/_home/server";
import { audienceMatches, type DocAudience } from "@/app/tools/nr-synergy/knowledge/_lib";

// POST { version_id }: acknowledge a published document version. The
// version must be one the caller can read (RLS) and belong to a document
// that requires acknowledgement. User client: nrs_acknowledgements allows own insert.
export async function POST(req: Request) {
  const g = await guard("knowledge");
  if (!g.ok) return g.res;
  const { ctx, member, supabase } = g;

  const body = await readBody(req);
  const versionId = body?.version_id;
  if (!isUuid(versionId)) return jsonError("version_id is required");

  const { data: verData, error: vErr } = await supabase
    .from("nrs_document_versions")
    .select("id, org_id, document_id, published_at")
    .eq("id", versionId)
    .maybeSingle();
  if (vErr) return jsonError(vErr.message, 500);
  const version = verData as { id: string; org_id: string; document_id: string; published_at: string | null } | null;
  if (!version || !version.published_at || version.org_id !== member.org_id) return jsonError("Document not found", 404);

  const { data: docData, error: dErr } = await supabase
    .from("nrs_documents")
    .select("id, requires_ack, audience, country_code, archived_at")
    .eq("id", version.document_id)
    .maybeSingle();
  if (dErr) return jsonError(dErr.message, 500);
  const doc = docData as {
    id: string;
    requires_ack: boolean;
    audience: DocAudience;
    country_code: string | null;
    archived_at: string | null;
  } | null;
  if (!doc || doc.archived_at) return jsonError("Document not found", 404);
  if (doc.country_code && doc.country_code !== member.home_country) return jsonError("Document not found", 404);
  if (!audienceMatches(doc.audience, ctx)) return jsonError("Document not found", 404);
  if (!doc.requires_ack) return jsonError("This document doesn't need acknowledging");

  const { error: insErr } = await supabase
    .from("nrs_acknowledgements")
    .upsert(
      { version_id: version.id, member_id: member.id, org_id: member.org_id },
      { onConflict: "version_id,member_id", ignoreDuplicates: true }
    );
  if (insErr) return jsonError(insErr.message, 500);
  return NextResponse.json({ ok: true });
}
