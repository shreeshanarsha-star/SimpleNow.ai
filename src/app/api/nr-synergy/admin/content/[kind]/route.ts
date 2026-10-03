import { logAudit } from "@/lib/nrs/audit";
import { HttpError, dbCheck, guard, ok, readJson, run, uuid } from "@/lib/nrs/invoice/kit";
import { CONTENT } from "@/lib/nrs/invoice/adminContent";
import { CONTENT_KINDS, type ContentKind } from "@/lib/nrs/invoice/adminTypes";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ kind: string }> };

/** A post's author must be a member of the caller's org. */
async function checkAuthor(g: Awaited<ReturnType<typeof guard>>, row: Record<string, unknown>): Promise<void> {
  const author = row.author_member_id;
  if (typeof author !== "string") return;
  const { data, error } = await g.admin.from("nrs_members").select("id").eq("id", author).eq("org_id", g.orgId).maybeSingle();
  dbCheck(error, "Author");
  if (!data) throw new HttpError("Author not found in this organisation", 400);
}

async function spec(params: Params["params"]) {
  const { kind } = await params;
  if (!(CONTENT_KINDS as readonly string[]).includes(kind)) throw new HttpError("Unknown content type", 404);
  return { kind: kind as ContentKind, spec: CONTENT[kind as ContentKind] };
}

export async function GET(_req: Request, { params }: Params) {
  return run(async () => {
    const g = await guard(undefined, "hr");
    const { spec: s } = await spec(params);
    let q = g.admin.from(s.table).select(s.columns).eq("org_id", g.orgId);
    if (s.activeFilter) q = q.is(s.activeFilter, null);
    const { data, error } = await q.order(s.order.column, { ascending: s.order.ascending }).limit(300);
    dbCheck(error, "Content");
    return ok({ items: data ?? [] });
  });
}

export async function POST(req: Request, { params }: Params) {
  return run(async () => {
    const g = await guard(undefined, "hr");
    const { kind, spec: s } = await spec(params);
    const row = s.parse(await readJson(req), true);
    if (kind === "posts" && !("author_member_id" in row)) row.author_member_id = g.ctx.member?.id ?? null;
    await checkAuthor(g, row);
    const { data, error } = await g.admin.from(s.table).insert({ ...row, org_id: g.orgId }).select("id").single();
    dbCheck(error, "Saving");
    const id = (data as { id: string }).id;
    await logAudit(g.admin, { orgId: g.orgId, actorUser: g.user.id, entity: s.table, entityId: id, action: "create", after: row });
    return ok({ id }, 201);
  });
}

// PATCH {id, ...fields}
export async function PATCH(req: Request, { params }: Params) {
  return run(async () => {
    const g = await guard(undefined, "hr");
    const { spec: s } = await spec(params);
    const b = await readJson(req);
    const id = uuid(b.id, "Item");
    const row = s.parse(b, false);
    if (!Object.keys(row).length) throw new HttpError("Nothing to change");
    await checkAuthor(g, row);
    const { data, error } = await g.admin.from(s.table).update(row).eq("id", id).eq("org_id", g.orgId).select("id");
    dbCheck(error, "Saving");
    if (!data?.length) throw new HttpError("Not found", 404);
    await logAudit(g.admin, { orgId: g.orgId, actorUser: g.user.id, entity: s.table, entityId: id, action: "update", after: row });
    return ok({ ok: true });
  });
}

// DELETE ?id=  (posts: soft delete; documents: archive; others: delete)
export async function DELETE(req: Request, { params }: Params) {
  return run(async () => {
    const g = await guard(undefined, "hr");
    const { kind, spec: s } = await spec(params);
    const id = uuid(new URL(req.url).searchParams.get("id"), "Item");
    const q = s.softDelete
      ? g.admin.from(s.table).update({ [s.softDelete]: new Date().toISOString() }).eq("id", id).eq("org_id", g.orgId).select("id")
      : g.admin.from(s.table).delete().eq("id", id).eq("org_id", g.orgId).select("id");
    const { data, error } = await q;
    if (error?.code === "23503" && kind === "values") throw new HttpError("This value has kudos attached and can't be deleted", 409);
    dbCheck(error, "Deleting");
    if (!data?.length) throw new HttpError("Not found", 404);
    await logAudit(g.admin, { orgId: g.orgId, actorUser: g.user.id, entity: s.table, entityId: id, action: s.softDelete ? "archive" : "delete" });
    return ok({ ok: true });
  });
}
