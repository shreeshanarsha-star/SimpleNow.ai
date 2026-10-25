import { handle, requireRemi, audit, jsonError, isUuid } from "@/lib/remi/access";
import { productInput } from "@/lib/remi/productInput";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";
type Ctx = { params: Promise<{ id: string; productId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id, productId } = await params;
    const { admin, user } = await requireRemi(id, "admin");
    if (!isUuid(productId)) return jsonError("Not found.", 404);
    const b = await req.json().catch(() => ({}));
    const patch = productInput(b, true);
    if ("name" in patch && !patch.name) return jsonError("Name is required.", 400);
    const { data, error } = await admin
      .from("remi_products")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", productId)
      .eq("workspace_id", id)
      .select("*")
      .maybeSingle();
    if (error) return jsonError(error.message, 400);
    if (!data) return jsonError("Not found.", 404);
    await audit(admin, id, user.id, "product.updated", { product_id: productId });
    return Response.json({ product: data });
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id, productId } = await params;
    const { admin, user } = await requireRemi(id, "admin");
    if (!isUuid(productId)) return jsonError("Not found.", 404);
    await admin.from("remi_products").delete().eq("id", productId).eq("workspace_id", id);
    await audit(admin, id, user.id, "product.deleted", { product_id: productId });
    return Response.json({ ok: true });
  });
}
