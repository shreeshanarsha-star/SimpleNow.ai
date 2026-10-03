import type { SupabaseClient } from "@supabase/supabase-js";
import type { NrsContext, NrsMember } from "@/lib/nrs/member";

export const DOC_CATEGORIES = ["hr", "travel_expense", "conduct", "it_security", "sop", "forms", "company"] as const;
export type DocCategory = (typeof DOC_CATEGORIES)[number];
export type DocAudience = "all" | "consultant" | "payroll" | "managers";

export interface DocRow {
  id: string;
  category: DocCategory;
  title: string;
  country_code: string | null;
  audience: DocAudience;
  requires_ack: boolean;
}

export interface VersionRow {
  id: string;
  document_id: string;
  version: string;
  effective_from: string;
  summary: string | null;
  body_markdown: string | null;
  published_at: string | null;
}

export interface LibraryDoc extends DocRow {
  version: VersionRow;
  ackedAt: string | null;
}

/** Can this caller see a document meant for `audience`? HR sees everything. */
export function audienceMatches(audience: DocAudience, ctx: NrsContext): boolean {
  if (ctx.isHr || audience === "all") return true;
  if (audience === "managers") return ctx.isManager;
  return ctx.engagementType === audience;
}

/** Of a document's published versions (newest first), the one in force today, else the newest. */
function currentVersion(versions: VersionRow[], today: string): VersionRow | undefined {
  return versions.find((v) => v.effective_from <= today) ?? versions[0];
}

/**
 * The member's Library: non-archived documents that are global or for their
 * home country, matching their audience, with the current published version
 * and whether they've acknowledged it. Optionally a single document.
 */
export async function loadLibrary(
  supabase: SupabaseClient,
  ctx: NrsContext,
  member: NrsMember,
  opts: { documentId?: string; requiresAckOnly?: boolean; withBody?: boolean } = {}
): Promise<LibraryDoc[]> {
  const country = /^[A-Za-z]{2}$/.test(member.home_country) ? member.home_country : null;
  let q = supabase
    .from("nrs_documents")
    .select("id, category, title, country_code, audience, requires_ack")
    .eq("org_id", member.org_id)
    .is("archived_at", null);
  q = country ? q.or(`country_code.is.null,country_code.eq.${country}`) : q.is("country_code", null);
  if (opts.documentId) q = q.eq("id", opts.documentId);
  if (opts.requiresAckOnly) q = q.eq("requires_ack", true);
  const { data: docData, error: docErr } = await q.order("title", { ascending: true });
  if (docErr) throw new Error(docErr.message);
  const docs = ((docData ?? []) as DocRow[]).filter((d) => audienceMatches(d.audience, ctx));
  if (!docs.length) return [];

  const cols = opts.withBody
    ? "id, document_id, version, effective_from, summary, body_markdown, published_at"
    : "id, document_id, version, effective_from, summary, published_at";
  const { data: verData, error: verErr } = await supabase
    .from("nrs_document_versions")
    .select(cols)
    .in(
      "document_id",
      docs.map((d) => d.id)
    )
    .not("published_at", "is", null)
    .order("effective_from", { ascending: false })
    .order("published_at", { ascending: false });
  if (verErr) throw new Error(verErr.message);
  const byDoc = new Map<string, VersionRow[]>();
  for (const raw of (verData ?? []) as unknown as VersionRow[]) {
    const v: VersionRow = { ...raw, body_markdown: raw.body_markdown ?? null };
    const list = byDoc.get(v.document_id) ?? [];
    list.push(v);
    byDoc.set(v.document_id, list);
  }

  const today = new Date().toISOString().slice(0, 10);
  const withVersion = docs
    .map((d) => ({ doc: d, version: currentVersion(byDoc.get(d.id) ?? [], today) }))
    .filter((x): x is { doc: DocRow; version: VersionRow } => !!x.version);
  if (!withVersion.length) return [];

  const { data: ackData, error: ackErr } = await supabase
    .from("nrs_acknowledgements")
    .select("version_id, acked_at")
    .eq("member_id", member.id)
    .in(
      "version_id",
      withVersion.map((x) => x.version.id)
    );
  if (ackErr) throw new Error(ackErr.message);
  const acks = new Map(((ackData ?? []) as { version_id: string; acked_at: string }[]).map((a) => [a.version_id, a.acked_at]));

  return withVersion.map(({ doc, version }) => ({ ...doc, version, ackedAt: acks.get(version.id) ?? null }));
}
