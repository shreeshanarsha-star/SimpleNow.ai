import { handle, requireRemi, jsonError } from "@/lib/remi/access";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";
type Ctx = { params: Promise<{ id: string }> };

const ALLOWED = /\.(pdf|docx|xlsx|xls|csv|ods|txt|md|html?|json|png|jpe?g|webp)$/i;
const MAX_BYTES = 40 * 1024 * 1024;

// Signed direct-to-storage upload so large catalogues/brochures (up to 40MB)
// bypass the serverless request-size limit. Path is always scoped to the
// workspace id, so one tenant can never write into another's folder.
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const { admin } = await requireRemi(id, "admin");
    const b = await req.json().catch(() => ({}));
    const name = String(b.file_name || "").slice(0, 180);
    const size = Number(b.size) || 0;
    if (!ALLOWED.test(name)) return jsonError("Supported: PDF, DOCX, XLSX/CSV, TXT, HTML, PNG/JPG.", 400);
    if (size > MAX_BYTES) return jsonError("Files up to 40 MB, please.", 400);
    const safe = name.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const path = `${id}/${randomUUID()}-${safe}`;
    const { data, error } = await admin.storage.from("remi-brains").createSignedUploadUrl(path);
    if (error || !data) return jsonError(error?.message || "Couldn't prepare the upload.", 500);
    return Response.json({ path, token: data.token, signedUrl: data.signedUrl });
  });
}
