import { handle, requireRemi, clean, audit, jsonError } from "@/lib/remi/access";
import { brainMeta } from "@/lib/remi/brainInput";
import { extractFileText, fetchWebText, processBrain, MAX_BRAIN_CHARS } from "@/lib/remi/ingest";
import { hasRemiAi } from "@/lib/remi/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const { admin } = await requireRemi(id);
    const { data } = await admin
      .from("remi_brains")
      .select("id,kind,title,source_url,file_name,summary,evidence_type,visibility,status,countries,species,tags,priority,expires_at,error,chunk_count,char_count,version,last_synced_at,approved_at,created_at,updated_at")
      .eq("workspace_id", id)
      .order("created_at", { ascending: false })
      .limit(500);
    return Response.json({ brains: data || [] });
  });
}

// Add a Brain: { kind, title, text } for notes/FAQs/pitch, { url } for a web
// link, or { storage_path, file_name, mime } after a direct upload via
// /brains/upload-url. Text is extracted, chunked and embedded immediately;
// the Brain lands as DRAFT (or APPROVED if the admin ticked "approve now").
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const { admin, user } = await requireRemi(id, "admin");
    if (!hasRemiAi()) return jsonError("AI is not configured on the server (OPENAI_API_KEY).", 503);
    const b = await req.json().catch(() => ({}));
    const meta = brainMeta(b);
    let kind = String(meta.kind || b.kind || "document");
    let title = (meta.title as string) || null;
    let content = "";
    let sourceUrl: string | null = null;
    let storagePath: string | null = null;
    let fileName: string | null = null;
    let mime: string | null = null;

    try {
      if (typeof b.url === "string" && b.url.trim()) {
        const page = await fetchWebText(b.url.trim());
        content = page.text;
        sourceUrl = page.finalUrl;
        title = title || page.title || new URL(page.finalUrl).hostname;
        kind = meta.kind ? kind : "weblink";
      } else if (typeof b.storage_path === "string" && b.storage_path) {
        storagePath = b.storage_path;
        if (!storagePath!.startsWith(`${id}/`) || storagePath!.includes("..")) return jsonError("Invalid upload.", 400);
        fileName = clean(b.file_name, 200) || storagePath!.split("/").pop() || "file";
        mime = clean(b.mime, 100) || "";
        const { data: blob, error } = await admin.storage.from("remi-brains").download(storagePath!);
        if (error || !blob) return jsonError("Upload not found — please try again.", 400);
        content = await extractFileText(Buffer.from(await blob.arrayBuffer()), fileName!, mime!);
        title = title || fileName!.replace(/\.[a-z0-9]+$/i, "");
      } else {
        content = clean(b.text, MAX_BRAIN_CHARS) || "";
        if (!content || content.length < 20) return jsonError("Add some content (at least a sentence).", 400);
        if (!meta.kind) kind = "note";
        title = title || content.slice(0, 60);
      }
    } catch (e) {
      return jsonError(e instanceof Error ? e.message : "Couldn't read that source.", 400);
    }

    const { count } = await admin.from("remi_brains").select("id", { count: "exact", head: true }).eq("workspace_id", id);
    if ((count || 0) >= 1000) return jsonError("Brain limit reached (1000 sources).", 400);

    const { data: brain, error } = await admin
      .from("remi_brains")
      .insert({
        ...meta,
        workspace_id: id,
        kind,
        title: (title || "Untitled").slice(0, 200),
        source_url: sourceUrl,
        storage_path: storagePath,
        file_name: fileName,
        mime,
        content_text: content.slice(0, MAX_BRAIN_CHARS),
        status: "processing",
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error || !brain) return jsonError(error?.message || "Couldn't save.", 500);

    const result = await processBrain(brain.id);
    if (result.ok && b.approve === true) {
      await admin
        .from("remi_brains")
        .update({ status: "approved", approved_by: user.id, approved_at: new Date().toISOString() })
        .eq("id", brain.id);
    }
    await audit(admin, id, user.id, "brain.added", { brain_id: brain.id, kind, title, ok: result.ok });
    const { data: saved } = await admin
      .from("remi_brains")
      .select("id,kind,title,source_url,file_name,summary,evidence_type,visibility,status,countries,species,tags,priority,expires_at,error,chunk_count,char_count,version,last_synced_at,approved_at,created_at,updated_at")
      .eq("id", brain.id)
      .single();
    return Response.json({ brain: saved, ok: result.ok, error: result.error || null });
  });
}
