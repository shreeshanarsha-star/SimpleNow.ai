import { handle, requireRemi, clean, audit, jsonError, isUuid } from "@/lib/remi/access";
import { brainMeta } from "@/lib/remi/brainInput";
import { fetchWebText, processBrain, MAX_BRAIN_CHARS } from "@/lib/remi/ingest";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string; brainId: string }> };

async function load(admin: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>, id: string, brainId: string) {
  if (!isUuid(brainId)) return null;
  const { data } = await admin.from("remi_brains").select("*").eq("id", brainId).eq("workspace_id", id).maybeSingle();
  return data;
}

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id, brainId } = await params;
    const { admin } = await requireRemi(id);
    const brain = await load(admin, id, brainId);
    if (!brain) return jsonError("Not found.", 404);
    let download: string | null = null;
    if (brain.storage_path) {
      const { data } = await admin.storage.from("remi-brains").createSignedUrl(brain.storage_path, 600);
      download = data?.signedUrl || null;
    }
    return Response.json({ brain: { ...brain, content_text: String(brain.content_text || "").slice(0, 20000) }, download });
  });
}

// PATCH: { action: "approve" | "archive" | "draft" | "resync" } and/or metadata
// / text edits. Editing text or resyncing a link re-embeds and bumps version.
export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id, brainId } = await params;
    const { admin, user } = await requireRemi(id, "admin");
    const brain = await load(admin, id, brainId);
    if (!brain) return jsonError("Not found.", 404);
    const b = await req.json().catch(() => ({}));
    const patch: Record<string, unknown> = { ...brainMeta(b), updated_at: new Date().toISOString() };
    if ("title" in patch && !patch.title) delete patch.title;
    let reprocess = false;

    if (b.action === "approve") {
      if (brain.status === "failed" || brain.status === "processing") return jsonError("Fix or re-sync this source before approving.", 400);
      Object.assign(patch, { status: "approved", approved_by: user.id, approved_at: new Date().toISOString() });
    } else if (b.action === "archive") patch.status = "archived";
    else if (b.action === "draft") patch.status = "draft";
    else if (b.action === "resync") {
      if (brain.source_url) {
        try {
          const page = await fetchWebText(brain.source_url);
          patch.content_text = page.text.slice(0, MAX_BRAIN_CHARS);
        } catch (e) {
          return jsonError(e instanceof Error ? e.message : "Couldn't fetch the page.", 400);
        }
      }
      reprocess = true;
    }
    if (typeof b.text === "string" && !brain.storage_path && !brain.source_url) {
      const t = clean(b.text, MAX_BRAIN_CHARS);
      if (!t || t.length < 20) return jsonError("Content is too short.", 400);
      patch.content_text = t;
      reprocess = true;
    }
    if (reprocess) patch.version = (brain.version || 1) + 1;

    await admin.from("remi_brains").update(patch).eq("id", brainId).eq("workspace_id", id);
    let result: { ok: boolean; error?: string } = { ok: true };
    if (reprocess) result = await processBrain(brainId);
    await audit(admin, id, user.id, `brain.${b.action || "edited"}`, { brain_id: brainId });
    const { data } = await admin
      .from("remi_brains")
      .select("id,kind,title,source_url,file_name,summary,evidence_type,visibility,status,countries,species,tags,priority,expires_at,error,chunk_count,char_count,version,last_synced_at,approved_at,created_at,updated_at")
      .eq("id", brainId)
      .single();
    return Response.json({ brain: data, ok: result.ok, error: result.error || null });
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id, brainId } = await params;
    const { admin, user } = await requireRemi(id, "admin");
    const brain = await load(admin, id, brainId);
    if (!brain) return jsonError("Not found.", 404);
    if (brain.storage_path) await admin.storage.from("remi-brains").remove([brain.storage_path]);
    await admin.from("remi_brains").delete().eq("id", brainId).eq("workspace_id", id);
    await audit(admin, id, user.id, "brain.deleted", { brain_id: brainId, title: brain.title });
    return Response.json({ ok: true });
  });
}
