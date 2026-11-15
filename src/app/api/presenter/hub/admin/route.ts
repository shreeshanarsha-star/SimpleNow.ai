// Presenter.ai — owner-only hub controls (TV laptop + control phone).
import { db, json, ownerGuard } from "@/lib/presenter/server";
import { POLLS, QUIZ_TIMING, type HubPhase, type HubState } from "@/lib/presenter/content";
import { QUIZ_KEY, buildBoard, hubOf, patchHub, sessionById } from "@/lib/presenter/hub";

export const dynamic = "force-dynamic";

const PHASES: HubPhase[] = ["lobby", "quiz", "assessment", "poll", "questions", "flyer", "commit", "finale", "closed"];

export async function GET(req: Request) {
  const g = await ownerGuard();
  if (g instanceof Response) return g;
  const id = new URL(req.url).searchParams.get("id") || "";
  const session = await sessionById(id);
  if (!session) return json({ error: "Session not found" }, 404);
  const board = await buildBoard(id);
  return json({ hub: hubOf(session), code: session.code, title: session.title, board, quizKey: QUIZ_KEY });
}

export async function POST(req: Request) {
  const g = await ownerGuard();
  if (g instanceof Response) return g;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id || "");
  const session = await sessionById(id);
  if (!session) return json({ error: "Session not found" }, 404);
  const action = String(body.action || "");
  const hub = hubOf(session);

  if (action === "phase") {
    const phase = String(body.phase) as HubPhase;
    if (!PHASES.includes(phase)) return json({ error: "Unknown phase" }, 400);
    const patch: Partial<HubState> = { phase };
    if (phase === "poll") {
      const key = String(body.poll || "");
      if (!POLLS.some((p) => p.key === key)) return json({ error: "Unknown poll" }, 400);
      patch.poll = key;
    }
    if (phase === "finale" && hub.phase !== "finale") patch.finaleStep = 0;
    return json({ hub: await patchHub(id, patch) });
  }

  if (action === "quiz-start") {
    // Lead-in countdown, then every device derives the question from this start time.
    return json({ hub: await patchHub(id, { phase: "quiz", quiz: { start: Date.now() + QUIZ_TIMING.leadInMs, stoppedAt: null } }) });
  }
  if (action === "quiz-stop") {
    return json({ hub: await patchHub(id, { quiz: hub.quiz ? { ...hub.quiz, stoppedAt: Date.now() } : null }) });
  }
  if (action === "quiz-reset") {
    await db().from("presenter_responses").delete().eq("session_id", id).eq("kind", "quiz");
    return json({ hub: await patchHub(id, { quiz: null }) });
  }

  if (action === "finale-step") {
    const step = Math.max(0, Math.min(5, Number(body.step ?? (hub.finaleStep || 0) + 1)));
    return json({ hub: await patchHub(id, { phase: "finale", finaleStep: step }) });
  }

  if (action === "flyer-url") {
    return json({ hub: await patchHub(id, { flyerUrl: String(body.url || "").slice(0, 300) || null }) });
  }

  if (action === "question-status") {
    await db().from("presenter_questions").update({ status: String(body.status || "answered") }).eq("id", String(body.qid || "")).eq("session_id", id);
    return json({ ok: true });
  }

  if (action === "slides") {
    // The TV page extracts slide + notes text from the PDFs and stores it so the phone agent can use it.
    const slides = Array.isArray(body.slides) ? (body.slides as Array<{ body?: string; notes?: string }>).slice(0, 80) : [];
    if (!slides.length) return json({ error: "No slides" }, 400);
    const rows = slides.map((s, idx) => ({
      session_id: id,
      idx,
      title: String(s.body || "").split("\n")[0]?.slice(0, 200) || null,
      body: String(s.body || "").slice(0, 6000),
      notes: String(s.notes || "").slice(0, 6000),
    }));
    const { error } = await db().from("presenter_slides").upsert(rows, { onConflict: "session_id,idx" });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, count: rows.length });
  }

  return json({ error: "Unknown action" }, 400);
}
