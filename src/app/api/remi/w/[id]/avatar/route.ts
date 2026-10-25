import { handle, requireRemi, jsonError } from "@/lib/remi/access";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";
type Ctx = { params: Promise<{ id: string }> };

const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

// Signed upload for the assistant's avatar photo into the public
// "remi-avatars" bucket, always under this workspace's own folder.
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const { admin } = await requireRemi(id, "admin");
    const b = await req.json().catch(() => ({}));
    const ext = TYPES[String(b.mime || "")];
    if (!ext) return jsonError("Use a PNG, JPG or WebP image.", 400);
    if ((Number(b.size) || 0) > 3 * 1024 * 1024) return jsonError("Images up to 3 MB, please.", 400);
    const path = `${id}/${randomUUID()}.${ext}`;
    const { data, error } = await admin.storage.from("remi-avatars").createSignedUploadUrl(path);
    if (error || !data) return jsonError(error?.message || "Couldn't prepare the upload.", 500);
    const { data: pub } = admin.storage.from("remi-avatars").getPublicUrl(path);
    return Response.json({ path, token: data.token, publicUrl: pub.publicUrl });
  });
}
