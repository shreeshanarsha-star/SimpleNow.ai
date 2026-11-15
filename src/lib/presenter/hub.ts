// Presenter.ai — server-only logic for the audience session hub (/p/<code>).
import { db, loadBrain, runDirector } from "@/lib/presenter/server";
import { ASSESSMENT, DEFAULT_HUB, LEVELS, POLLS, QUIZ, levelFor, type HubState } from "@/lib/presenter/content";

// Correct option index per quiz question (A=0 … D=3). Server-only.
export const QUIZ_KEY = [0, 1, 2, 3, 2, 0, 1, 3, 1, 0, 2, 1, 0, 3, 1, 0, 2, 1, 1, 3, 0, 2, 3, 0, 2, 1, 2, 0, 3, 1];

export type SessionRow = { id: string; code: string; title: string; status: string; state: Record<string, unknown> };

export const hubOf = (s: SessionRow | null): HubState => ({ ...DEFAULT_HUB, ...((s?.state?.hub as HubState) || {}) });

export async function sessionByCode(code: string) {
  const c = code.trim().toUpperCase().slice(0, 8);
  if (!c) return null;
  const { data } = await db().from("presenter_sessions").select("id, code, title, status, state").eq("code", c).maybeSingle();
  return (data as SessionRow) || null;
}

export async function sessionById(id: string) {
  const { data } = await db().from("presenter_sessions").select("id, code, title, status, state").eq("id", id).maybeSingle();
  return (data as SessionRow) || null;
}

export async function attendeeByToken(sessionId: string, token: string) {
  if (!token) return null;
  const { data } = await db()
    .from("presenter_attendees")
    .select("id, display_name, person_id, intro, data")
    .eq("session_id", sessionId)
    .eq("device_token", token.slice(0, 80))
    .maybeSingle();
  return data as { id: string; display_name: string; person_id: string | null; intro: string | null; data: Record<string, unknown> } | null;
}

export const nameKey = (n: string) => n.trim().toLowerCase().replace(/\s+/g, " ");
export const cleanText = (t: unknown, max: number) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Merge a patch into state.hub (re-reads first so other state keys survive). */
export async function patchHub(sessionId: string, patch: Partial<HubState>) {
  const sb = db();
  const { data } = await sb.from("presenter_sessions").select("state").eq("id", sessionId).single();
  const state = (data?.state || {}) as Record<string, unknown>;
  const hub = { ...DEFAULT_HUB, ...((state.hub as HubState) || {}), ...patch, at: Date.now() };
  await sb.from("presenter_sessions").update({ state: { ...state, hub }, updated_at: new Date().toISOString() }).eq("id", sessionId);
  return hub;
}

/* ------------------------------ Board (TV + control) ------------------------------ */

type Resp = { attendee_id: string; kind: string; item_key: string; value: Record<string, unknown>; ms: number | null };

export async function buildBoard(sessionId: string) {
  const sb = db();
  const [{ data: att }, { data: resp }, { data: qs }] = await Promise.all([
    sb.from("presenter_attendees").select("id, display_name, intro, created_at").eq("session_id", sessionId).order("created_at"),
    sb.from("presenter_responses").select("attendee_id, kind, item_key, value, ms").eq("session_id", sessionId).limit(5000),
    sb.from("presenter_questions").select("id, text, answer, votes, status, created_at").eq("session_id", sessionId).order("votes", { ascending: false }).order("created_at").limit(100),
  ]);
  const attendees = (att || []) as Array<{ id: string; display_name: string; intro: string | null }>;
  const responses = (resp || []) as Resp[];
  const nameOf = new Map(attendees.map((a) => [a.id, a.display_name]));

  // Quiz
  const quizScore = new Map<string, { correct: number; ms: number; answered: number }>();
  const perQuestion = QUIZ.map(() => ({ answered: 0, correct: 0, counts: [0, 0, 0, 0] }));
  for (const r of responses.filter((x) => x.kind === "quiz")) {
    const i = Number(r.item_key.replace("q", ""));
    const choice = Number(r.value?.choice);
    const ok = !!r.value?.correct;
    const cur = quizScore.get(r.attendee_id) || { correct: 0, ms: 0, answered: 0 };
    cur.answered++;
    if (ok) {
      cur.correct++;
      cur.ms += r.ms || 0;
    }
    quizScore.set(r.attendee_id, cur);
    if (perQuestion[i]) {
      perQuestion[i].answered++;
      if (ok) perQuestion[i].correct++;
      if (choice >= 0 && choice < 4) perQuestion[i].counts[choice]++;
    }
  }
  const leaderboard = [...quizScore.entries()]
    .map(([id, v]) => ({ name: nameOf.get(id) || "Guest", ...v }))
    .sort((a, b) => b.correct - a.correct || a.ms - b.ms);

  // Assessment
  const assess = new Map<string, { n: number; total: number }>();
  for (const r of responses.filter((x) => x.kind === "assess")) {
    const cur = assess.get(r.attendee_id) || { n: 0, total: 0 };
    cur.n++;
    cur.total += Number(r.value?.score) || 0;
    assess.set(r.attendee_id, cur);
  }
  const completed = [...assess.values()].filter((v) => v.n >= ASSESSMENT.length);
  const levelCounts = LEVELS.map((l) => ({ name: l.name, line: l.line, count: completed.filter((v) => levelFor(v.total).name === l.name).length }));

  // Polls
  const polls: Record<string, number[]> = {};
  for (const p of POLLS) polls[p.key] = p.options.map(() => 0);
  for (const r of responses.filter((x) => x.kind === "poll")) {
    const arr = polls[r.item_key];
    const c = Number(r.value?.choice);
    if (arr && c >= 0 && c < arr.length) arr[c]++;
  }

  const commitments = responses
    .filter((x) => x.kind === "commit")
    .map((x) => String(x.value?.text || ""))
    .filter(Boolean);

  return {
    attendees: attendees.map((a) => ({ name: a.display_name, intro: a.intro })),
    quiz: { perQuestion, leaderboard: leaderboard.slice(0, 10), players: quizScore.size },
    assessment: { started: assess.size, completed: completed.length, levelCounts },
    polls,
    questions: (qs || []).map((q) => ({ id: q.id, text: q.text, votes: q.votes, status: q.status, answer: q.answer })),
    commitments,
    serverNow: Date.now(),
  };
}

/* ------------------------------ Phone agent ------------------------------ */

export async function phoneAnswer(sessionId: string, question: string) {
  const { data: slides } = await db().from("presenter_slides").select("idx, title, body, notes").eq("session_id", sessionId).order("idx");
  const deck = (slides || [])
    .map((s) => `[Slide ${s.idx + 1}] ${s.notes || s.body || ""}`)
    .join("\n")
    .slice(0, 24000);
  const brain = await loadBrain(sessionId).catch(() => "");
  const out = await runDirector({
    mode: "free",
    brain,
    instruction: `You are answering privately on an attendee's PHONE (text, not speech). The session deck and speaker notes:\n"""${deck || "(not loaded)"}"""\n\nTheir question: "${question}"\n\nAnswer in 2 to 4 short sentences, plain text. Use facts only from the deck; if it's not covered, give general good practice and say Shreesha can go deeper in Q&A. If it's a build or tool-setup question, say Shreesha will cover it live. Never reveal anyone's scores or personal details.`,
  });
  return out.say;
}
