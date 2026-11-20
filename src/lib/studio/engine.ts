// Presenter Studio — the show engine. Pure functions only (no React, no DB), so
// every rule here is unit-tested in tests/studio-engine.test.ts.
import type { Action, Live, Plan, Poll, Step } from "./types";

const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);
const secFor = (s: string) => Math.max(4, Math.round(words(s) / 2.4));

export function defaultOpening(plan: Plan) {
  const p = plan.purpose;
  const greet = p.timeOfDay === "evening" ? "Good evening" : p.timeOfDay === "afternoon" ? "Good afternoon" : "Good morning";
  return `${greet}, everyone. I'm ${plan.presenter.name || "your presenter"}, and I'm really glad to be with you today.${p.purpose ? ` ${p.purpose}` : ""}`;
}

export function qaLine() {
  return "Now it's your turn. Ask me anything on your phones, and I'll answer what I can from today's material.";
}

export function quizIntroLine(plan: Plan) {
  const n = plan.quiz.items.length;
  return `Time for a quick quiz on your phones: ${n} question${n === 1 ? "" : "s"}, ${plan.quiz.seconds} seconds each. Accuracy first, and speed breaks any ties.`;
}

export function quizEndLine(plan: Plan) {
  return plan.quiz.placement === "before" ? "That's the quiz. Scores are locked, and you'll see the winners at the end. Now, let's begin." : "That's the quiz. Scores are locked, and the winners are coming up.";
}

export function pollIntroLine(poll: Poll) {
  return `Quick poll on your phones: ${poll.question}`;
}

/** The closing always ends with the closing line, word for word. */
export function closingText(plan: Plan) {
  const body = (plan.script.closing || "").trim();
  const line = plan.purpose.closingLine.trim();
  if (!line) return body || "Thank you all for your time today.";
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  if (norm(body).includes(norm(line))) return body;
  return `${body}${body ? " " : ""}${line}`.trim();
}

/** Plan -> ordered list of steps. Never skips a block; polls follow their slide. */
export function buildRunOfShow(plan: Plan): Step[] {
  const steps: Step[] = [];
  const opening = plan.script.opening.trim() || defaultOpening(plan);
  steps.push({ kind: "opening", label: "Opening", slide: plan.slides.length ? 1 : null, say: opening, estSec: secFor(opening) });

  const quiz = () => {
    if (!plan.quiz.enabled || !plan.quiz.items.length) return;
    const intro = quizIntroLine(plan);
    steps.push({ kind: "quiz_intro", label: "Quiz: intro", slide: null, say: intro, estSec: secFor(intro) });
    plan.quiz.items.forEach((_, i) => steps.push({ kind: "quiz_q", label: `Quiz Q${i + 1}`, slide: null, say: "", quizIdx: i, estSec: plan.quiz.seconds + 3 }));
    const end = quizEndLine(plan);
    steps.push({ kind: "quiz_end", label: "Quiz: end", slide: null, say: end, estSec: secFor(end) });
  };

  if (plan.quiz.placement === "before") quiz();

  const polls = plan.polls.enabled ? plan.polls.items.filter((p) => p.question.trim() && p.options.filter(Boolean).length >= 2) : [];
  for (const s of plan.slides) {
    const say = (plan.script.slides[String(s.n)] || "").trim();
    steps.push({ kind: "slide", label: `Slide ${s.n}`, slide: s.n, say, estSec: secFor(say) });
    for (const p of polls.filter((x) => x.afterSlide === s.n)) {
      const intro = pollIntroLine(p);
      steps.push({ kind: "poll", label: `Poll: ${p.question.slice(0, 40)}`, slide: s.n, say: intro, pollKey: p.key, estSec: 35 });
      steps.push({ kind: "poll_result", label: "Poll result", slide: s.n, say: "", pollKey: p.key, estSec: 15 });
    }
  }

  if (plan.quiz.placement === "after") quiz();

  if (plan.qa.enabled) steps.push({ kind: "qa", label: "Q&A", slide: null, say: qaLine(), estSec: 300 });
  const hasResults = (plan.quiz.enabled && plan.quiz.items.length > 0) || polls.length > 0;
  if (hasResults) steps.push({ kind: "results", label: "Results", slide: null, say: "", estSec: 30 });
  const close = closingText(plan);
  steps.push({ kind: "close", label: "Close", slide: null, say: close, estSec: secFor(close) });
  return steps;
}

export function totalMinutes(steps: Step[]) {
  return Math.round(steps.reduce((a, s) => a + s.estSec, 0) / 60);
}

/* ------------------------------ Live reducer ------------------------------ */


/**
 * Applies one command. Each move bumps `take`, which tells the TV to (re)speak
 * the current step from the start. Moves are always exactly one step.
 */
export function reduce(live: Live, a: Action, stepCount: number, now: number): Live {
  const last = Math.max(0, stepCount - 1);
  const move = (step: number): Live => ({ ...live, v: live.v + 1, started: true, step, held: false, stepAt: now, say: null, ended: false, take: live.take + 1, spoken: -1 });
  switch (a.type) {
    case "start":
      return move(0);
    case "next":
      if (!live.started) return move(0);
      if (live.step >= last) return { ...live, v: live.v + 1, ended: true, held: false };
      return move(live.step + 1);
    case "prev":
      return move(Math.max(0, live.step - 1));
    case "goto":
      return move(Math.min(last, Math.max(0, Math.floor(a.step))));
    case "hold":
      return { ...live, v: live.v + 1, held: true };
    case "resume":
      // Repeat the current step from the start (never carry on mid-sentence).
      return { ...live, v: live.v + 1, held: false, take: live.take + 1, spoken: -1 };
    case "say":
      return { ...live, v: live.v + 1, held: false, say: { id: live.v + 1, text: a.text.slice(0, 1200) } };
    case "spoken":
      return a.step === live.step ? { ...live, v: live.v + 1, spoken: a.step } : live;
    case "avatar":
      return live.avatar === a.status ? live : { ...live, v: live.v + 1, avatar: a.status };
    case "reset":
      return { v: live.v + 1, started: false, step: 0, held: false, spoken: -1, stepAt: 0, say: null, ended: false, avatar: live.avatar, take: live.take + 1 };
  }
}

/** Assisted mode: after the presenter finishes, move on by itself only between slides. */
export function shouldAutoAdvance(steps: Step[], step: number, mode: Plan["mode"]) {
  if (mode !== "assisted") return false;
  const cur = steps[step];
  const nxt = steps[step + 1];
  if (!cur || !nxt) return false;
  return (cur.kind === "opening" || cur.kind === "slide") && nxt.kind === "slide";
}

/* ------------------------------- Results ---------------------------------- */

export type QuizAnswer = { person: string; name: string; idx: number; choice: number; ms: number };

/** Rank: most correct first; ties broken by the lowest total time on correct answers. */
export function quizRanking(answers: QuizAnswer[], key: number[]) {
  const by = new Map<string, { name: string; correct: number; ms: number; answered: number }>();
  const seen = new Set<string>();
  for (const a of answers) {
    const k = `${a.person}:${a.idx}`;
    if (seen.has(k)) continue; // first answer counts
    seen.add(k);
    const r = by.get(a.person) || { name: a.name, correct: 0, ms: 0, answered: 0 };
    r.answered++;
    if (key[a.idx] === a.choice) {
      r.correct++;
      r.ms += a.ms;
    }
    by.set(a.person, r);
  }
  return [...by.entries()].map(([person, r]) => ({ person, ...r })).sort((x, y) => y.correct - x.correct || x.ms - y.ms);
}

export function pollTally(poll: Poll, votes: number[]) {
  const counts = poll.options.map(() => 0);
  for (const v of votes) if (v >= 0 && v < counts.length) counts[v]++;
  return counts;
}

export function pollResultLine(poll: Poll, counts: number[]) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return "No votes came in on that one, and that's fine. Let's keep going.";
  const top = counts.indexOf(Math.max(...counts));
  const tie = counts.filter((c) => c === counts[top]).length > 1;
  let line = tie ? `It's a split room: ${total} vote${total === 1 ? "" : "s"} in.` : `Most of you chose "${poll.options[top]}", with ${counts[top]} of ${total} votes.`;
  if (poll.answer !== null && poll.answer >= 0 && poll.options[poll.answer]) {
    line += poll.answer === top && !tie ? " And that's the right answer." : ` The answer we were looking for is "${poll.options[poll.answer]}".`;
  }
  return line;
}

export function winnersLine(ranking: ReturnType<typeof quizRanking>, quizCount: number) {
  const top = ranking.filter((r) => r.correct > 0).slice(0, 3);
  if (!top.length) return "";
  const parts: string[] = [];
  if (top[2]) parts.push(`In third place, ${top[2].name}.`);
  if (top[1]) parts.push(`In second place, ${top[1].name}.`);
  parts.push(`And today's quiz champion, with ${top[0].correct} out of ${quizCount}, is ${top[0].name}! Congratulations.`);
  return `Here are the quiz results. ${parts.join(" ")}`;
}

/* ------------------------------ Script check ------------------------------ */

export type Issue = { level: "error" | "warn"; where: string; msg: string };

export function scriptCheck(plan: Plan): Issue[] {
  const out: Issue[] = [];
  const pollSlides = new Set(plan.polls.enabled ? plan.polls.items.map((p) => p.afterSlide) : []);
  const avoid = plan.personality.avoid.split(/[,\n]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const names = plan.audience.mode === "list" ? plan.audience.people.map((p) => p.name.trim().split(/\s+/)[0]).filter((n) => n && n.length > 2) : [];
  const tod = plan.purpose.timeOfDay;
  const wrongTime = tod === "morning" ? /\b(tonight|good evening|this evening)\b/i : tod === "evening" ? /\b(good morning|this morning)\b/i : /\b(tonight|good morning|good evening)\b/i;
  const physical = /\b(hands? up|raise (your|a) hand|stand up|clap|write (this|it|that) down|shout)\b/i;

  const check = (where: string, text: string, slideN: number | null, sourceText: string) => {
    if (!text.trim()) {
      out.push({ level: "error", where, msg: "No script yet." });
      return;
    }
    const lc = text.toLowerCase();
    if (slideN !== null && !pollSlides.has(slideN) && /\b(poll|vote|voting)\b/i.test(text)) out.push({ level: "error", where, msg: "Mentions a poll, but there is no poll on this slide." });
    if (slideN !== null && (!plan.quiz.enabled || !plan.quiz.items.length) && /\bquiz\b/i.test(text)) out.push({ level: "warn", where, msg: "Mentions a quiz, but the quiz is off." });
    for (const w of avoid) if (lc.includes(w)) out.push({ level: "error", where, msg: `Uses a word to avoid: "${w}".` });
    const tm = text.match(wrongTime);
    if (tm) out.push({ level: "error", where, msg: `Says "${tm[0]}" but the session is in the ${tod}.` });
    const ph = text.match(physical);
    if (ph) out.push({ level: "error", where, msg: `Asks the audience to do something physical ("${ph[0]}").` });
    if (slideN !== null) {
      for (const n of names) if (new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)) out.push({ level: "warn", where, msg: `Names a person (${n}) during the slides.` });
      const w = words(text);
      if (w < 15) out.push({ level: "warn", where, msg: `Very short (${w} words).` });
      if (w > 230) out.push({ level: "warn", where, msg: `Long (${w} words, about ${Math.round(w / 2.4)} s).` });
      const src = sourceText.replace(/,/g, "");
      const nums = (text.replace(/,/g, "").match(/\d+(\.\d+)?%?/g) || []).filter((x) => x.replace("%", "").length >= 2);
      const missing = [...new Set(nums)].filter((x) => !src.includes(x.replace("%", "")));
      if (missing.length) out.push({ level: "warn", where, msg: `Numbers not found on the slide or in its notes: ${missing.slice(0, 4).join(", ")}. Check they are true.` });
    }
  };

  check("Opening", plan.script.opening, null, "");
  for (const s of plan.slides) check(`Slide ${s.n}`, plan.script.slides[String(s.n)] || "", s.n, `${s.text} ${s.notes}`);
  check("Closing", plan.script.closing, null, "");

  if (plan.purpose.closingLine.trim()) {
    const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
    if (!norm(plan.script.closing).includes(norm(plan.purpose.closingLine))) out.push({ level: "warn", where: "Closing", msg: "The closing line isn't in the closing script; it will be added at the end, word for word." });
  }
  if (plan.purpose.message.trim()) {
    const key = plan.purpose.message.toLowerCase().match(/[a-z]{5,}/g) || [];
    const hit = key.filter((k) => plan.script.closing.toLowerCase().includes(k)).length;
    if (key.length && hit / key.length < 0.3) out.push({ level: "warn", where: "Closing", msg: "The closing doesn't seem to repeat the ultimate message." });
  }
  if (!plan.slides.length) out.push({ level: "error", where: "Slides", msg: "No slides uploaded." });
  for (const p of plan.polls.enabled ? plan.polls.items : []) {
    if (!plan.slides.some((s) => s.n === p.afterSlide)) out.push({ level: "error", where: "Polls", msg: `Poll "${p.question.slice(0, 40)}" is set after slide ${p.afterSlide}, which doesn't exist.` });
    if (p.options.filter(Boolean).length < 2) out.push({ level: "error", where: "Polls", msg: `Poll "${p.question.slice(0, 40)}" needs at least 2 options.` });
  }
  if (plan.quiz.enabled) {
    if (!plan.quiz.items.length) out.push({ level: "error", where: "Quiz", msg: "The quiz is on but has no questions." });
    plan.quiz.items.forEach((q, i) => {
      if (q.options.filter(Boolean).length < 2 || q.answer < 0 || q.answer >= q.options.length || !q.options[q.answer]) out.push({ level: "error", where: "Quiz", msg: `Question ${i + 1} needs options and a correct answer.` });
    });
  }
  return out;
}
