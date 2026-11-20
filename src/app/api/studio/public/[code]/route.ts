// Audience phones (no login). A random device token kept on the phone identifies the person.
import { buildRunOfShow } from "@/lib/studio/engine";
import { showResults } from "@/lib/studio/results";
import { db, getShowByCode, json } from "@/lib/studio/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };
const GRACE_MS = 1500;

export async function GET(req: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const token = (new URL(req.url).searchParams.get("t") || "").slice(0, 80);
  const show = await getShowByCode(code);
  if (!show || show.status === "archived") return json({ error: "This session code isn't active." }, 404);
  const sb = db();
  const { data: me } = token ? await sb.from("presenter_show_people").select("id,name").eq("show_id", show.id).eq("token", token).maybeSingle() : { data: null };
  const steps = buildRunOfShow(show.plan);
  const live = show.live;
  const step = live.started ? steps[live.step] : null;
  const now = Date.now();
  const base = { title: show.title, presenter: show.plan.presenter.name, qaOn: show.plan.qa.enabled, serverNow: now, me: me ? { name: me.name } : null };

  let view: Record<string, unknown> = { kind: live.ended ? "ended" : live.started ? "follow" : "waiting" };
  let mine: Array<{ kind: string; item: string; choice: number | null }> = [];
  if (me) {
    const { data } = await sb.from("presenter_show_answers").select("kind,item,choice").eq("show_id", show.id).eq("person_id", me.id).in("kind", ["poll", "quiz"]);
    mine = (data || []) as typeof mine;
  }
  const myChoice = (kind: string, item: string) => mine.find((m) => m.kind === kind && m.item === item)?.choice ?? null;

  if (step && !live.ended) {
    if ((step.kind === "poll" || step.kind === "poll_result") && step.pollKey) {
      const poll = show.plan.polls.items.find((p) => p.key === step.pollKey);
      if (poll) {
        const counts = step.kind === "poll_result" ? (await showResults(show.id, show.plan)).polls[poll.key] : null;
        view = { kind: step.kind, key: poll.key, question: poll.question, options: poll.options, open: step.kind === "poll", counts, answer: step.kind === "poll_result" ? poll.answer : null, mine: myChoice("poll", poll.key) };
      }
    } else if (step.kind === "quiz_q" && step.quizIdx !== undefined) {
      const q = show.plan.quiz.items[step.quizIdx];
      const endsAt = live.stepAt + show.plan.quiz.seconds * 1000;
      const over = now > endsAt;
      view = { kind: "quiz_q", idx: step.quizIdx, n: show.plan.quiz.items.length, q: q.q, options: q.options, endsAt, open: !over, answer: over ? q.answer : null, mine: myChoice("quiz", String(step.quizIdx)) };
    } else if (step.kind === "quiz_intro" || step.kind === "quiz_end") {
      view = { kind: step.kind, n: show.plan.quiz.items.length, seconds: show.plan.quiz.seconds };
    } else if (step.kind === "qa") {
      view = { kind: "qa" };
    } else if (step.kind === "results" || step.kind === "close") {
      const r = await showResults(show.id, show.plan);
      const myRank = me ? r.ranking.findIndex((x) => x.person === me.id) : -1;
      view = {
        kind: step.kind,
        winners: r.ranking.filter((x) => x.correct > 0).slice(0, 3).map((x) => x.name),
        myScore: myRank >= 0 ? { rank: myRank + 1, correct: r.ranking[myRank].correct, of: show.plan.quiz.items.length } : null,
        polls: show.plan.polls.enabled ? show.plan.polls.items.map((p) => ({ question: p.question, options: p.options, counts: r.polls[p.key], answer: p.answer })) : [],
      };
    }
  }
  let questions: Array<{ id: number; text: string; status: string }> = [];
  if (me) {
    const { data } = await sb.from("presenter_show_answers").select("id,text,status").eq("show_id", show.id).eq("person_id", me.id).eq("kind", "ask").order("id");
    questions = (data || []) as typeof questions;
  }
  return json({ ...base, view, questions });
}

export async function POST(req: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const b = (await req.json().catch(() => ({}))) as { op?: string; t?: string; name?: string; team?: string; key?: string; idx?: number; choice?: number; text?: string };
  const token = String(b.t || "").slice(0, 80);
  if (token.length < 8) return json({ error: "Missing device token" }, 400);
  const show = await getShowByCode(code);
  if (!show || show.status === "archived") return json({ error: "This session code isn't active." }, 404);
  const sb = db();

  if (b.op === "join") {
    const name = String(b.name || "").trim().slice(0, 60);
    if (!name) return json({ error: "Please enter your name" }, 400);
    const { error } = await sb.from("presenter_show_people").upsert({ show_id: show.id, token, name, team: String(b.team || "").trim().slice(0, 80) || null }, { onConflict: "show_id,token" });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  const { data: me } = await sb.from("presenter_show_people").select("id").eq("show_id", show.id).eq("token", token).maybeSingle();
  if (!me) return json({ error: "Please join first" }, 401);
  const steps = buildRunOfShow(show.plan);
  const step = show.live.started && !show.live.ended ? steps[show.live.step] : null;
  const now = Date.now();

  if (b.op === "vote") {
    const poll = show.plan.polls.items.find((p) => p.key === b.key);
    if (!poll || step?.kind !== "poll" || step.pollKey !== poll.key) return json({ error: "This poll is closed." }, 409);
    const choice = Number(b.choice);
    if (!Number.isInteger(choice) || choice < 0 || choice >= poll.options.length) return json({ error: "Bad choice" }, 400);
    const { error } = await sb.from("presenter_show_answers").insert({ show_id: show.id, person_id: me.id, kind: "poll", item: poll.key, choice });
    if (error && !String(error.message).includes("duplicate")) return json({ error: error.message }, 500);
    return json({ ok: true, already: !!error });
  }

  if (b.op === "quiz") {
    const idx = Number(b.idx);
    if (step?.kind !== "quiz_q" || step.quizIdx !== idx) return json({ error: "Time's up for this question." }, 409);
    const ms = now - show.live.stepAt;
    if (ms > show.plan.quiz.seconds * 1000 + GRACE_MS) return json({ error: "Time's up for this question." }, 409);
    const q = show.plan.quiz.items[idx];
    const choice = Number(b.choice);
    if (!q || !Number.isInteger(choice) || choice < 0 || choice >= q.options.length) return json({ error: "Bad choice" }, 400);
    const { error } = await sb.from("presenter_show_answers").insert({ show_id: show.id, person_id: me.id, kind: "quiz", item: String(idx), choice, ms: Math.max(0, ms) });
    if (error && !String(error.message).includes("duplicate")) return json({ error: error.message }, 500);
    return json({ ok: true, already: !!error });
  }

  if (b.op === "ask") {
    if (!show.plan.qa.enabled) return json({ error: "Questions are off for this session." }, 409);
    const text = String(b.text || "").trim().slice(0, 400);
    if (text.length < 3) return json({ error: "Please type a question" }, 400);
    const { count } = await sb.from("presenter_show_answers").select("id", { count: "exact", head: true }).eq("show_id", show.id).eq("person_id", me.id).eq("kind", "ask");
    if ((count || 0) >= 8) return json({ error: "You've sent the maximum number of questions." }, 429);
    const { error } = await sb.from("presenter_show_answers").insert({ show_id: show.id, person_id: me.id, kind: "ask", text });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }
  return json({ error: "Unknown op" }, 400);
}
