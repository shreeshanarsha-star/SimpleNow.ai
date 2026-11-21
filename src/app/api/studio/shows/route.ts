import { db, json, newJoinCode, ownerGuard } from "@/lib/studio/server";
import { emptyLive, emptyPlan } from "@/lib/studio/types";

export const dynamic = "force-dynamic";
// Run next to the database (Supabase is in Singapore): live polling must be fast.
export const preferredRegion = "sin1";

// GET: all shows (drafts, ready, done) + past events, with simple stats.
export async function GET() {
  const g = await ownerGuard();
  if (g instanceof Response) return g;
  const sb = db();
  const { data, error } = await sb
    .from("presenter_shows")
    .select("id,title,event_date,status,code,legacy_session_id,created_at,updated_at,plan->deck,plan->purpose->>message")
    .order("created_at", { ascending: false });
  if (error) return json({ error: error.message }, 500);
  const rows = data || [];
  const stats: Record<string, { people: number; answers: number; questions: number }> = {};
  await Promise.all(
    rows.map(async (r) => {
      const legacy = r.legacy_session_id as string | null;
      const [p, a, q] = legacy
        ? await Promise.all([
            sb.from("presenter_attendees").select("id", { count: "exact", head: true }).eq("session_id", legacy),
            sb.from("presenter_responses").select("id", { count: "exact", head: true }).eq("session_id", legacy),
            sb.from("presenter_questions").select("id", { count: "exact", head: true }).eq("session_id", legacy),
          ])
        : await Promise.all([
            sb.from("presenter_show_people").select("id", { count: "exact", head: true }).eq("show_id", r.id),
            sb.from("presenter_show_answers").select("id", { count: "exact", head: true }).eq("show_id", r.id).in("kind", ["poll", "quiz"]),
            sb.from("presenter_show_answers").select("id", { count: "exact", head: true }).eq("show_id", r.id).eq("kind", "ask"),
          ]);
      stats[r.id as string] = { people: p.count || 0, answers: a.count || 0, questions: q.count || 0 };
    })
  );
  return json({ shows: rows.map((r) => ({ ...r, stats: stats[r.id as string] })) });
}

// POST { title?, fromId? }: new show (optionally a copy of another show's plan, as a template).
export async function POST(req: Request) {
  const g = await ownerGuard();
  if (g instanceof Response) return g;
  const body = (await req.json().catch(() => ({}))) as { title?: string; fromId?: string };
  const sb = db();
  let plan = emptyPlan();
  let title = (body.title || "").trim().slice(0, 160) || "Untitled presentation";
  if (body.fromId) {
    const { data: src } = await sb.from("presenter_shows").select("title,plan").eq("id", body.fromId).maybeSingle();
    if (src?.plan && Object.keys(src.plan).length) {
      plan = { ...emptyPlan(), ...(src.plan as object), deck: null, slides: [], script: { ...emptyPlan().script } } as typeof plan;
      plan.purpose = { ...plan.purpose, eventDate: "" };
      title = body.title?.trim() || `${src.title} (copy)`;
    }
  }
  for (let i = 0; i < 6; i++) {
    const { data, error } = await sb
      .from("presenter_shows")
      .insert({ owner_id: g.userId, title, plan, live: emptyLive(), code: newJoinCode() })
      .select("id")
      .single();
    if (!error) return json({ id: data.id });
    if (!String(error.message).includes("duplicate")) return json({ error: error.message }, 500);
  }
  return json({ error: "Could not create the show" }, 500);
}
