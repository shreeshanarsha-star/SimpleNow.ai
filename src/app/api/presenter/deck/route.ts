import { db, json, ownerGuard } from "@/lib/presenter/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KINDS = ["deck", "notes", "quiz"] as const;
type Kind = (typeof KINDS)[number];

// POST multipart: file + kind + sessionId -> stores the PDF privately.
export async function POST(req: Request) {
  const g = await ownerGuard();
  if (g instanceof Response) return g;
  // Big files: the browser uploads straight to storage with a signed URL (Vercel caps request bodies at 4.5 MB).
  if ((req.headers.get("content-type") || "").includes("application/json")) {
    const b = (await req.json().catch(() => ({}))) as { action?: string; kind?: Kind; sessionId?: string; name?: string };
    if (!b.kind || !KINDS.includes(b.kind) || !b.sessionId) return json({ error: "Missing kind or session" }, 400);
    const path = `${b.sessionId}/${b.kind}.pdf`;
    const sb = db();
    if (b.action === "sign") {
      const { data, error } = await sb.storage.from("presenter").createSignedUploadUrl(path, { upsert: true });
      if (error || !data) return json({ error: error?.message || "Could not prepare upload" }, 500);
      return json({ signedUrl: data.signedUrl });
    }
    if (b.action === "done") {
      await markFile(b.sessionId, b.kind, String(b.name || `${b.kind}.pdf`));
      return json({ ok: true, path });
    }
    return json({ error: "Unknown action" }, 400);
  }
  const form = await req.formData();
  const file = form.get("file");
  const kind = String(form.get("kind") || "") as Kind;
  const sessionId = String(form.get("sessionId") || "");
  if (!(file instanceof File) || !KINDS.includes(kind) || !sessionId) return json({ error: "Missing file, kind or session" }, 400);
  if (file.type && file.type !== "application/pdf") return json({ error: "Please upload a PDF" }, 400);
  const sb = db();
  const path = `${sessionId}/${kind}.pdf`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { error } = await sb.storage.from("presenter").upload(path, buf, { contentType: "application/pdf", upsert: true });
  if (error) return json({ error: error.message }, 500);
  await markFile(sessionId, kind, file.name);
  return json({ ok: true, path });
}

async function markFile(sessionId: string, kind: Kind, name: string) {
  const sb = db();
  const { data: s } = await sb.from("presenter_sessions").select("state").eq("id", sessionId).single();
  const state = { ...(s?.state || {}), files: { ...((s?.state as { files?: Record<string, unknown> })?.files || {}), [kind]: { name, at: new Date().toISOString() } } };
  await sb.from("presenter_sessions").update({ state, updated_at: new Date().toISOString() }).eq("id", sessionId);
}

// GET ?sessionId= -> signed URLs (1 hour) for the uploaded PDFs.
export async function GET(req: Request) {
  const g = await ownerGuard();
  if (g instanceof Response) return g;
  const sessionId = new URL(req.url).searchParams.get("sessionId") || "";
  if (!sessionId) return json({ error: "Missing session" }, 400);
  const sb = db();
  const out: Record<string, string | null> = {};
  for (const k of KINDS) {
    const { data } = await sb.storage.from("presenter").createSignedUrl(`${sessionId}/${k}.pdf`, 60 * 60 * 6);
    out[k] = data?.signedUrl || null;
  }
  return json(out);
}
