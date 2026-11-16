"use client";
// Presenter.ai — rehearsal simulator: 12 fake phones join and play along
// (quiz, assessment, polls, commitments, a couple of questions), so the whole
// show can be rehearsed alone. Runs in this browser tab only; "Clear test data" removes it.
import { useRef, useState } from "react";
import { ASSESSMENT, QUIZ, pollByKey, quizClock, type QuizState } from "@/lib/presenter/content";

const BOTS = [
  ["Sim Asha", "chasing interview feedback"],
  ["Sim Ravi", "the monthly attrition report in Excel"],
  ["Sim Meena", "answering the same leave policy questions"],
  ["Sim Joseph", "following up for joining documents"],
  ["Sim Priya", "formatting offer letters"],
  ["Sim Karthik", "scheduling interviews across calendars"],
  ["Sim Fathima", "copy-pasting data into MIS reports"],
  ["Sim Arun", "writing the same welcome email"],
  ["Sim Divya", "chasing attendance corrections"],
  ["Sim Naveen", "updating the hiring tracker"],
  ["Sim Lakshmi", "minuting meetings by hand"],
  ["Sim Rahul", "searching for the latest policy version"],
];
const QUESTIONS = ["Which AI tool should I use for Excel reports?", "Is it safe to use ChatGPT for writing JDs?"];

export default function Simulator({ code }: { code: string }) {
  const [on, setOn] = useState(false);
  const [log, setLog] = useState("");
  const run = useRef(0);
  const done = useRef<Set<string>>(new Set());

  const post = (t: string, body: Record<string, unknown>) =>
    fetch("/api/presenter/hub", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, t, ...body }) }).catch(() => null);
  const tok = (i: number) => `simulatorbot0000000${String(i).padStart(3, "0")}`;
  const once = (k: string) => (done.current.has(k) ? false : (done.current.add(k), true));

  const start = async () => {
    const id = ++run.current;
    setOn(true);
    done.current = new Set();
    for (let i = 0; i < BOTS.length; i++) await post(tok(i), { action: "join", name: BOTS[i][0], intro: BOTS[i][1], remember: false });
    setLog("12 fake phones joined.");
    let asked = 0;
    while (run.current === id) {
      const r = await fetch(`/api/presenter/hub?code=${code}&t=${tok(0)}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
      if (r?.hub) {
        const hub = r.hub as { phase: string; quiz: QuizState | null; poll: string | null; pollReveal: number | null };
        const now = (r.serverNow as number) || Date.now();
        if (hub.phase === "quiz") {
          const c = quizClock(hub.quiz, now);
          if (c.status === "answer" && c.idx >= 0 && c.idx < QUIZ.length)
            for (let i = 0; i < BOTS.length; i++) if (Math.random() < 0.85 && once(`q${c.idx}-${i}`)) post(tok(i), { action: "quiz", idx: c.idx, choice: Math.floor(Math.random() * 4) });
        }
        if (hub.phase === "assessment")
          for (let i = 0; i < BOTS.length; i++)
            for (let k = 0; k < 3; k++) {
              const n = [...done.current].filter((x) => x.startsWith(`a-${i}-`)).length;
              if (n < ASSESSMENT.length && once(`a-${i}-${n}`)) post(tok(i), { action: "assess", idx: n, score: 1 + Math.floor(Math.random() * 4) });
            }
        if (hub.phase === "poll" && hub.poll && hub.pollReveal === null) {
          const p = pollByKey(hub.poll);
          if (p) for (let i = 0; i < BOTS.length; i++) if (Math.random() < 0.5 && once(`p-${hub.poll}-${i}`)) post(tok(i), { action: "poll", key: hub.poll, choice: Math.floor(Math.random() * p.options.length) });
        }
        if (hub.phase === "commit") for (let i = 0; i < BOTS.length; i++) if (Math.random() < 0.3 && once(`c-${i}`)) post(tok(i), { action: "commit", text: `Use AI for ${BOTS[i][1]}` });
        if (hub.phase === "questions" && asked < QUESTIONS.length && Math.random() < 0.2) {
          post(tok(asked + 1), { action: "ask", text: QUESTIONS[asked] });
          asked++;
        }
        setLog(`Playing along · phase: ${hub.phase}${hub.poll && hub.phase === "poll" ? ` (${hub.poll})` : ""}`);
      }
      await new Promise((res) => setTimeout(res, 1500));
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Rehearsal simulator</div>
          <div className="text-xs text-ink-muted">12 fake phones join and play along with every step, so you can rehearse alone. Keep this console visible in its own window (Chrome slows background tabs) and use “Clear test data” afterwards.</div>
        </div>
        <button onClick={() => (on ? ((run.current += 1), setOn(false), setLog("Stopped.")) : start())} className={`rounded-lg px-3 py-2 text-sm ${on ? "bg-red-600 text-white" : "bg-ink text-surface"}`}>
          {on ? "Stop simulator" : "Start 12 fake phones"}
        </button>
      </div>
      {log && <div className="mt-2 text-xs text-ink-muted">{log}</div>}
    </div>
  );
}
