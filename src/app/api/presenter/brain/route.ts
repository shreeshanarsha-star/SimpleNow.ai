// Presenter.ai — owner-only: Shree's briefing (vocabulary, do's and don'ts,
// background) and the people Shree remembers across sessions.
import { db, json, ownerGuard, type Brain } from "@/lib/presenter/server";

export const dynamic = "force-dynamic";

const clip = (v: unknown, n: number) => String(v ?? "").slice(0, n);

export async function GET(req: Request) {
  const g = await ownerGuard();
  if (g instanceof Response) return g;
  const id = new URL(req.url).searchParams.get("sessionId") || "";
  const sb = db();
  const [{ data: sess }, { data: people }] = await Promise.all([
    sb.from("presenter_sessions").select("state").eq("id", id).maybeSingle(),
    sb.from("presenter_people").select("id, display_name, role, profile, remember, updated_at").order("display_name"),
  ]);
  const brain = ((sess?.state as Record<string, unknown>)?.brain || {}) as Brain;
  return json({
    brain,
    people: (people || []).map((p) => {
      const pr = (p.profile || {}) as Record<string, unknown>;
      return { id: p.id, name: p.display_name, role: p.role || "", notes: String(pr.notes || ""), lastIntro: pr.lastIntro || null, lastCommitment: pr.lastCommitment || null, sessions: (pr.sessions as string[]) || [], remember: p.remember };
    }),
  });
}

export async function POST(req: Request) {
  const g = await ownerGuard();
  if (g instanceof Response) return g;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const sb = db();
  const action = String(body.action || "");

  if (action === "brain") {
    const id = String(body.sessionId || "");
    const b = (body.brain || {}) as Brain;
    const brain: Brain = { vocab: clip(b.vocab, 6000), rules: clip(b.rules, 6000), knowledge: clip(b.knowledge, 12000) };
    const { data } = await sb.from("presenter_sessions").select("state").eq("id", id).single();
    const { error } = await sb.from("presenter_sessions").update({ state: { ...((data?.state as object) || {}), brain }, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  if (action === "person") {
    const p = (body.person || {}) as Record<string, unknown>;
    const name = clip(p.name, 60).trim();
    if (name.length < 2) return json({ error: "Name is required" }, 400);
    const key = name.toLowerCase().replace(/\s+/g, " ");
    const id = p.id ? String(p.id) : null;
    const existing = id
      ? (await sb.from("presenter_people").select("id, profile").eq("id", id).maybeSingle()).data
      : (await sb.from("presenter_people").select("id, profile").eq("name_key", key).maybeSingle()).data;
    const profile = { ...((existing?.profile as object) || {}), notes: clip(p.notes, 1000) };
    const row = { display_name: name, name_key: key, role: clip(p.role, 120) || null, profile, remember: p.remember !== false, updated_at: new Date().toISOString() };
    const res = existing ? await sb.from("presenter_people").update(row).eq("id", existing.id) : await sb.from("presenter_people").insert(row);
    if (res.error) return json({ error: res.error.message }, 500);
    return json({ ok: true });
  }

  if (action === "person-delete") {
    const { error } = await sb.from("presenter_people").delete().eq("id", String(body.id || ""));
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
}
