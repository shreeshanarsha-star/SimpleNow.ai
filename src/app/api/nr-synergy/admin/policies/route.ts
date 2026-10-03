import { logAudit } from "@/lib/nrs/audit";
import { notifyMembers } from "@/lib/nrs/notify";
import { HttpError, dbCheck, guard, ok, readJson, run, uuid } from "@/lib/nrs/invoice/kit";
import {
  ackedMap,
  currentVersionOf,
  docLink,
  fetchAll,
  scopeResolver,
  type PolicyDoc,
  type PublishedVersion,
} from "./_scope";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Acknowledgement tracking for the Admin Console (HR only).
//   GET                         every requires-ack document with its published versions and counts
//   GET ?version_id=            one version: everyone in scope and whether / when they acknowledged
//   GET ?version_id=&format=csv the same as a CSV download
//   POST {version_id, action:"remind", member_ids?}   remind pending people (current version only)

type G = Awaited<ReturnType<typeof guard>>;
type Doc = PolicyDoc & { category: string };
type Version = PublishedVersion & { file_path: string | null };

async function ackDocs(g: G, documentId?: string): Promise<Doc[]> {
  let q = g.admin
    .from("nrs_documents")
    .select("id, title, category, country_code, audience, requires_ack, archived_at")
    .eq("org_id", g.orgId)
    .eq("requires_ack", true)
    .is("archived_at", null);
  if (documentId) q = q.eq("id", documentId);
  const { data, error } = await q.order("title", { ascending: true });
  dbCheck(error, "Documents");
  return (data ?? []) as Doc[];
}

async function publishedVersions(g: G, docIds: string[]): Promise<Version[]> {
  if (!docIds.length) return [];
  return fetchAll<Version>((from, to) =>
    g.admin
      .from("nrs_document_versions")
      .select("id, document_id, version, effective_from, published_at, file_path")
      .eq("org_id", g.orgId)
      .in("document_id", docIds)
      .not("published_at", "is", null)
      .order("effective_from", { ascending: false })
      .order("published_at", { ascending: false })
      .range(from, to)
  );
}

/** One published version of a requires-ack document in the caller's org, with its document and sibling versions. */
async function loadVersion(g: G, versionId: string) {
  const { data, error } = await g.admin
    .from("nrs_document_versions")
    .select("id, document_id, version, effective_from, published_at, file_path")
    .eq("id", versionId)
    .eq("org_id", g.orgId)
    .not("published_at", "is", null)
    .maybeSingle();
  dbCheck(error, "Version");
  const version = data as Version | null;
  if (!version) throw new HttpError("Published version not found", 404);
  const [doc] = await ackDocs(g, version.document_id);
  if (!doc) throw new HttpError("This document doesn't require acknowledgement or is archived", 404);
  const siblings = await publishedVersions(g, [doc.id]);
  return { doc, version, isCurrent: currentVersionOf(siblings)?.id === version.id };
}

async function roster(g: G, versionId: string) {
  const { doc, version, isCurrent } = await loadVersion(g, versionId);
  const inScope = (await scopeResolver(g.admin, g.orgId))(doc);
  const acked = (await ackedMap(g.admin, g.orgId, [version.id])).get(version.id) ?? new Map<string, string>();
  const members = inScope.map((m) => ({ ...m, acked_at: acked.get(m.id) ?? null }));
  return { doc, version, isCurrent, members };
}

function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  // Neutralise spreadsheet formulas.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  return run(async () => {
    const g = await guard(undefined, "hr");
    const params = new URL(req.url).searchParams;
    const versionParam = params.get("version_id");

    if (versionParam) {
      const r = await roster(g, uuid(versionParam, "Version"));
      if (params.get("format") === "csv") {
        const header = ["Name", "Email", "Country", "Department", "Designation", "Status", "Acknowledged at (UTC)"];
        const lines = [header.map(csvCell).join(",")];
        for (const m of r.members) {
          lines.push(
            [m.full_name, m.email, m.home_country, m.department, m.designation, m.acked_at ? "Acknowledged" : "Pending", m.acked_at ?? ""]
              .map(csvCell)
              .join(",")
          );
        }
        const slug = `${r.doc.title}-v${r.version.version}`.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 80);
        await logAudit(g.admin, {
          orgId: g.orgId,
          actorUser: g.user.id,
          entity: "nrs_acknowledgements",
          entityId: r.version.id,
          action: "export_csv",
          context: { rows: r.members.length },
        });
        return new Response(`﻿${lines.join("\r\n")}\r\n`, {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="acknowledgements-${slug}.csv"`,
            "Cache-Control": "no-store",
          },
        });
      }
      return ok({
        document: { id: r.doc.id, title: r.doc.title, category: r.doc.category, country_code: r.doc.country_code, audience: r.doc.audience },
        version: { id: r.version.id, version: r.version.version, effective_from: r.version.effective_from, published_at: r.version.published_at, has_file: !!r.version.file_path },
        is_current: r.isCurrent,
        members: r.members,
      });
    }

    const docs = await ackDocs(g);
    const versions = await publishedVersions(g, docs.map((d) => d.id));
    const resolve = await scopeResolver(g.admin, g.orgId);
    const acks = await ackedMap(g.admin, g.orgId, versions.map((v) => v.id));
    const byDoc = new Map<string, Version[]>();
    for (const v of versions) byDoc.set(v.document_id, [...(byDoc.get(v.document_id) ?? []), v]);

    const policies = docs.map((d) => {
      const list = byDoc.get(d.id) ?? [];
      const current = currentVersionOf(list);
      const scopeIds = resolve(d).map((m) => m.id);
      return {
        document: { id: d.id, title: d.title, category: d.category, country_code: d.country_code, audience: d.audience },
        versions: list.map((v) => {
          const a = acks.get(v.id);
          return {
            id: v.id,
            version: v.version,
            effective_from: v.effective_from,
            published_at: v.published_at,
            has_file: !!v.file_path,
            is_current: v.id === current?.id,
            required: scopeIds.length,
            acknowledged: a ? scopeIds.filter((id) => a.has(id)).length : 0,
          };
        }),
      };
    });
    return ok({ policies });
  });
}

export async function POST(req: Request) {
  return run(async () => {
    const g = await guard(undefined, "hr");
    const b = await readJson(req);
    if (b.action !== "remind") throw new HttpError("Unknown action");
    const r = await roster(g, uuid(b.version_id, "Version"));
    if (!r.isCurrent) throw new HttpError("Reminders go out for the version in force only. People can't open older versions.", 409);
    let pending = r.members.filter((m) => !m.acked_at).map((m) => m.id);
    if (Array.isArray(b.member_ids)) {
      const wanted = new Set(b.member_ids.filter((x): x is string => typeof x === "string"));
      pending = pending.filter((id) => wanted.has(id));
    }
    if (!pending.length) return ok({ reminded: 0 });
    await notifyMembers(g.admin, g.orgId, pending, {
      title: "Reminder: policy to acknowledge",
      body: `Please read ${r.doc.title} (version ${r.version.version}) and acknowledge it.`,
      link: docLink(r.doc.id),
    });
    await logAudit(g.admin, {
      orgId: g.orgId,
      actorUser: g.user.id,
      entity: "nrs_document_versions",
      entityId: r.version.id,
      action: "ack_reminder",
      context: { recipients: pending.length },
    });
    return ok({ reminded: pending.length });
  });
}
