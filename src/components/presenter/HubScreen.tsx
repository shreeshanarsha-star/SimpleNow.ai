"use client";
// Presenter.ai — the TV view of the audience hub: lobby QR, quiz, polls,
// assessment progress, questions, commitments and the finale.
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { ASSESSMENT, QUIZ, pollByKey, quizClock, type HubState } from "@/lib/presenter/content";

export type Board = {
  attendees: Array<{ name: string; intro: string | null }>;
  quiz: { perQuestion: Array<{ answered: number; correct: number; counts: number[] }>; leaderboard: Array<{ name: string; correct: number; ms: number }>; players: number };
  assessment: { started: number; completed: number; levelCounts: Array<{ name: string; line: string; count: number }> };
  polls: Record<string, number[]>;
  questions: Array<{ id: string; text: string; votes: number; status: string }>;
  commitments: string[];
  serverNow: number;
};

function useQr(text: string) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    if (!text) return;
    QRCode.toDataURL(text, { margin: 1, width: 600, color: { dark: "#000000", light: "#ffffff" } })
      .then(setSrc)
      .catch(() => setSrc(""));
  }, [text]);
  return src;
}

const OPTION_COLORS = ["bg-orange-600", "bg-sky-600", "bg-emerald-600", "bg-fuchsia-600", "bg-amber-500"];

export default function HubScreen({
  hub,
  board,
  quizKey,
  code,
  title,
  serverNow,
  buildText = "",
}: {
  hub: HubState;
  board: Board | null;
  quizKey: number[];
  code: string;
  title: string;
  serverNow: number;
  buildText?: string;
}) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const joinUrl = `${origin}/p/${code}`;
  const qr = useQr(joinUrl);
  const flyerQr = useQr(hub.flyerUrl || "");
  const people = board?.attendees.length || 0;

  const joinBox = (small?: boolean) => (
    <div className={`flex flex-col items-center ${small ? "gap-1" : "gap-3"}`}>
      {qr && <img src={qr} alt="Join QR" className={`rounded-2xl bg-white p-2 ${small ? "w-[11vw]" : "w-[22vw]"}`} />}
      <div className={`${small ? "text-[1vw]" : "text-[1.6vw]"} text-white/70`}>
        {origin.replace(/^https?:\/\//, "")}/p/<b className="text-white">{code}</b>
      </div>
    </div>
  );

  /* ------------------------------ lobby ------------------------------ */
  if (hub.phase === "lobby")
    return (
      <div className="flex h-full items-center gap-[4vw] px-[3vw]">
        <div className="flex-1">
          <div className="text-[1.3vw] uppercase tracking-[0.3em] text-orange-400">Tonight</div>
          <div className="mt-2 text-[5vw] font-black leading-none">{title}</div>
          <div className="mt-4 text-[1.8vw] text-white/60">Scan to join. Quiz, polls and questions happen on your phone.</div>
          <div className="mt-[3vw] flex flex-wrap gap-2">
            {board?.attendees.map((a) => (
              <span key={a.name} className="rounded-full bg-white/10 px-4 py-2 text-[1.2vw]">{a.name}</span>
            ))}
          </div>
          <div className="mt-3 text-[1.1vw] text-white/40">{people} joined</div>
        </div>
        {joinBox()}
      </div>
    );

  /* ------------------------------ quiz ------------------------------ */
  if (hub.phase === "quiz") {
    const clock = quizClock(hub.quiz, serverNow);
    if (clock.status === "off")
      return (
        <Center>
          <div className="text-[1.4vw] uppercase tracking-[0.3em] text-orange-400">Act 3 · The Challenge</div>
          <div className="text-[5vw] font-black">AI Quickfire</div>
          <div className="text-[1.8vw] text-white/60">30 questions · 7 seconds each · no going back</div>
          {joinBox(true)}
        </Center>
      );
    if (clock.status === "leadin")
      return (
        <Center>
          <div className="text-[1.8vw] text-white/60">Phones ready…</div>
          <div className="text-[14vw] font-black leading-none text-orange-500">{Math.ceil(clock.msLeft / 1000)}</div>
        </Center>
      );
    if (clock.status === "done")
      return (
        <Center>
          <div className="text-[5vw] font-black">That&apos;s the quiz</div>
          <div className="text-[2vw] text-white/60">Scores are locked. The winner is revealed at the end. Stay sharp.</div>
        </Center>
      );
    const q = QUIZ[clock.idx];
    const pq = board?.quiz.perQuestion[clock.idx];
    const reveal = clock.status === "reveal";
    const correct = quizKey[clock.idx];
    return (
      <div className="flex h-full flex-col px-[3vw] py-[2vw]">
        <div className="flex items-center justify-between text-[1.3vw] text-white/60">
          <span className="uppercase tracking-[0.2em]">Question {clock.idx + 1} of {QUIZ.length} · {q.section}</span>
          <span>{pq?.answered || 0} of {people} answered</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-orange-500 transition-[width] duration-200" style={{ width: reveal ? "0%" : `${(clock.msLeft / 7000) * 100}%` }} />
        </div>
        <div className="mt-[2.5vw] text-[3.6vw] font-bold leading-tight">{q.q}</div>
        <div className="mt-[2.5vw] grid flex-1 grid-cols-2 gap-[1.5vw]">
          {q.options.map((o, i) => (
            <div
              key={i}
              className={`flex items-center gap-[1.5vw] rounded-3xl px-[2vw] text-[2.2vw] font-semibold transition-all duration-300 ${
                reveal ? (i === correct ? "bg-emerald-600 scale-[1.02]" : "bg-white/5 text-white/30") : OPTION_COLORS[i]
              }`}
            >
              <span className="text-[2.6vw] font-black opacity-80">{"ABCD"[i]}</span>
              {o}
            </div>
          ))}
        </div>
        {!reveal && <div className="mt-3 text-center text-[2vw] font-bold text-orange-400">{Math.ceil(clock.msLeft / 1000)}</div>}
      </div>
    );
  }

  /* ------------------------------ assessment ------------------------------ */
  if (hub.phase === "assessment")
    return (
      <div className="flex h-full items-center gap-[4vw] px-[3vw]">
        <div className="flex-1">
          <div className="text-[1.3vw] uppercase tracking-[0.3em] text-orange-400">Act 4 · The Mirror</div>
          <div className="mt-2 text-[4.5vw] font-black leading-none">How do you use AI today?</div>
          <ul className="mt-6 space-y-2 text-[1.6vw] text-white/70">
            <li>{ASSESSMENT.length} questions on your phone, about 5 minutes</li>
            <li>Pick the highest statement that is true for you today</li>
            <li>Not a test, not a performance review. Honest beats impressive</li>
            <li>Your level is revealed at the end; individual scores stay private</li>
          </ul>
          <div className="mt-[3vw] text-[2.4vw] font-bold">
            {board?.assessment.completed || 0} <span className="text-white/50">of {people} done</span>
          </div>
        </div>
        {joinBox()}
      </div>
    );

  /* ------------------------------ poll ------------------------------ */
  if (hub.phase === "poll") {
    const poll = pollByKey(hub.poll);
    const counts = (poll && board?.polls[poll.key]) || [];
    const total = counts.reduce((a, b) => a + b, 0);
    return (
      <div className="flex h-full flex-col px-[3vw] py-[2.5vw]">
        <div className="text-[1.3vw] uppercase tracking-[0.3em] text-orange-400">{poll?.label}</div>
        <div className="mt-2 text-[3.4vw] font-bold leading-tight">{poll?.q}</div>
        <div className="mt-[3vw] flex-1 space-y-[1.5vw]">
          {poll?.options.map((o, i) => {
            const pct = total ? Math.round((counts[i] / total) * 100) : 0;
            return (
              <div key={i}>
                <div className="mb-1 flex justify-between text-[1.8vw]">
                  <span>{o}</span>
                  <span className="text-white/60">{counts[i] || 0} · {pct}%</span>
                </div>
                <div className="h-[2.4vw] overflow-hidden rounded-full bg-white/10">
                  <div className={`h-full ${OPTION_COLORS[i % OPTION_COLORS.length]} transition-[width] duration-700`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-end justify-between">
          <div className="text-[1.4vw] text-white/50">{total} votes</div>
          {joinBox(true)}
        </div>
      </div>
    );
  }

  /* ------------------------------ questions ------------------------------ */
  if (hub.phase === "questions") {
    const open = (board?.questions || []).filter((q) => q.status !== "hidden").slice(0, 6);
    return (
      <div className="flex h-full flex-col px-[3vw] py-[2.5vw]">
        <div className="text-[1.3vw] uppercase tracking-[0.3em] text-orange-400">Act 8 · Ask anything</div>
        <div className="mt-2 text-[3.6vw] font-black">Your questions</div>
        <div className="mt-[2vw] flex-1 space-y-[1vw]">
          {open.length === 0 && <div className="text-[1.8vw] text-white/50">Ask on your phone: no question is too basic.</div>}
          {open.map((q) => (
            <div key={q.id} className={`rounded-2xl px-[1.6vw] py-[1vw] text-[1.6vw] ${q.status === "answered" ? "bg-white/5 text-white/40 line-through" : "bg-white/10"}`}>
              {q.text}
            </div>
          ))}
        </div>
        <div className="self-end">{joinBox(true)}</div>
      </div>
    );
  }

  /* ------------------------------ live build ------------------------------ */
  if (hub.phase === "build") {
    const b = hub.flyerBuild;
    const secs = b ? Math.max(0, Math.round(((b.finishedAt || serverNow) - b.startedAt) / 1000)) : 0;
    const tail = buildText.slice(-2600);
    const lines = buildText.split("\n").length;
    return (
      <div className="flex h-full flex-col px-[3vw] py-[2vw]">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[1.3vw] uppercase tracking-[0.3em] text-orange-400">Live: we build an app</div>
            <div className="mt-1 text-[3vw] font-black leading-none">Natural Remedies Flyer Studio</div>
          </div>
          <div className="text-right">
            <div className="text-[3vw] font-black tabular-nums">{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}</div>
            <div className="text-[1.1vw] text-white/50">{b?.status === "ready" ? "Built ✓" : b?.status === "failed" ? "Retrying…" : `${lines} lines written`}</div>
          </div>
        </div>
        {b && (
          <div className="mt-[1.2vw] flex flex-wrap gap-2 text-[1.1vw]">
            {[b.inputs.name, b.inputs.date, b.inputs.venue, ...b.inputs.highlights].map((t, i) => (
              <span key={i} className="rounded-full bg-white/10 px-3 py-1">{t}</span>
            ))}
          </div>
        )}
        <pre className="mt-[1.2vw] flex-1 overflow-hidden whitespace-pre-wrap break-all rounded-2xl bg-[#0b1220] p-[1.2vw] font-mono text-[0.85vw] leading-snug text-emerald-300/90">
          {tail || "Sending the instruction to the AI…"}
        </pre>
      </div>
    );
  }

  /* ------------------------------ flyer ------------------------------ */
  if (hub.phase === "flyer")
    return (
      <Center>
        <div className="text-[1.4vw] uppercase tracking-[0.3em] text-orange-400">App reveal</div>
        <div className="text-[4.5vw] font-black">Your app is ready</div>
        {hub.flyerUrl && flyerQr ? (
          <>
            <img src={flyerQr} alt="Flyer app QR" className="w-[20vw] rounded-2xl bg-white p-2" />
            <div className="text-[1.6vw] text-white/70">Scan, try it, share a flyer</div>
          </>
        ) : (
          <div className="text-[2vw] text-white/60">Opening on your phones…</div>
        )}
      </Center>
    );

  /* ------------------------------ commit ------------------------------ */
  if (hub.phase === "commit")
    return (
      <div className="flex h-full gap-[3vw] px-[3vw] py-[2.5vw]">
        <div className="flex-1">
          <div className="text-[1.3vw] uppercase tracking-[0.3em] text-orange-400">Our commitment</div>
          <div className="mt-[2vw] space-y-[1vw] text-[2.6vw] font-bold leading-snug">
            <div>I will learn AI responsibly.</div>
            <div>I will check the facts.</div>
            <div>I will use AI only where it makes me more productive and gives real ROI.</div>
          </div>
          <div className="mt-[2vw] text-[1.6vw] text-white/60">In the next 30 days, my one task I&apos;ll never do manually again: write it on your phone.</div>
        </div>
        <div className="w-[34%] space-y-2 overflow-hidden">
          {(board?.commitments || []).slice(-8).map((c, i) => (
            <div key={i} className="rounded-2xl bg-white/10 px-4 py-3 text-[1.3vw]">“{c}”</div>
          ))}
          <div className="text-[1.2vw] text-white/40">{board?.commitments.length || 0} commitments</div>
        </div>
      </div>
    );

  /* ------------------------------ finale ------------------------------ */
  if (hub.phase === "finale") {
    const step = hub.finaleStep || 0;
    const lb = board?.quiz.leaderboard || [];
    if (step <= 3) {
      const slots = [
        { place: "3rd", i: 2, show: step >= 1, h: "h-[14vw]" },
        { place: "Winner", i: 0, show: step >= 3, h: "h-[22vw]" },
        { place: "2nd", i: 1, show: step >= 2, h: "h-[18vw]" },
      ];
      return (
        <div className="flex h-full flex-col items-center px-[3vw] py-[2vw]">
          <div className="text-[1.3vw] uppercase tracking-[0.3em] text-orange-400">Finale · Quiz winners</div>
          <div className="mt-1 text-[3.6vw] font-black">And the quiz champions are…</div>
          <div className="mt-auto flex w-full items-end justify-center gap-[2vw]">
            {slots.map((s) => {
              const p = lb[s.i];
              return (
                <div key={s.place} className="flex w-[22vw] flex-col items-center">
                  <div className={`mb-3 text-center transition-all duration-700 ${s.show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
                    <div className="text-[2.4vw] font-black">{p?.name || "—"}</div>
                    <div className="text-[1.4vw] text-white/60">{p ? `${p.correct} / ${QUIZ.length}` : ""}</div>
                  </div>
                  <div className={`${s.h} w-full rounded-t-3xl ${s.place === "Winner" ? "bg-orange-600" : "bg-white/15"} flex items-start justify-center pt-4 text-[2vw] font-bold`}>{s.place}</div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    if (step === 4) {
      const lc = board?.assessment.levelCounts || [];
      const max = Math.max(1, ...lc.map((l) => l.count));
      return (
        <div className="flex h-full flex-col px-[3vw] py-[2.5vw]">
          <div className="text-[1.3vw] uppercase tracking-[0.3em] text-orange-400">Finale · Self-assessment</div>
          <div className="mt-1 text-[3.6vw] font-black">Where our team stands today</div>
          <div className="mt-[3vw] grid flex-1 grid-cols-4 items-end gap-[2vw]">
            {lc.map((l, i) => (
              <div key={l.name} className="flex h-full flex-col justify-end text-center">
                <div className="text-[3vw] font-black">{l.count}</div>
                <div className="mx-auto w-[70%] rounded-t-2xl bg-orange-600 transition-all duration-700" style={{ height: `${(l.count / max) * 60}%`, minHeight: "0.6vw", opacity: 0.55 + i * 0.15 }} />
                <div className="mt-3 text-[1.8vw] font-bold">{l.name}</div>
                <div className="text-[1.1vw] text-white/50">{l.line}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 text-center text-[1.5vw] text-white/60">Our goal: everyone moves up one level in 90 days. Your badge is on your phone; individual scores stay private.</div>
        </div>
      );
    }
    // step 5: before vs after
    const before = board?.polls["before"] || [];
    const after = board?.polls["after"] || [];
    const poll = pollByKey("before");
    const tb = before.reduce((a, b) => a + b, 0) || 1;
    const ta = after.reduce((a, b) => a + b, 0) || 1;
    return (
      <div className="flex h-full flex-col px-[3vw] py-[2.5vw]">
        <div className="text-[1.3vw] uppercase tracking-[0.3em] text-orange-400">Before vs after</div>
        <div className="mt-1 text-[3vw] font-black">{poll?.q}</div>
        <div className="mt-[3vw] space-y-[1.6vw]">
          {poll?.options.map((o, i) => (
            <div key={o}>
              <div className="mb-1 text-[1.6vw]">{o}</div>
              <div className="flex items-center gap-3">
                <div className="h-[1.6vw] rounded-full bg-white/30 transition-all duration-700" style={{ width: `${(before[i] / tb) * 45}%` }} />
                <span className="text-[1.2vw] text-white/50">before {before[i] || 0}</span>
              </div>
              <div className="mt-1 flex items-center gap-3">
                <div className="h-[1.6vw] rounded-full bg-orange-600 transition-all duration-700" style={{ width: `${(after[i] / ta) * 45}%` }} />
                <span className="text-[1.2vw] text-white/70">after {after[i] || 0}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ------------------------------ closed ------------------------------ */
  return (
    <Center>
      <div className="text-[5vw] font-black">Thank you</div>
      <div className="text-[1.8vw] text-white/60">Learn. Question. Experiment. Build. Apply.</div>
      <div className="text-[2.2vw] font-bold text-orange-400">AI, HI or notepad: what matters is ROI.</div>
    </Center>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center gap-[1.5vw] text-center">{children}</div>;
}
