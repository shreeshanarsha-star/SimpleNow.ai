import { handle, requireRemi, jsonError, isUuid } from "@/lib/remi/access";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// PATCH { gap_id, status: resolved|ignored } or { safety_id, status: reviewing|closed }
export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const { admin } = await requireRemi(id, "admin");
    const b = await req.json().catch(() => ({}));
    if (isUuid(b.gap_id) && ["resolved", "ignored", "open"].includes(b.status)) {
      await admin.from("remi_gaps").update({ status: b.status }).eq("id", b.gap_id).eq("workspace_id", id);
      return Response.json({ ok: true });
    }
    if (isUuid(b.safety_id) && ["reviewing", "closed", "open"].includes(b.status)) {
      await admin.from("remi_safety_reports").update({ status: b.status }).eq("id", b.safety_id).eq("workspace_id", id);
      return Response.json({ ok: true });
    }
    return jsonError("Bad request.", 400);
  });
}
