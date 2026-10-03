import { logAudit } from "@/lib/nrs/audit";
import { HttpError, dbCheck, guardMember, ok, readJson, run } from "@/lib/nrs/invoice/kit";
import { isValidSignaturePath } from "@/lib/nrs/invoice/signature";

export const dynamic = "force-dynamic";

export async function GET() {
  return run(async () => {
    const g = await guardMember("money");
    const { data, error } = await g.admin
      .from("nrs_signatures")
      .select("svg_path, updated_at")
      .eq("member_id", g.member.id)
      .maybeSingle();
    dbCheck(error, "Signature");
    const row = data as { svg_path: string; updated_at: string } | null;
    return ok({ signature: row ? { path: row.svg_path, updated_at: row.updated_at } : null });
  });
}

// PUT {path}: set or replace the caller's signature.
export async function PUT(req: Request) {
  return run(async () => {
    const g = await guardMember("money");
    const b = await readJson(req);
    const path = typeof b.path === "string" ? b.path.trim() : "";
    if (!isValidSignaturePath(path)) throw new HttpError("That signature couldn't be read. Please draw it again.");
    const { data: before } = await g.admin.from("nrs_signatures").select("member_id").eq("member_id", g.member.id).maybeSingle();
    const now = new Date().toISOString();
    const { error } = await g.admin
      .from("nrs_signatures")
      .upsert({ member_id: g.member.id, org_id: g.orgId, svg_path: path, updated_at: now }, { onConflict: "member_id" });
    dbCheck(error, "Saving signature");
    await logAudit(g.admin, {
      orgId: g.orgId,
      actorUser: g.user.id,
      entity: "nrs_signatures",
      entityId: g.member.id,
      action: before ? "replace" : "create",
      after: { length: path.length },
    });
    return ok({ signature: { path, updated_at: now } });
  });
}
