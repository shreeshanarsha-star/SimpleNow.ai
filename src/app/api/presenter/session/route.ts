import { db, json, newCode, ownerGuard } from "@/lib/presenter/server";

export const dynamic = "force-dynamic";

// GET: the owner's latest session (creates one if none). POST: new session.
export async function GET(req: Request) {
  const g = await ownerGuard();
  if (g instanceof Response) return g;
  const sb = db();
  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const { data: one } = await sb.from("presenter_sessions").select("*").eq("id", id).maybeSingle();
    if (one) return json({ session: one });
  }
  const { data } = await sb
    .from("presenter_sessions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data) return json({ session: data });
  return create(g.userId);
}

export async function POST(req: Request) {
  const g = await ownerGuard();
  if (g instanceof Response) return g;
  const body = await req.json().catch(() => ({}));
  if (body?.action === "patch" && body.id) {
    const sb = db();
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.state) update.state = body.state;
    if (body.status) update.status = body.status;
    if (body.title) update.title = body.title;
    const { data, error } = await sb.from("presenter_sessions").update(update).eq("id", body.id).select("*").single();
    if (error) return json({ error: error.message }, 500);
    return json({ session: data });
  }
  return create(g.userId, body?.title);
}

async function create(ownerId: string, title?: string) {
  const sb = db();
  // Carry Shreesha's briefing (vocabulary, rules, background) into the new session.
  const { data: prev } = await sb.from("presenter_sessions").select("state").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const brain = (prev?.state as Record<string, unknown> | undefined)?.brain;
  for (let i = 0; i < 5; i++) {
    const { data, error } = await sb
      .from("presenter_sessions")
      .insert({ code: newCode(), owner_id: ownerId, title: title || "The Rise of AI Agents", state: brain ? { brain } : {} })
      .select("*")
      .single();
    if (!error) return json({ session: data });
    if (!String(error.message).includes("duplicate")) return json({ error: error.message }, 500);
  }
  return json({ error: "Could not create a session" }, 500);
}
