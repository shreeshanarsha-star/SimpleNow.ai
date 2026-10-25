import { handle, requireRemi, clean, cleanList, audit, jsonError } from "@/lib/remi/access";
import { REMI_VOICES } from "@/lib/remi/ai";
import { assertPublicUrl } from "@/lib/remi/security";
import { findLanguage } from "@/lib/remi/languages";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const { admin, role } = await requireRemi(id);
    const { data } = await admin.from("remi_workspaces").select("*").eq("id", id).single();
    if (!data) return jsonError("Workspace not found.", 404);
    // Reps/viewers never see integration secrets.
    if (role !== "owner" && role !== "admin") {
      delete (data as Record<string, unknown>).webhook_secret;
      delete (data as Record<string, unknown>).webhook_url;
    }
    return Response.json({ workspace: data, role });
  });
}

export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const { admin, user } = await requireRemi(id, "admin");
    const b = await req.json().catch(() => ({}));
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    const text: [string, number][] = [
      ["name", 120], ["assistant_name", 40], ["tagline", 120], ["industry", 120], ["about", 2000],
      ["greeting", 600], ["handoff_message", 400], ["consent_text", 400],
    ];
    for (const [k, max] of text) if (k in b) patch[k] = clean(b[k], max);
    if ("name" in b && !patch.name) return jsonError("Name can't be empty.", 400);
    if ("assistant_name" in b && !patch.assistant_name) patch.assistant_name = "Dr.Remi";
    if ("tagline" in b && !patch.tagline) patch.tagline = "AI powered sales partner";
    if ("default_language" in b) patch.default_language = findLanguage(b.default_language)?.code || "auto";
    if ("pricing_mode" in b && ["range", "exact", "hidden"].includes(b.pricing_mode)) patch.pricing_mode = b.pricing_mode;
    if ("voice" in b && (REMI_VOICES as readonly string[]).includes(b.voice)) patch.voice = b.voice;
    if ("kiosk_idle_seconds" in b) patch.kiosk_idle_seconds = Math.max(30, Math.min(900, Number(b.kiosk_idle_seconds) || 90));
    if ("active" in b) patch.active = !!b.active;
    if ("suggested_questions" in b) patch.suggested_questions = cleanList(b.suggested_questions, 8, 90);
    if ("notify_emails" in b) {
      patch.notify_emails = cleanList(b.notify_emails, 10, 120)
        .map((e) => e.toLowerCase())
        .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    }
    if ("webhook_url" in b) {
      const u = clean(b.webhook_url, 500);
      if (u) {
        try {
          const parsed = await assertPublicUrl(u);
          if (parsed.protocol !== "https:") return jsonError("Webhook must use https://", 400);
        } catch (e) {
          return jsonError(e instanceof Error ? e.message : "Invalid webhook URL", 400);
        }
      }
      patch.webhook_url = u;
      if (u && !b.keep_secret) patch.webhook_secret = randomBytes(24).toString("hex");
      if (!u) patch.webhook_secret = null;
    }
    if ("slug" in b) {
      const s = String(b.slug || "").toLowerCase().trim();
      if (!/^[a-z0-9][a-z0-9-]{2,40}$/.test(s)) return jsonError("Link name: 3–40 lowercase letters, numbers or dashes.", 400);
      const { data: taken } = await admin.from("remi_workspaces").select("id").eq("slug", s).neq("id", id).maybeSingle();
      if (taken) return jsonError("That link name is already taken.", 409);
      patch.slug = s;
    }

    const { data, error } = await admin.from("remi_workspaces").update(patch).eq("id", id).select("*").single();
    if (error) return jsonError(error.message, 400);
    await audit(admin, id, user.id, "workspace.updated", { fields: Object.keys(patch).filter((k) => k !== "updated_at" && k !== "webhook_secret") });
    return Response.json({ workspace: data });
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const { admin } = await requireRemi(id, "owner");
    const { data: files } = await admin.from("remi_brains").select("storage_path").eq("workspace_id", id).not("storage_path", "is", null);
    const paths = (files || []).map((f) => f.storage_path as string).filter(Boolean);
    if (paths.length) await admin.storage.from("remi-brains").remove(paths);
    await admin.from("remi_workspaces").delete().eq("id", id);
    return Response.json({ ok: true });
  });
}
