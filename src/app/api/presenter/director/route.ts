import { searchLibrary } from "@/lib/presenter/library";
import { db, json, loadBrain, loadRoom, ownerGuard, runDirector, type DirectorInput } from "@/lib/presenter/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const g = await ownerGuard();
  if (g instanceof Response) return g;
  const body = (await req.json().catch(() => null)) as (DirectorInput & { sessionId?: string }) | null;
  if (!body?.mode) return json({ error: "Missing mode" }, 400);
  const started = Date.now();
  try {
    if (body.sessionId) {
      // Library lookup for questions and conversation (not for scripted lines): include the last few
      // lines so follow-ups ("how did they do it?") find the same document.
      const asked = body.lookup || (body.mode === "room" ? body.heard : body.mode === "direct" ? body.instruction : "");
      const recent = (body.transcript || []).slice(-3).map((t) => t.text).join(" ");
      const [brain, room, library] = await Promise.all([
        loadBrain(body.sessionId).catch(() => ""),
        loadRoom(body.sessionId).catch(() => ""),
        asked ? searchLibrary(`${recent} ${asked}`) : Promise.resolve(""),
      ]);
      body.brain = brain;
      body.room = room || undefined;
      body.library = library || undefined;
    }
    const out = await runDirector(body);
    if (body.sessionId) {
      await db()
        .from("presenter_events")
        .insert({
          session_id: body.sessionId,
          kind: `director.${body.mode}`,
          payload: { heard: body.heard, instruction: body.instruction, slideIdx: body.slideIdx, say: out.say, provider: out.provider, ms: Date.now() - started },
        });
    }
    return json(out);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Director failed" }, 502);
  }
}
