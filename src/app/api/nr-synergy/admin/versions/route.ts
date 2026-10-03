import { logAudit } from "@/lib/nrs/audit";
import { HttpError, NRS_BUCKET, dbCheck, guard, ok, readJson, run, uuid } from "@/lib/nrs/invoice/kit";
import { parseVersion } from "@/lib/nrs/invoice/adminContent";
import { notifyOnPublish } from "../policies/_scope";
import { policyPdfPath, readPolicyPdf, uploadPolicyPdf } from "./_pdf";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const COLUMNS = "id, document_id, version, effective_from, summary, body_markdown, file_path, published_at, created_at";

type G = Awaited<ReturnType<typeof guard>>;

interface VersionRow {
  id: string;
  document_id: string;
  version: string;
  effective_from: string;
  summary: string | null;
  body_markdown: string | null;
  file_path: string | null;
  published_at: string | null;
  created_at: string;
}

async function ownDoc(g: G, documentId: string): Promise<{ id: string; requires_ack: boolean }> {
  const { data, error } = await g.admin
    .from("nrs_documents")
    .select("id, requires_ack")
    .eq("id", documentId)
    .eq("org_id", g.orgId)
    .maybeSingle();
  dbCheck(error, "Document");
  if (!data) throw new HttpError("Document not found", 404);
  return data as { id: string; requires_ack: boolean };
}

async function ownVersion(g: G, id: string): Promise<VersionRow> {
  const { data, error } = await g.admin.from("nrs_document_versions").select(COLUMNS).eq("id", id).eq("org_id", g.orgId).maybeSingle();
  dbCheck(error, "Version");
  if (!data) throw new HttpError("Version not found", 404);
  return data as VersionRow;
}

/** The client never needs the storage path, only whether a PDF is attached. */
function toDto({ file_path, ...v }: VersionRow) {
  return { ...v, has_file: !!file_path };
}

function isMultipart(req: Request): boolean {
  return (req.headers.get("content-type") ?? "").toLowerCase().startsWith("multipart/form-data");
}

/** Body as a plain record plus the optional uploaded file (JSON or multipart). */
async function readInput(req: Request): Promise<{ b: Record<string, unknown>; file: File | null }> {
  if (!isMultipart(req)) return { b: await readJson(req), file: null };
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError("Invalid upload");
  }
  const b: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") b[k] = v;
  for (const k of ["publish", "remove_file"]) if (k in b) b[k] = b[k] === "true";
  const f = form.get("file");
  // An empty file part (no file chosen) counts as no file.
  return { b, file: f instanceof File && (f.size > 0 || f.name) ? f : null };
}

async function removeObject(g: G, path: string | null): Promise<void> {
  if (!path || !path.startsWith(`${g.orgId}/`)) return;
  const { error } = await g.admin.storage.from(NRS_BUCKET).remove([path]);
  if (error) console.error("[nrs] removing policy pdf failed", path, error.message);
}

// GET ?document_id=
export async function GET(req: Request) {
  return run(async () => {
    const g = await guard(undefined, "hr");
    const documentId = uuid(new URL(req.url).searchParams.get("document_id"), "Document");
    await ownDoc(g, documentId);
    const { data, error } = await g.admin
      .from("nrs_document_versions")
      .select(COLUMNS)
      .eq("document_id", documentId)
      .order("created_at", { ascending: false });
    dbCheck(error, "Versions");
    return ok({ versions: ((data ?? []) as VersionRow[]).map(toDto) });
  });
}

// POST {document_id, version, effective_from, summary, body_markdown, publish?}
// JSON, or multipart/form-data with the same fields plus `file` (PDF, <= 15 MB).
export async function POST(req: Request) {
  return run(async () => {
    const g = await guard(undefined, "hr");
    const { b, file } = await readInput(req);
    const documentId = uuid(b.document_id, "Document");
    const doc = await ownDoc(g, documentId);
    const v = parseVersion(b);
    const pdf = file ? await readPolicyPdf(file) : null;
    if (!pdf && !v.body_markdown) throw new HttpError("Add the policy text or attach a PDF");
    const publish = b.publish === true;

    // Insert unpublished first: if the upload fails, nobody sees a version without its file.
    const { data, error } = await g.admin
      .from("nrs_document_versions")
      .insert({ ...v, document_id: documentId, org_id: g.orgId, published_at: null, published_by: null })
      .select("id")
      .single();
    if (error?.code === "23505") throw new HttpError("That version number already exists", 409);
    dbCheck(error, "Saving version");
    const id = (data as { id: string }).id;

    const patch: Record<string, unknown> = {};
    if (pdf) {
      const path = policyPdfPath(g.orgId, documentId, v.version, id);
      try {
        await uploadPolicyPdf(g.admin, path, pdf);
      } catch (e) {
        await g.admin.from("nrs_document_versions").delete().eq("id", id);
        throw e;
      }
      patch.file_path = path;
    }
    if (publish) {
      patch.published_at = new Date().toISOString();
      patch.published_by = g.user.id;
    }
    if (Object.keys(patch).length) {
      const { error: upErr } = await g.admin.from("nrs_document_versions").update(patch).eq("id", id);
      dbCheck(upErr, "Saving version");
    }

    await logAudit(g.admin, {
      orgId: g.orgId,
      actorUser: g.user.id,
      entity: "nrs_document_versions",
      entityId: id,
      action: publish ? "create_publish" : "create",
      after: { document_id: documentId, version: v.version, effective_from: v.effective_from, has_file: !!pdf },
    });
    const notified = publish && doc.requires_ack ? await notifyOnPublish(g.admin, g.orgId, id) : 0;
    return ok({ id, notified }, 201);
  });
}

// PATCH {id, publish:true}                        publish a draft version
// PATCH {id, remove_file:true}                    detach the PDF from a draft
// PATCH multipart {id, file}                      attach / replace the PDF on a draft
export async function PATCH(req: Request) {
  return run(async () => {
    const g = await guard(undefined, "hr");
    const { b, file } = await readInput(req);
    const id = uuid(b.id, "Version");
    const ver = await ownVersion(g, id);

    if (file || b.remove_file === true) {
      if (ver.published_at) throw new HttpError("Published versions can't be changed. Add a new version instead.", 409);
      if (file) {
        const pdf = await readPolicyPdf(file);
        const path = policyPdfPath(g.orgId, ver.document_id, ver.version, ver.id);
        await uploadPolicyPdf(g.admin, path, pdf);
        if (ver.file_path && ver.file_path !== path) await removeObject(g, ver.file_path);
        const { error } = await g.admin.from("nrs_document_versions").update({ file_path: path }).eq("id", id).is("published_at", null);
        dbCheck(error, "Saving file");
        await logAudit(g.admin, { orgId: g.orgId, actorUser: g.user.id, entity: "nrs_document_versions", entityId: id, action: "attach_file" });
      } else {
        if (!ver.body_markdown?.trim()) throw new HttpError("This version has no text, so it needs its PDF.", 409);
        const { error } = await g.admin.from("nrs_document_versions").update({ file_path: null }).eq("id", id).is("published_at", null);
        dbCheck(error, "Removing file");
        await removeObject(g, ver.file_path);
        await logAudit(g.admin, { orgId: g.orgId, actorUser: g.user.id, entity: "nrs_document_versions", entityId: id, action: "remove_file" });
      }
      return ok({ version: toDto(await ownVersion(g, id)) });
    }

    if (b.publish !== true) throw new HttpError("Unknown action");
    if (!ver.file_path && !ver.body_markdown?.trim()) throw new HttpError("Add the policy text or attach a PDF before publishing", 409);
    const { data, error } = await g.admin
      .from("nrs_document_versions")
      .update({ published_at: new Date().toISOString(), published_by: g.user.id })
      .eq("id", id)
      .eq("org_id", g.orgId)
      .is("published_at", null)
      .select("id, document_id, version");
    dbCheck(error, "Publishing");
    if (!data?.length) throw new HttpError("Version not found or already published", 404);
    await logAudit(g.admin, { orgId: g.orgId, actorUser: g.user.id, entity: "nrs_document_versions", entityId: id, action: "publish", after: data[0] });
    const doc = await ownDoc(g, ver.document_id);
    const notified = doc.requires_ack ? await notifyOnPublish(g.admin, g.orgId, id) : 0;
    return ok({ ok: true, notified });
  });
}

// DELETE ?id=  remove a draft (unpublished) version and its PDF
export async function DELETE(req: Request) {
  return run(async () => {
    const g = await guard(undefined, "hr");
    const id = uuid(new URL(req.url).searchParams.get("id"), "Version");
    const ver = await ownVersion(g, id);
    if (ver.published_at) throw new HttpError("Published versions are kept for the record and can't be deleted.", 409);
    const { data, error } = await g.admin.from("nrs_document_versions").delete().eq("id", id).is("published_at", null).select("id");
    dbCheck(error, "Deleting version");
    if (!data?.length) throw new HttpError("Version not found or already published", 404);
    await removeObject(g, ver.file_path);
    await logAudit(g.admin, {
      orgId: g.orgId,
      actorUser: g.user.id,
      entity: "nrs_document_versions",
      entityId: id,
      action: "delete",
      before: { document_id: ver.document_id, version: ver.version },
    });
    return ok({ ok: true });
  });
}
