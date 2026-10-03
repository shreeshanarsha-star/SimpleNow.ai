import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyMembers } from "@/lib/nrs/notify";

// Policy acknowledgement scope: who must read and acknowledge a document.
// Mirrors what the employee Library shows (knowledge/_lib.ts): a document is
// for members whose home country matches (or it is global) and whose
// audience matches (everyone / consultants / payroll / managers).
// Service-role reads only; callers must already have checked HR + org.

export type PolicyAudience = "all" | "consultant" | "payroll" | "managers";

export interface PolicyDoc {
  id: string;
  title: string;
  country_code: string | null;
  audience: PolicyAudience;
  requires_ack: boolean;
  archived_at: string | null;
}

export interface ScopeMember {
  id: string;
  full_name: string;
  email: string;
  home_country: string;
  department: string | null;
  designation: string | null;
  is_demo: boolean;
}

export interface PublishedVersion {
  id: string;
  document_id: string;
  version: string;
  effective_from: string;
  published_at: string;
}

const PAGE = 1000;

/** Read every row of a query, 1000 at a time (PostgREST caps a single response). */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Active members of the org. */
export async function activeMembers(admin: SupabaseClient, orgId: string): Promise<ScopeMember[]> {
  return fetchAll<ScopeMember>((from, to) =>
    admin
      .from("nrs_members")
      .select("id, full_name, email, home_country, department, designation, is_demo")
      .eq("org_id", orgId)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("full_name", { ascending: true })
      .range(from, to)
  );
}

/** Current engagement type per member (same rule as nrs_engagement_type()). */
async function engagementTypes(admin: SupabaseClient, orgId: string): Promise<Map<string, string>> {
  const today = todayUtc();
  const rows = await fetchAll<{ member_id: string; type: string }>((from, to) =>
    admin
      .from("nrs_engagements")
      .select("member_id, type, starts_on")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .lte("starts_on", today)
      .or(`ends_on.is.null,ends_on.gte.${today}`)
      .order("starts_on", { ascending: false })
      .range(from, to)
  );
  const out = new Map<string, string>();
  for (const r of rows) if (!out.has(r.member_id)) out.set(r.member_id, r.type);
  return out;
}

/** Members with the manager role or at least one active report. */
async function managerIds(admin: SupabaseClient, orgId: string): Promise<Set<string>> {
  const [roles, reports] = await Promise.all([
    fetchAll<{ member_id: string }>((from, to) =>
      admin
        .from("nrs_member_roles")
        .select("member_id, nrs_members!inner(org_id)")
        .eq("role", "manager")
        .eq("nrs_members.org_id", orgId)
        .range(from, to)
    ),
    fetchAll<{ manager_id: string | null }>((from, to) =>
      admin
        .from("nrs_members")
        .select("manager_id")
        .eq("org_id", orgId)
        .eq("status", "active")
        .is("deleted_at", null)
        .not("manager_id", "is", null)
        .range(from, to)
    ),
  ]);
  const out = new Set<string>(roles.map((r) => r.member_id));
  for (const r of reports) if (r.manager_id) out.add(r.manager_id);
  return out;
}

/**
 * Scope resolver for one org: loads members, engagements and managers once,
 * then answers "who is this document for?" for any number of documents.
 */
export async function scopeResolver(admin: SupabaseClient, orgId: string) {
  const [members, engagement, managers] = await Promise.all([
    activeMembers(admin, orgId),
    engagementTypes(admin, orgId),
    managerIds(admin, orgId),
  ]);
  return (doc: Pick<PolicyDoc, "country_code" | "audience">): ScopeMember[] =>
    members.filter((m) => {
      if (doc.country_code && m.home_country?.toUpperCase() !== doc.country_code.toUpperCase()) return false;
      if (doc.audience === "all") return true;
      if (doc.audience === "managers") return managers.has(m.id);
      return engagement.get(m.id) === doc.audience;
    });
}

/**
 * Of a document's published versions, the one in force today (newest
 * effective_from <= today), else the newest. Same rule as the Library, so
 * the version people are asked to acknowledge is the one they can open.
 */
export function currentVersionOf<T extends PublishedVersion>(versions: T[], today = todayUtc()): T | undefined {
  const sorted = [...versions].sort(
    (a, b) => b.effective_from.localeCompare(a.effective_from) || b.published_at.localeCompare(a.published_at)
  );
  return sorted.find((v) => v.effective_from <= today) ?? sorted[0];
}

/** Member ids that have acknowledged a version. */
export async function ackedMap(admin: SupabaseClient, orgId: string, versionIds: string[]): Promise<Map<string, Map<string, string>>> {
  const out = new Map<string, Map<string, string>>();
  if (!versionIds.length) return out;
  const rows = await fetchAll<{ version_id: string; member_id: string; acked_at: string }>((from, to) =>
    admin
      .from("nrs_acknowledgements")
      .select("version_id, member_id, acked_at")
      .eq("org_id", orgId)
      .in("version_id", versionIds)
      .range(from, to)
  );
  for (const r of rows) {
    const m = out.get(r.version_id) ?? new Map<string, string>();
    m.set(r.member_id, r.acked_at);
    out.set(r.version_id, m);
  }
  return out;
}

export function docLink(documentId: string): string {
  return `/tools/nr-synergy/knowledge/doc/${documentId}`;
}

/**
 * After a requires_ack version is published: if it is now the version in
 * force, ask everyone in scope who hasn't acknowledged it yet. Best-effort;
 * returns how many people were notified.
 */
export async function notifyOnPublish(admin: SupabaseClient, orgId: string, versionId: string): Promise<number> {
  try {
    const { data: vData } = await admin
      .from("nrs_document_versions")
      .select("id, document_id, version, effective_from, published_at")
      .eq("id", versionId)
      .eq("org_id", orgId)
      .maybeSingle();
    const version = vData as PublishedVersion | null;
    if (!version?.published_at) return 0;
    const { data: dData } = await admin
      .from("nrs_documents")
      .select("id, title, country_code, audience, requires_ack, archived_at")
      .eq("id", version.document_id)
      .eq("org_id", orgId)
      .maybeSingle();
    const doc = dData as PolicyDoc | null;
    if (!doc || !doc.requires_ack || doc.archived_at) return 0;

    const { data: siblings } = await admin
      .from("nrs_document_versions")
      .select("id, document_id, version, effective_from, published_at")
      .eq("document_id", doc.id)
      .not("published_at", "is", null);
    if (currentVersionOf((siblings ?? []) as PublishedVersion[])?.id !== version.id) return 0;

    const inScope = (await scopeResolver(admin, orgId))(doc);
    const acked = (await ackedMap(admin, orgId, [version.id])).get(version.id) ?? new Map<string, string>();
    const pending = inScope.filter((m) => !acked.has(m.id)).map((m) => m.id);
    if (!pending.length) return 0;
    await notifyMembers(admin, orgId, pending, {
      title: "New policy to acknowledge",
      body: `${doc.title} (version ${version.version}) has been published. Please read it and acknowledge.`,
      link: docLink(doc.id),
    });
    return pending.length;
  } catch (e) {
    console.error("[nrs] policy publish notification failed", e);
    return 0;
  }
}
