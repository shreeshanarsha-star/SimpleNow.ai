import { db, json, studioGuard } from "@/lib/studio/server";

export const dynamic = "force-dynamic";

// Platform owner only: which avatar each Studio user presents with.
// GET ?q=email → matching signed-up users with their assigned persona.
export async function GET(req: Request) {
  const g = await studioGuard(req);
  if (g instanceof Response) return g;
  if (!g.isAdmin) return json({ error: "Admins only" }, 403);
  const q = (new URL(req.url).searchParams.get("q") || "").trim().toLowerCase();
  const sb = db();
  let query = sb.from("profiles").select("id,email,full_name").not("email", "is", null).eq("is_anonymous", false).order("created_at", { ascending: false }).limit(25);
  if (q) query = query.ilike("email", `%${q.replace(/[%_]/g, "")}%`);
  const [{ data: users }, { data: assigned }] = await Promise.all([query, sb.from("presenter_studio_users").select("user_id,email,persona_id,presenter_name,updated_at").order("updated_at", { ascending: false })]);
  const map = new Map((assigned || []).map((a) => [a.user_id as string, a]));
  return json({
    users: (users || []).map((u) => ({ id: u.id, email: u.email, name: u.full_name, personaId: (map.get(u.id as string)?.persona_id as string) || "", presenterName: (map.get(u.id as string)?.presenter_name as string) || "" })),
    assigned: assigned || [],
  });
}

// POST { userId, personaId, presenterName } — empty personaId removes the assignment (back to Shree).
export async function POST(req: Request) {
  const g = await studioGuard(req);
  if (g instanceof Response) return g;
  if (!g.isAdmin) return json({ error: "Admins only" }, 403);
  const b = (await req.json().catch(() => ({}))) as { userId?: string; personaId?: string; presenterName?: string };
  if (!b.userId) return json({ error: "Missing user" }, 400);
  const personaId = (b.personaId || "").trim();
  if (personaId && !/^[0-9a-f-]{36}$/i.test(personaId)) return json({ error: "That doesn't look like an Anam persona ID." }, 400);
  const sb = db();
  if (!personaId) {
    await sb.from("presenter_studio_users").delete().eq("user_id", b.userId);
    return json({ ok: true });
  }
  const { data: prof } = await sb.from("profiles").select("email").eq("id", b.userId).maybeSingle();
  const { error } = await sb
    .from("presenter_studio_users")
    .upsert({ user_id: b.userId, email: prof?.email || null, persona_id: personaId, presenter_name: (b.presenterName || "").trim().slice(0, 40), updated_at: new Date().toISOString() });
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}
