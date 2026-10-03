import { logAudit } from "@/lib/nrs/audit";
import { HttpError, dbCheck, guard, ok, readJson, run, uuid } from "@/lib/nrs/invoice/kit";
import { parseVersion } from "@/lib/nrs/invoice/adminContent";

export const dynamic = "force-dynamic";

const COLUMNS = "id, document_id, version, effective_from, summary, body_markdown, published_at, created_at";

async function ownDoc(g: Awaited<ReturnType<typeof guard>>, documentId: string) {
  const { data, error } = await g.admin.from("nrs_documents").select("id").eq("id", documentId).eq("org_id", g.orgId).maybeSingle();
  dbCheck(error, "Document");
  if (!data) throw new HttpError("Document not found", 404);
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
    return ok({ versions: data ?? [] });
  });
}

// POST {document_id, version, effective_from, summary, body_markdown, publish?}
export async function POST(req: Request) {
  return run(async () => {
    const g = await guard(undefined, "hr");
    const b = await readJson(req);
    const documentId = uuid(b.document_id, "Document");
    await ownDoc(g, documentId);
    const v = parseVersion(b);
    const publish = b.publish === true;
    const now = new Date().toISOString();
    const { data, error } = await g.admin
      .from("nrs_document_versions")
      .insert({
        ...v,
        document_id: documentId,
        org_id: g.orgId,
        published_at: publish ? now : null,
        published_by: publish ? g.user.id : null,
      })
      .select("id")
      .single();
    if (error?.code === "23505") throw new HttpError("That version number already exists", 409);
    dbCheck(error, "Saving version");
    const id = (data as { id: string }).id;
    await logAudit(g.admin, {
      orgId: g.orgId,
      actorUser: g.user.id,
      entity: "nrs_document_versions",
      entityId: id,
      action: publish ? "create_publish" : "create",
      after: { document_id: documentId, version: v.version, effective_from: v.effective_from },
    });
    return ok({ id }, 201);
  });
}

// PATCH {id, publish:true}
export async function PATCH(req: Request) {
  return run(async () => {
    const g = await guard(undefined, "hr");
    const b = await readJson(req);
    const id = uuid(b.id, "Version");
    if (b.publish !== true) throw new HttpError("Unknown action");
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
    return ok({ ok: true });
  });
}
