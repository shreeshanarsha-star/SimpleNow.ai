// Presenter.ai — owner-only hub controls (TV laptop + control phone).
import { db, json, ownerGuard } from "@/lib/presenter/server";
import { callTextModel } from "@/lib/aiClient";
import { ASSESSMENT, POLLS, QUIZ_TIMING, SHARED_DOCS, levelFor, type HubPhase, type HubState } from "@/lib/presenter/content";
import { QUIZ_KEY, buildBoard, hubOf, patchHub, sessionById } from "@/lib/presenter/hub";
import { ensureFlyerToken } from "@/lib/presenter/flyerKit";
import { syncDeck } from "@/lib/presenter/library";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PHASES: HubPhase[] = ["lobby", "wishwall", "quiz", "assessment", "poll", "questions", "build", "flyer", "commit", "finale", "closed"];

export async function GET(req: Request) {
  const g = await ownerGuard();
  if (g instanceof Response) return g;
  const id = new URL(req.url).searchParams.get("id") || "";
  const session = await sessionById(id);
  if (!session) return json({ error: "Session not found" }, 404);
  const [board, { data: sl }] = await Promise.all([buildBoard(id), db().from("presenter_slides").select("idx, body").eq("session_id", id).order("idx")]);
  // Short slide titles for the remote's "jump to slide" list.
  const slides = (sl || []).map((r) => {
    const lines = String(r.body || "").split("\n").map((x) => x.trim()).filter(Boolean);
    const t = lines.find((x) => /[a-z]/.test(x) && x.length > 6 && !x.includes("·")) || lines[0] || "";
    return { idx: r.idx, title: t.slice(0, 60) };
  });
  // The Story runs until the build slide (searched from slide 2: slide 1's agenda mentions the build).
  const se = (sl || []).find((r) => r.idx >= 1 && /FLYER CHALLENGE/i.test(String(r.body || "")));
  const storyEnd = se ? se.idx : Math.min(16, slides.length);
  return json({ hub: hubOf(session), code: session.code, title: session.title, board, quizKey: QUIZ_KEY, slides, storyEnd });
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
    if (phase === "poll") patch.pollReveal = null;
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
  if (action === "share-doc") {
    const key = String(body.key || "");
    if (!SHARED_DOCS.some((d) => d.key === key)) return json({ error: "Unknown doc" }, 400);
    const cur = hub.sharedDocs || [];
    return json({ hub: cur.includes(key) ? hub : await patchHub(id, { sharedDocs: [...cur, key] }) });
  }

  if (action === "quiz-shift") {
    // B after A mid-quiz: push the clock forward by the time away, so nobody loses questions.
    const ms = Math.max(0, Math.min(3_600_000, Number(body.ms) || 0));
    return json({ hub: await patchHub(id, { quiz: hub.quiz ? { ...hub.quiz, start: hub.quiz.start + ms } : null }) });
  }
  if (action === "quiz-reset") {
    await db().from("presenter_responses").delete().eq("session_id", id).eq("kind", "quiz");
    return json({ hub: await patchHub(id, { quiz: null }) });
  }

  if (action === "poll-reveal") {
    const best = body.best === null ? null : Number(body.best);
    return json({ hub: await patchHub(id, { pollReveal: best === null || Number.isNaN(best) ? null : best }) });
  }

  if (action === "wishwall") {
    // Show the wall at once; group the tasks by theme (AI) and update it.
    const board = await buildBoard(id);
    const wishes = (board as { wishes?: string[] }).wishes || [];
    await patchHub(id, { phase: "wishwall", wishGroups: null });
    let groups: Array<{ label: string; items: string[] }> | null = null;
    if (wishes.length >= 3) {
      try {
        const out = await callTextModel(
          `Group these "tasks I wish I never had to do again" from an HR team into 2 to 5 themes. Short theme labels (2 to 4 words, e.g. "Chasing follow-ups"). Every task goes in exactly one theme; keep each task's wording.
Tasks: ${JSON.stringify(wishes)}
Return ONLY JSON: {"groups":[{"label":"...","items":["..."]}]}`,
          600,
          15_000,
          process.env.PRESENTER_FALLBACK_MODEL || "gpt-4o"
        );
        const parsed = JSON.parse(out.replace(/^[^{]*/, "").replace(/[^}]*$/, ""));
        if (Array.isArray(parsed.groups)) groups = parsed.groups.slice(0, 6);
      } catch {
        groups = null; // the ungrouped wall is the silent backup
      }
    }
    return json({ hub: await patchHub(id, { phase: "wishwall", wishGroups: groups }) });
  }

  if (action === "finale-step" && Number(body.step ?? (hub.finaleStep || 0) + 1) >= 4) {
    // Levels are revealed: keep each consenting person's level for the 60–90 day re-assessment.
    const sb = db();
    const [{ data: att }, { data: resp }] = await Promise.all([
      sb.from("presenter_attendees").select("id, person_id, data").eq("session_id", id),
      sb.from("presenter_responses").select("attendee_id, value").eq("session_id", id).eq("kind", "assess"),
    ]);
    const totals = new Map<string, { n: number; t: number }>();
    for (const r of resp || []) {
      const cur = totals.get(r.attendee_id) || { n: 0, t: 0 };
      cur.n++;
      cur.t += Number((r.value as { score?: number })?.score) || 0;
      totals.set(r.attendee_id, cur);
    }
    for (const a of att || []) {
      const tt = totals.get(a.id);
      if (!a.person_id || !tt || tt.n < ASSESSMENT.length || (a.data as { remember?: boolean } | null)?.remember === false) continue;
      const { data: p } = await sb.from("presenter_people").select("profile").eq("id", a.person_id).maybeSingle();
      const profile = (p?.profile || {}) as Record<string, unknown>;
      const levels = { ...((profile.levels as Record<string, unknown>) || {}), [session.code]: { level: levelFor(tt.t).name, score: tt.t, at: new Date().toISOString().slice(0, 10) } };
      await sb.from("presenter_people").update({ profile: { ...profile, levels } }).eq("id", a.person_id);
    }
  }

  if (action === "finale-step") {
    const step = Math.max(0, Math.min(5, Number(body.step ?? (hub.finaleStep || 0) + 1)));
    return json({ hub: await patchHub(id, { phase: "finale", finaleStep: step }) });
  }

  if (action === "flyer-inputs") {
    // Claude Code mode: store the room's inputs; the laptop's Claude Code fetches them with the brief.
    const i = (body.inputs || {}) as { name?: string; date?: string; venue?: string; highlights?: string[] };
    const inputs = { name: String(i.name || "").slice(0, 80), date: String(i.date || "").slice(0, 60), venue: String(i.venue || "").slice(0, 70), highlights: (i.highlights || []).map((h) => String(h).slice(0, 70)).slice(0, 3) };
    return json({ hub: await patchHub(id, { phase: "build", flyerBuild: { status: "waiting", startedAt: Date.now(), inputs, provider: "claude-code" } }) });
  }

  if (action === "flyer-kit") {
    return json({ token: await ensureFlyerToken(session), code: session.code, base: new URL(req.url).origin });
  }

  if (action === "flyer-url") {
    return json({ hub: await patchHub(id, { flyerUrl: String(body.url || "").slice(0, 300) || null }) });
  }

  if (action === "room-question") {
    // A question asked out loud that Shree parked for Q&A.
    const text = String(body.text || "").replace(/\s+/g, " ").trim().slice(0, 300);
    if (text.length < 5) return json({ error: "Empty" }, 400);
    await db().from("presenter_questions").insert({ session_id: id, source: "room", text, votes: 1 });
    return json({ ok: true });
  }

  if (action === "question-status") {
    await db().from("presenter_questions").update({ status: String(body.status || "answered") }).eq("id", String(body.qid || "")).eq("session_id", id);
    return json({ ok: true });
  }

  if (action === "room-log") {
    // Room ears: lines the TV laptop overheard (text only, never audio; not visible to phones).
    const lines = (Array.isArray(body.lines) ? body.lines : []).map((t) => String(t || "").replace(/\s+/g, " ").trim().slice(0, 300)).filter((t) => t.length > 1).slice(0, 30);
    if (lines.length) await db().from("presenter_events").insert(lines.map((text) => ({ session_id: id, kind: "room.heard", payload: { text } })));
    return json({ ok: true, count: lines.length });
  }

  if (action === "room-digest") {
    // Fold the new lines into a short running memory of the room (jokes, nicknames, mood).
    const sb = db();
    const { data: mem } = await sb.from("presenter_events").select("payload, created_at").eq("session_id", id).eq("kind", "room.memory").order("created_at", { ascending: false }).limit(1).maybeSingle();
    let q = sb.from("presenter_events").select("payload").eq("session_id", id).eq("kind", "room.heard");
    if (mem?.created_at) q = q.gt("created_at", mem.created_at);
    const { data: lines } = await q.order("created_at").limit(200);
    const heard = (lines || []).map((l) => String((l.payload as { text?: string })?.text || "")).filter(Boolean);
    if (heard.length < 3) return json({ ok: true, skipped: true });
    const prev = String((mem?.payload as { text?: string } | undefined)?.text || "");
    try {
      const out = await callTextModel(
        `You keep a short running memory of what an HR team said out loud today, so an AI co-host can join their banter naturally later. Speech-to-text, so words may be misheard; speakers are unknown unless a name is said.
Previous memory: ${prev || "(none yet)"}
New lines heard: ${JSON.stringify(heard)}
Write the updated memory in at most 150 words: running jokes and funny moments, nicknames, who teased whom (only when names were said), what was said about Shreesha or about AI, the room's mood. Leave out anything private, personal, health-related or hurtful. Plain text, no preamble.`,
        400,
        20_000,
        process.env.PRESENTER_FALLBACK_MODEL || "gpt-4o"
      );
      const text = out.trim().slice(0, 1500);
      if (text) await sb.from("presenter_events").insert({ session_id: id, kind: "room.memory", payload: { text } });
      return json({ ok: true });
    } catch {
      return json({ ok: false });
    }
  }

  if (action === "clear") {
    // Wipes tonight's sign-ups, answers and questions for THIS session only (people memory is kept).
    const sb = db();
    await sb.from("presenter_questions").delete().eq("session_id", id);
    await sb.from("presenter_responses").delete().eq("session_id", id);
    await sb.from("presenter_attendees").delete().eq("session_id", id);
    await sb.from("presenter_events").delete().eq("session_id", id).in("kind", ["room.heard", "room.memory"]);
    return json({ hub: await patchHub(id, { phase: "lobby", quiz: null, poll: null, finaleStep: 0, flyerUrl: null, flyerBuild: null, sharedDocs: [] }) });
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
    // Keep the whole deck in Shree's Library (rebuilt only if the text changed).
    const lib = await syncDeck(id).catch((e) => ({ error: e instanceof Error ? e.message : "sync failed" }));
    return json({ ok: true, count: rows.length, library: lib });
  }

  return json({ error: "Unknown action" }, 400);
}
