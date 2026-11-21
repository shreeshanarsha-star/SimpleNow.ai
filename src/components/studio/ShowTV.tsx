"use client";
// Presenter Studio — the TV screen. The ONLY player: it speaks the step the
// live state points at, reports when it's done, and (Assisted mode) moves on
// between slides. Everything else (remote, phones) just changes the live state.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { Presenter } from "@/lib/studio/avatar";
import { api, drawPage, jsonInit, openPdfData } from "@/lib/studio/client";
import { buildRunOfShow, pollResultLine, sanitizeCues, shouldAutoAdvance, splitBeats, stripCues, winnersLine } from "@/lib/studio/engine";
import type { Action, Live, Plan } from "@/lib/studio/types";

type Results = {
  people: Array<{ id: string; name: string }>;
  polls: Record<string, number[]>;
  ranking: Array<{ person: string; name: string; correct: number; ms: number; answered: number }>;
  quizCounts: Record<string, number>;
  questions: Array<{ id: number; text: string; name: string; status: string; draft: string }>;
};
type Data = { id: string; title: string; code: string; status: string; plan: Plan; live: Live; results: Results; serverNow: number };

export default function ShowTV({ id }: { id: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [armed, setArmed] = useState(false);
  const [avatar, setAvatar] = useState<{ s: string; note?: string }>({ s: "off" });
  const [slot, setSlot] = useState(0);
  const [caption, setCaption] = useState("");
  const [qr, setQr] = useState("");
  const [doc, setDoc] = useState<unknown>(null);
  const [now, setNow] = useState(Date.now());
  const pres = useRef<Presenter | null>(null);
  const latest = useRef<Data | null>(null);
  const offset = useRef(0);
  const spokenKey = useRef("");
  const lineBeats = useRef<string[]>([]);
  const beatAt = useRef<{ step: number; beat: number }>({ step: -1, beat: 0 });
  const heldBeat = useRef<{ step: number; beat: number } | null>(null);
  const [metrics, setMetrics] = useState<{ sayLatencyMs: number | null; lineLatencyMs: number | null; session: number }>({ sayLatencyMs: null, lineLatencyMs: null, session: 0 });
  const [showMetrics, setShowMetrics] = useState(false);
  const sayId = useRef<number | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const t0 = Date.now();
      const x = await api<Data>(`/api/studio/live/${id}`);
      offset.current = x.serverNow - (t0 + Date.now()) / 2;
      latest.current = x;
      setD(x);
      setErr("");
      return x;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Connection problem, retrying…");
      return null;
    }
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 700);
    const c = setInterval(() => setNow(Date.now() + offset.current), 250);
    return () => {
      clearInterval(t);
      clearInterval(c);
    };
  }, [load]);

  // QR + deck once.
  useEffect(() => {
    if (!d?.code) return;
    QRCode.toDataURL(`${window.location.origin}/join/${d.code}`, { margin: 1, width: 480 }).then(setQr).catch(() => {});
  }, [d?.code]);
  useEffect(() => {
    (async () => {
      try {
        const { url } = await api<{ url: string | null }>(`/api/studio/shows/${id}/deck`);
        if (url) setDoc(await openPdfData(url));
      } catch {}
    })();
  }, [id]);

  const steps = useMemo(() => (d ? buildRunOfShow(d.plan) : []), [d?.plan]); // eslint-disable-line react-hooks/exhaustive-deps
  const live = d?.live;
  const step = live?.started ? steps[live.step] : null;

  // Draw the current slide.
  useEffect(() => {
    if (!doc || !canvas.current || !stage.current || !step?.slide) return;
    const r = stage.current.getBoundingClientRect();
    drawPage(doc, step.slide, canvas.current, r.width, r.height).catch(() => {});
  }, [doc, step?.slide, armed]);

  const command = useCallback(async (action: Action, v?: number) => {
    try {
      await api(`/api/studio/live/${id}`, jsonInit("POST", { action, v: v ?? null }));
    } catch {}
    load();
  }, [id, load]);

  /** What to say for a step (poll/quiz results are worked out from the latest answers). */
  const lineFor = (x: Data, idx: number) => {
    const s = buildRunOfShow(x.plan)[idx];
    if (!s) return "";
    if (s.kind === "poll_result" && s.pollKey) {
      const poll = x.plan.polls.items.find((p) => p.key === s.pollKey);
      return poll ? pollResultLine(poll, x.results?.polls[poll.key] || poll.options.map(() => 0)) : "";
    }
    if (s.kind === "results") {
      const w = winnersLine(x.results?.ranking || [], x.plan.quiz.items.length);
      return w || "Here's how the room voted today.";
    }
    return s.say;
  };

  /** Show a line as captions beat by beat (cues never shown). */
  const showLine = (text: string) => {
    lineBeats.current = splitBeats(sanitizeCues(text));
    setCaption(lineBeats.current[0] ? stripCues(lineBeats.current[0]) : "");
  };

  // The player: whenever the step or its "take" changes, speak it. Resume after Hold continues from the held beat.
  useEffect(() => {
    if (!armed || !d || !live || !pres.current) return;
    const p = pres.current;
    if (live.held) {
      if (beatAt.current.step === live.step) heldBeat.current = { ...beatAt.current };
      p.stop();
      setCaption("");
      return;
    }
    if (!live.started || live.ended) return;
    const key = `${live.step}:${live.take}`;
    if (spokenKey.current === key) return;
    spokenKey.current = key;
    const stepNo = live.step;
    const from = heldBeat.current && heldBeat.current.step === stepNo ? heldBeat.current.beat : 0;
    heldBeat.current = null;
    // Stop the old line at once; only result steps wait for fresh answer counts.
    p.stop();
    setCaption("");
    const kind = steps[stepNo]?.kind;
    (async () => {
      const fresh = kind === "poll_result" || kind === "results" ? (await load()) || d : d;
      if ((latest.current?.live.step ?? fresh.live.step) !== stepNo || fresh.live.held) return;
      const text = lineFor(fresh, stepNo);
      showLine(text);
      beatAt.current = { step: stepNo, beat: from };
      const r = await p.speak(text, from);
      setMetrics((m) => ({ ...m, lineLatencyMs: p.lastLatencyMs }));
      const cur = latest.current;
      if (!r.completed || !cur || cur.live.step !== stepNo || `${cur.live.step}:${cur.live.take}` !== key || cur.live.held) return;
      setCaption("");
      await command({ type: "spoken", step: stepNo });
      const after = latest.current;
      if (after && after.live.step === stepNo && !after.live.held && shouldAutoAdvance(buildRunOfShow(after.plan), stepNo, after.plan.mode)) {
        setTimeout(() => {
          const z = latest.current;
          if (z && z.live.step === stepNo && !z.live.held) command({ type: "next" }, z.live.v);
        }, 900);
      }
    })();
  }, [armed, live?.step, live?.take, live?.held, live?.started, live?.ended]); // eslint-disable-line react-hooks/exhaustive-deps

  // Operator "say this" lines (approved Q&A answers etc.), streamed in beats: first words in about a second.
  useEffect(() => {
    if (!armed || !live?.say || !pres.current) return;
    if (sayId.current === live.say.id) return;
    const first = sayId.current === null;
    sayId.current = live.say.id;
    if (first && Date.now() - (live.stepAt || 0) > 60_000) return; // don't replay an old line after a page reload
    const text = live.say.text;
    const at = live.say.at;
    const p = pres.current;
    showLine(text);
    beatAt.current = { step: -2, beat: 0 };
    p.speak(text).then(() => setCaption(""));
    if (at) {
      // Measure when the first word arrives (lastLatencyMs is set by then).
      const started = Date.now();
      const poll = setInterval(() => {
        if (p.lastLatencyMs !== null && Date.now() - started >= p.lastLatencyMs) {
          clearInterval(poll);
          const firstWordAt = started + p.lastLatencyMs + offset.current;
          setMetrics((m) => ({ ...m, sayLatencyMs: Math.max(0, Math.round(firstWordAt - at)) }));
        }
        if (Date.now() - started > 15000) clearInterval(poll);
      }, 100);
    }
  }, [armed, live?.say?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Metrics for testing (press D on the TV): approve → first word, line start latency, session age.
  useEffect(() => {
    const t = setInterval(() => setMetrics((m) => ({ ...m, session: pres.current?.sessionAge() || 0 })), 2000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    (window as unknown as { __studioMetrics?: unknown }).__studioMetrics = { ...metrics, avatar: avatar.s, slot };
  }, [metrics, avatar.s, slot]);

  // Assisted mode: a quiz question moves on by itself when its time is up.
  useEffect(() => {
    if (!armed || !d || !live || !step || step.kind !== "quiz_q" || d.plan.mode !== "assisted" || live.held) return;
    const left = live.stepAt + d.plan.quiz.seconds * 1000 + 3500 - (Date.now() + offset.current);
    const t = setTimeout(() => {
      const z = latest.current;
      if (z && z.live.step === live.step && !z.live.held) command({ type: "next" }, z.live.v);
    }, Math.max(500, left));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed, live?.step, live?.held, step?.kind]);

  // Report avatar status to the remote.
  useEffect(() => {
    if (armed && (avatar.s === "ok" || avatar.s === "voice" || avatar.s === "starting")) command({ type: "avatar", status: avatar.s as Live["avatar"] });
  }, [armed, avatar.s]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard: → / Space = next, ← = previous, H = hold/resume.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const z = latest.current;
      if (!z || !armed) return;
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") command({ type: "next" }, z.live.v);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") command({ type: "prev" }, z.live.v);
      else if (e.key.toLowerCase() === "h") command({ type: z.live.held ? "resume" : "hold" }, z.live.v);
      else if (e.key.toLowerCase() === "f") document.documentElement.requestFullscreen?.().catch(() => {});
      else if (e.key.toLowerCase() === "d") setShowMetrics((x) => !x);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [armed, command]);

  const arm = async () => {
    setArmed(true);
    document.documentElement.requestFullscreen?.().catch(() => {});
    try {
      window.speechSynthesis?.getVoices();
    } catch {}
    const plan = latest.current?.plan;
    const p = new Presenter({
      videoId: (s) => `studio-video-${s}`,
      onStatus: (s, note) => setAvatar({ s, note }),
      onSlot: setSlot,
      onBeat: (beat) => {
        beatAt.current = { step: beatAt.current.step, beat };
        const b = lineBeats.current[beat];
        if (b) setCaption(stripCues(b));
      },
      token: async () => {
        const r = await api<{ sessionToken: string; level: string }>("/api/studio/anam-token", jsonInit("POST", { showId: id }));
        (window as unknown as { __studioTokenLevel?: string }).__studioTokenLevel = r.level;
        return r.sessionToken;
      },
      voiceOnly: plan?.presenter.kind === "voice",
    });
    pres.current = p;
    await p.start();
  };
  useEffect(() => () => void pres.current?.close(), []);

  if (!d) return <div className="flex h-screen items-center justify-center bg-black text-white/70">{err || "Loading…"}</div>;

  const joinUrl = typeof window !== "undefined" ? `${window.location.host}/join/${d.code}` : "";
  const res = d.results;
  const showVideo = d.plan.presenter.kind !== "voice";
  const fullStage = !step || !step.slide;

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0b0d12] text-white">
      {!armed && (
        <button onClick={arm} className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/85 text-2xl">
          <span className="rounded-2xl bg-white px-8 py-4 font-semibold text-black">Click to start</span>
          <span className="text-sm text-white/60">Starts the sound and the presenter. Keys: → next · ← back · H hold · F full screen</span>
        </button>
      )}

      <div className="flex h-full">
        {/* Main stage */}
        <div ref={stage} className="relative flex flex-1 items-center justify-center p-6">
          {step?.slide && <canvas ref={canvas} className="max-h-full max-w-full rounded-lg shadow-2xl" />}

          {!live?.started && (
            <div className="text-center">
              <div className="text-5xl font-bold">{d.title}</div>
              <div className="mt-4 text-xl text-white/70">Join on your phone: scan the code</div>
              {qr && <img src={qr} alt="QR code to join" className="mx-auto mt-6 h-72 w-72 rounded-2xl bg-white p-3" />}
              <div className="mt-4 text-2xl">
                {joinUrl} · code <b className="tracking-widest">{d.code}</b>
              </div>
              <div className="mt-2 text-lg text-white/60">{res?.people.length || 0} joined</div>
            </div>
          )}

          {step && (step.kind === "poll" || step.kind === "poll_result") && (
            <PollView plan={d.plan} pollKey={step.pollKey!} counts={res?.polls[step.pollKey!]} reveal={step.kind === "poll_result"} />
          )}

          {step && step.kind === "quiz_q" && step.quizIdx !== undefined && <QuizView plan={d.plan} idx={step.quizIdx} stepAt={live!.stepAt} now={now} answered={res?.quizCounts[String(step.quizIdx)] || 0} joined={res?.people.length || 0} />}

          {step && (step.kind === "quiz_intro" || step.kind === "quiz_end") && (
            <div className="text-center">
              <div className="text-6xl font-bold">{step.kind === "quiz_intro" ? "Quiz time" : "Quiz complete"}</div>
              <div className="mt-4 text-2xl text-white/70">{step.kind === "quiz_intro" ? `${d.plan.quiz.items.length} questions · ${d.plan.quiz.seconds} s each · answer on your phone` : "Scores are locked"}</div>
            </div>
          )}

          {step?.kind === "qa" && (
            <div className="text-center">
              <div className="text-6xl font-bold">Ask anything</div>
              <div className="mt-4 text-2xl text-white/70">Type your question on your phone</div>
              {qr && <img src={qr} alt="" className="mx-auto mt-6 h-48 w-48 rounded-xl bg-white p-2" />}
            </div>
          )}

          {step?.kind === "results" && res && <ResultsView plan={d.plan} res={res} />}

          {step?.kind === "close" && (
            <div className="text-center">
              <div className="text-7xl font-bold">Thank you</div>
              {d.plan.purpose.message && <div className="mx-auto mt-6 max-w-3xl text-2xl text-white/80">{d.plan.purpose.message}</div>}
            </div>
          )}
          {step?.kind === "opening" && !step.slide && <div className="text-6xl font-bold">{d.title}</div>}

          {showMetrics && (
            <div className="absolute right-4 top-4 rounded bg-black/80 px-3 py-2 font-mono text-xs">
              approve→first word: {metrics.sayLatencyMs ?? "–"} ms · line start: {metrics.lineLatencyMs ?? "–"} ms · session {metrics.session}s · slot {slot} · {avatar.s}
            </div>
          )}
          {live?.held && <div className="absolute left-6 top-6 rounded-full bg-amber-500 px-4 py-1 text-sm font-semibold text-black">On hold</div>}
          {caption && <div className="absolute bottom-6 left-1/2 max-w-[80%] -translate-x-1/2 rounded-xl bg-black/70 px-5 py-3 text-center text-lg leading-snug">{caption}</div>}
        </div>

        {/* Presenter column */}
        <div className={`flex flex-col gap-3 p-4 ${fullStage ? "w-[30%]" : "w-[26%]"}`}>
          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-black">
            {showVideo ? (
              <>
                <video id="studio-video-0" autoPlay playsInline className={`absolute inset-0 h-full w-full object-cover ${slot === 0 ? "" : "invisible"}`} />
                <video id="studio-video-1" autoPlay playsInline className={`absolute inset-0 h-full w-full object-cover ${slot === 1 ? "" : "invisible"}`} />
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-7xl">🎙️</div>
            )}
            {avatar.s !== "ok" && armed && <div className="absolute bottom-2 left-2 right-2 rounded bg-black/70 px-2 py-1 text-xs text-white/80">{avatar.s === "starting" ? "Starting the presenter…" : avatar.s === "voice" ? `Voice mode${avatar.note ? `: ${avatar.note}` : ""}` : ""}</div>}
          </div>
          <div className="text-center text-sm text-white/70">{d.plan.presenter.name}</div>
          {live?.started && (
            <div className="mt-auto flex items-center gap-3 rounded-xl bg-white/5 p-3">
              {qr && <img src={qr} alt="" className="h-20 w-20 rounded bg-white p-1" />}
              <div className="text-sm">
                <div className="text-white/60">Join: {joinUrl}</div>
                <div className="text-xl font-semibold tracking-widest">{d.code}</div>
                <div className="text-white/60">{res?.people.length || 0} joined</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Bars({ options, counts, answer, reveal }: { options: string[]; counts?: number[]; answer: number | null; reveal: boolean }) {
  const total = (counts || []).reduce((a, b) => a + b, 0);
  return (
    <div className="mt-8 space-y-3">
      {options.map((o, i) => {
        const c = counts?.[i] || 0;
        const pct = total ? Math.round((c / total) * 100) : 0;
        const right = reveal && answer === i;
        return (
          <div key={i} className={`relative overflow-hidden rounded-xl border px-5 py-4 text-2xl ${right ? "border-emerald-400" : "border-white/15"}`}>
            {reveal && <div className={`absolute inset-y-0 left-0 ${right ? "bg-emerald-500/40" : "bg-white/15"}`} style={{ width: `${pct}%` }} />}
            <div className="relative flex justify-between gap-4">
              <span>
                {String.fromCharCode(65 + i)}. {o} {right && "✓"}
              </span>
              {reveal && <span className="tabular-nums">{pct}%</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PollView({ plan, pollKey, counts, reveal }: { plan: Plan; pollKey: string; counts?: number[]; reveal: boolean }) {
  const poll = plan.polls.items.find((p) => p.key === pollKey);
  if (!poll) return null;
  const total = (counts || []).reduce((a, b) => a + b, 0);
  return (
    <div className="absolute inset-6 flex flex-col justify-center rounded-3xl bg-[#0b0d12]/95 p-10">
      <div className="text-lg uppercase tracking-widest text-white/50">{reveal ? "Poll result" : "Poll · vote on your phone"}</div>
      <div className="mt-2 text-4xl font-bold leading-tight">{poll.question}</div>
      <Bars options={poll.options} counts={counts} answer={poll.answer} reveal={reveal} />
      <div className="mt-6 text-xl text-white/60">{total} vote{total === 1 ? "" : "s"}</div>
    </div>
  );
}

function QuizView({ plan, idx, stepAt, now, answered, joined }: { plan: Plan; idx: number; stepAt: number; now: number; answered: number; joined: number }) {
  const q = plan.quiz.items[idx];
  const left = Math.max(0, Math.ceil((stepAt + plan.quiz.seconds * 1000 - now) / 1000));
  const over = left <= 0;
  return (
    <div className="w-full max-w-5xl">
      <div className="flex justify-between text-xl text-white/60">
        <span>
          Question {idx + 1} of {plan.quiz.items.length}
        </span>
        <span>
          {answered}/{joined} answered
        </span>
      </div>
      <div className="mt-3 text-5xl font-bold leading-tight">{q.q}</div>
      <Bars options={q.options} answer={q.answer} reveal={over} />
      <div className={`mt-6 text-center text-6xl font-bold tabular-nums ${left <= 5 && !over ? "text-amber-400" : ""}`}>{over ? "Time's up" : left}</div>
    </div>
  );
}

function ResultsView({ plan, res }: { plan: Plan; res: Results }) {
  const top = res.ranking.filter((r) => r.correct > 0).slice(0, 3);
  const polls = plan.polls.enabled ? plan.polls.items : [];
  return (
    <div className="grid w-full max-w-6xl gap-8 md:grid-cols-2">
      {plan.quiz.enabled && plan.quiz.items.length > 0 && (
        <div>
          <div className="text-3xl font-bold">Quiz champions</div>
          <div className="mt-6 space-y-3">
            {top.map((r, i) => (
              <div key={r.person} className="flex items-center gap-4 rounded-2xl bg-white/5 px-5 py-4 text-2xl">
                <span className="text-4xl">{["🥇", "🥈", "🥉"][i]}</span>
                <span className="flex-1 font-semibold">{r.name}</span>
                <span className="tabular-nums text-white/70">
                  {r.correct}/{plan.quiz.items.length}
                </span>
              </div>
            ))}
            {!top.length && <div className="text-white/60">No quiz answers yet.</div>}
          </div>
          <div className="mt-3 text-sm text-white/50">Ties broken by total time on correct answers.</div>
        </div>
      )}
      {polls.length > 0 && (
        <div>
          <div className="text-3xl font-bold">How the room voted</div>
          <div className="mt-6 space-y-5">
            {polls.map((p) => {
              const c = res.polls[p.key] || [];
              const total = c.reduce((a, b) => a + b, 0);
              const topI = c.indexOf(Math.max(...c, 0));
              return (
                <div key={p.key}>
                  <div className="text-lg">{p.question}</div>
                  <div className="text-white/60">
                    {total ? `${p.options[topI]}: ${Math.round((c[topI] / total) * 100)}% · ${total} votes` : "No votes"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
