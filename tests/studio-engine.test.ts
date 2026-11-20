// Run: node --test tests/  (Node 22.18+ strips TypeScript types natively)
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRunOfShow, closingText, pollResultLine, pollTally, quizRanking, reduce, scriptCheck, shouldAutoAdvance, winnersLine } from "../src/lib/studio/engine.ts";
import { emptyLive, emptyPlan, normalizePlan, type Plan } from "../src/lib/studio/types.ts";

function plan(): Plan {
  const p = emptyPlan();
  p.slides = Array.from({ length: 8 }, (_, i) => ({ n: i + 1, text: `Slide ${i + 1} text. 80% of teams use AI.`, notes: "" }));
  for (const s of p.slides) p.script.slides[String(s.n)] = `This is the narration for slide ${s.n}, explained simply for everyone in the room so it is easy to follow and remember.`;
  p.script.opening = "Good morning, everyone. Welcome.";
  p.script.closing = "Thank you. Remember: check the facts, the value and the ROI.";
  p.purpose.closingLine = "Use whatever gets you there.";
  p.polls = { enabled: true, items: [{ key: "p1", afterSlide: 6, question: "Which is best?", options: ["A", "B", "C"], answer: 2 }] };
  p.quiz = { enabled: true, placement: "after", seconds: 20, items: [{ q: "Q1", options: ["x", "y"], answer: 0 }, { q: "Q2", options: ["x", "y"], answer: 1 }] };
  return p;
}

test("AT4: run of show order — opening, slides with poll after slide 6, quiz, Q&A, results, close", () => {
  const kinds = buildRunOfShow(plan()).map((s) => (s.kind === "slide" ? `s${s.slide}` : s.kind));
  assert.deepEqual(kinds, ["opening", "s1", "s2", "s3", "s4", "s5", "s6", "poll", "poll_result", "s7", "s8", "quiz_intro", "quiz_q", "quiz_q", "quiz_end", "qa", "results", "close"]);
});

test("quiz before the slides when placement is before", () => {
  const p = plan();
  p.quiz.placement = "before";
  const kinds = buildRunOfShow(p).map((s) => s.kind);
  assert.equal(kinds.indexOf("quiz_intro"), 1);
  assert.ok(kinds.indexOf("quiz_end") < kinds.indexOf("slide"));
});

test("everything off: opening, slides, close only (no results step)", () => {
  const p = plan();
  p.polls.enabled = false;
  p.quiz.enabled = false;
  p.qa.enabled = false;
  const kinds = buildRunOfShow(p).map((s) => s.kind);
  assert.equal(kinds.filter((k) => k === "slide").length, 8);
  assert.ok(!kinds.includes("results") && !kinds.includes("poll") && !kinds.includes("qa"));
  assert.equal(kinds.at(-1), "close");
});

test("AT2: closing always ends with the exact closing line", () => {
  const c = closingText(plan());
  assert.ok(c.endsWith("Use whatever gets you there."));
  const p = plan();
  p.script.closing = "Thanks. Use whatever gets you there.";
  assert.equal(closingText(p), "Thanks. Use whatever gets you there.");
});

test("AT6: Next moves exactly one step; never skips a block", () => {
  const steps = buildRunOfShow(plan());
  let l = reduce(emptyLive(), { type: "start" }, steps.length, 1);
  for (let i = 1; i < steps.length; i++) {
    const before = l.step;
    l = reduce(l, { type: "next" }, steps.length, i);
    assert.equal(l.step, before + 1);
  }
  l = reduce(l, { type: "next" }, steps.length, 99);
  assert.equal(l.ended, true);
  assert.equal(l.step, steps.length - 1);
});

test("AT7: Hold then Resume repeats the current step from the start", () => {
  let l = reduce(emptyLive(), { type: "start" }, 10, 1);
  l = reduce(l, { type: "next" }, 10, 2);
  const take = l.take;
  l = reduce(l, { type: "hold" }, 10, 3);
  assert.equal(l.held, true);
  assert.equal(l.take, take);
  l = reduce(l, { type: "resume" }, 10, 4);
  assert.equal(l.held, false);
  assert.equal(l.step, 1);
  assert.equal(l.take, take + 1);
});

test("every change bumps the version; prev/goto clamp", () => {
  let l = reduce(emptyLive(), { type: "prev" }, 5, 1);
  assert.equal(l.step, 0);
  assert.equal(l.v, 1);
  l = reduce(l, { type: "goto", step: 99 }, 5, 2);
  assert.equal(l.step, 4);
  assert.equal(l.v, 2);
});

test("'spoken' for an old step is ignored", () => {
  let l = reduce(emptyLive(), { type: "start" }, 5, 1);
  l = reduce(l, { type: "next" }, 5, 2);
  const same = reduce(l, { type: "spoken", step: 0 }, 5, 3);
  assert.equal(same, l);
  assert.equal(reduce(l, { type: "spoken", step: 1 }, 5, 3).spoken, 1);
});

test("AT5: Manual never auto-advances; Assisted only slide→slide", () => {
  const steps = buildRunOfShow(plan());
  assert.equal(steps.some((_, i) => shouldAutoAdvance(steps, i, "manual")), false);
  const s6 = steps.findIndex((s) => s.slide === 6 && s.kind === "slide");
  assert.equal(shouldAutoAdvance(steps, s6, "assisted"), false, "slide 6 is followed by a poll: wait");
  assert.equal(shouldAutoAdvance(steps, s6 - 1, "assisted"), true);
});

test("AT3: script check flags a poll mention on a non-poll slide, not on the poll slide", () => {
  const p = plan();
  p.script.slides["3"] += " A quick poll is coming up.";
  p.script.slides["6"] += " A quick poll is coming up.";
  const issues = scriptCheck(p).filter((i) => /poll/i.test(i.msg));
  assert.deepEqual(issues.map((i) => i.where), ["Slide 3"]);
});

test("script check: wrong time of day, physical action, banned words, invented numbers", () => {
  const p = plan();
  p.personality.avoid = "coffee";
  p.script.slides["1"] += " Tonight, raise your hand if you like coffee. 97% agree.";
  const msgs = scriptCheck(p).filter((i) => i.where === "Slide 1").map((i) => i.msg).join(" | ");
  assert.match(msgs, /tonight/i);
  assert.match(msgs, /physical/);
  assert.match(msgs, /coffee/);
  assert.match(msgs, /97%/);
  assert.doesNotMatch(msgs, /80%/);
});

test("AT9: quiz ties broken by lower total time on correct answers; first answer counts", () => {
  const r = quizRanking(
    [
      { person: "a", name: "Asha", idx: 0, choice: 0, ms: 5000 },
      { person: "a", name: "Asha", idx: 1, choice: 1, ms: 5000 },
      { person: "b", name: "Bala", idx: 0, choice: 0, ms: 2000 },
      { person: "b", name: "Bala", idx: 1, choice: 1, ms: 3000 },
      { person: "b", name: "Bala", idx: 1, choice: 0, ms: 100 },
      { person: "c", name: "Chitra", idx: 0, choice: 1, ms: 100 },
    ],
    [0, 1]
  );
  assert.deepEqual(r.map((x) => x.name), ["Bala", "Asha", "Chitra"]);
  assert.match(winnersLine(r, 2), /second place, Asha.*champion.*2 out of 2, is Bala/);
  assert.doesNotMatch(winnersLine(r, 2), /Chitra/, "nobody with zero correct is announced");
});

test("poll tally and result line", () => {
  const poll = plan().polls.items[0];
  const c = pollTally(poll, [2, 2, 0, 9, -1]);
  assert.deepEqual(c, [1, 0, 2]);
  assert.match(pollResultLine(poll, c), /Most of you chose "C".*right answer/);
  assert.match(pollResultLine(poll, [0, 0, 0]), /No votes/);
});

test("normalizePlan fills missing fields", () => {
  const p = normalizePlan({ purpose: { message: "x" } as never });
  assert.equal(p.purpose.message, "x");
  assert.equal(p.mode, "manual");
  assert.deepEqual(p.polls.items, []);
});
