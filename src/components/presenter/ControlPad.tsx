"use client";
// Presenter.ai — Shreesha's remote (phone + Bluetooth earpiece).
// Push-to-talk turns his whispered words into a private direction for Shree.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, presenterChannel, type PresenterCommand, type PresenterStatus } from "@/lib/presenter/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { FLYER_PRESETS, POLLS, backupFlyerUrl, quizClock, type FlyerInputs, type HubState } from "@/lib/presenter/content";

type Session = { id: string; code: string; title: string };

type SR = any;

export default function ControlPad({ sessionId }: { sessionId?: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<PresenterStatus | null>(null);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [heardPtt, setHeardPtt] = useState("");
  const [err, setErr] = useState("");
  const chanRef = useRef<RealtimeChannel | null>(null);
  const recRef = useRef<SR>(null);
  const pttText = useRef("");

  useEffect(() => {
    (async () => {
      try {
        const q = sessionId ? `?id=${sessionId}` : "";
        const { session: sess } = await api<{ session: Session }>(`/api/presenter/session${q}`);
        setSession(sess);
        const ch = presenterChannel(sess.id);
        ch.on("broadcast", { event: "status" }, ({ payload }) => setStatus(payload as PresenterStatus));
        ch.subscribe((st) => {
          if (st === "SUBSCRIBED") ch.send({ type: "broadcast", event: "ping", payload: {} });
        });
        chanRef.current = ch;
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not load session");
      }
    })();
    return () => {
      chanRef.current?.unsubscribe();
    };
  }, [sessionId]);

  const send = useCallback((cmd: PresenterCommand) => {
    chanRef.current?.send({ type: "broadcast", event: "cmd", payload: cmd });
    if (navigator.vibrate) navigator.vibrate(30);
  }, []);

  /* Push-to-talk (browser speech recognition on the phone). */
  const startPtt = () => {
    const W = window as unknown as { SpeechRecognition?: SR; webkitSpeechRecognition?: SR };
    const Rec = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!Rec) {
      setErr("Voice commands need Chrome on Android. Use the text box instead.");
      return;
    }
    const rec = new Rec();
    rec.lang = "en-IN";
    rec.interimResults = true;
    rec.continuous = true;
    pttText.current = "";
    rec.onresult = (e: SR) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      pttText.current = t;
      setHeardPtt(t);
    };
    rec.onerror = () => setListening(false);
    rec.start();
    recRef.current = rec;
    setListening(true);
  };
  const stopPtt = () => {
    const rec = recRef.current;
    setListening(false);
    if (!rec) return;
    rec.onend = () => {
      const t = pttText.current.trim();
      if (t) send({ type: "direct", text: t });
    };
    rec.stop();
    recRef.current = null;
  };

  const btn = "rounded-xl px-3 py-4 text-base font-semibold active:scale-95 transition";
  const live = status && Date.now() - status.at < 20000;

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-4 pb-10 max-w-md mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-bold">Presenter control</div>
          <div className="text-xs text-white/50">{session ? `${session.title} · ${session.code}` : "Loading…"}</div>
        </div>
        <span className={`text-xs rounded-full px-2 py-1 ${live ? "bg-green-600" : "bg-neutral-700"}`}>{live ? "TV online" : "TV offline"}</span>
      </div>

      {status && (
        <div className="rounded-xl bg-neutral-900 p-3 text-sm space-y-1">
          <div>
            Slide <b>{status.slide + 1}</b>/{status.slideCount} · {status.layout} · twin {status.connected ? "on" : "off"}
            {status.speaking ? " · speaking" : ""}
            {status.paused ? " · PAUSED" : ""} · auto {status.auto ? "on" : "off"} · mic {status.micOn ? "on" : "off"}
          </div>
          {status.lastHeard && <div className="text-white/60">Heard: “{status.lastHeard}”</div>}
          {status.lastSaid && <div className="text-white/60 line-clamp-3">Said: “{status.lastSaid}”</div>}
        </div>
      )}
      {err && <div className="text-red-400 text-sm">{err}</div>}

      <button
        onPointerDown={startPtt}
        onPointerUp={stopPtt}
        onPointerLeave={() => listening && stopPtt()}
        className={`w-full ${btn} py-8 text-xl ${listening ? "bg-red-600" : "bg-orange-600"}`}
      >
        {listening ? "Listening… release to send" : "Hold to direct Shree (private)"}
      </button>
      {heardPtt && <div className="text-xs text-white/50">Last direction: “{heardPtt}”</div>}

      <div className="grid grid-cols-3 gap-2">
        <button className={`${btn} bg-neutral-800`} onClick={() => send({ type: "wake" })}>Wake</button>
        <button className={`${btn} bg-neutral-800`} onClick={() => send({ type: "start" })}>Open</button>
        <button className={`${btn} bg-neutral-800`} onClick={() => send({ type: "present" })}>Present</button>
        <button className={`${btn} bg-neutral-800`} onClick={() => send({ type: "prev" })}>◀ Prev</button>
        <button className={`${btn} bg-red-700`} onClick={() => send({ type: status?.paused ? "resume" : "pause" })}>
          {status?.paused ? "Resume" : "Pause"}
        </button>
        <button className={`${btn} bg-neutral-800`} onClick={() => send({ type: "next" })}>Next ▶</button>
        <button className={`${btn} bg-neutral-800`} onClick={() => send({ type: "stop" })}>Stop talking</button>
        <button className={`${btn} bg-neutral-800`} onClick={() => send({ type: "direct", text: "Wrap up this point in one sentence and move on." })}>Wrap up</button>
        <button className={`${btn} bg-neutral-800`} onClick={() => send({ type: "direct", text: "Several people are talking. Ask them warmly to go one at a time." })}>One at a time</button>
        <button className={`${btn} ${status?.micOn === false ? "bg-yellow-600" : "bg-neutral-800"}`} onClick={() => send({ type: "mic", on: status?.micOn === false })}>
          {status?.micOn === false ? "Mic: OFF" : "Mic: on"}
        </button>
        <button className={`${btn} bg-neutral-800`} onClick={() => send({ type: "auto", on: !(status?.auto ?? true) })}>
          Auto: {status?.auto === false ? "off" : "on"}
        </button>
        <button className={`${btn} bg-neutral-800`} onClick={() => send({ type: "reconnect" })}>Reconnect</button>
      </div>

      <div className="grid grid-cols-4 gap-2 text-sm">
        <button className={`${btn} py-3 bg-neutral-900`} onClick={() => send({ type: "standby" })}>Dark</button>
        <button className={`${btn} py-3 bg-neutral-900`} onClick={() => send({ type: "layout", layout: "twin" })}>Twin big</button>
        <button className={`${btn} py-3 bg-neutral-900`} onClick={() => send({ type: "layout", layout: "slides" })}>Slides</button>
        <button className={`${btn} py-3 bg-neutral-900`} onClick={() => send({ type: "layout", layout: "handover" })}>Take over</button>
      </div>

      {session && <HubControls sessionId={session.id} send={send} status={status} />}

      <div className="space-y-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="Type a direction (e.g. 'thank Priya and move to the quiz') or exact words to say"
          className="w-full rounded-xl bg-neutral-900 p-3 text-sm outline-none"
        />
        <div className="grid grid-cols-2 gap-2">
          <button className={`${btn} py-3 bg-orange-700`} onClick={() => { if (text.trim()) send({ type: "direct", text: text.trim() }); setText(""); }}>
            Direct Shree
          </button>
          <button className={`${btn} py-3 bg-neutral-800`} onClick={() => { if (text.trim()) send({ type: "say", text: text.trim() }); setText(""); }}>
            Say exactly
          </button>
        </div>
      </div>

      <div className="text-xs text-white/40">
        Go to slide:
        <div className="mt-2 flex flex-wrap gap-1">
          {Array.from({ length: status?.slideCount || 0 }).map((_, i) => (
            <button key={i} onClick={() => send({ type: "goto", idx: i })} className={`h-8 w-8 rounded ${status?.slide === i ? "bg-orange-600 text-white" : "bg-neutral-800 text-white/70"}`}>
              {i + 1}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ audience hub controls ------------------------------ */
type BoardLite = {
  attendees: Array<{ name: string }>;
  assessment: { completed: number };
  polls: Record<string, number[]>;
  questions: Array<{ id: string; text: string; status: string }>;
  quiz: { players: number };
  serverNow: number;
};

function HubControls({ sessionId, send, status }: { sessionId: string; send: (c: PresenterCommand) => void; status: PresenterStatus | null }) {
  const [hub, setHub] = useState<HubState | null>(null);
  const [board, setBoard] = useState<BoardLite | null>(null);
  const [code, setCode] = useState("");
  const [fi, setFi] = useState<FlyerInputs>({ name: "", date: "", venue: "", highlights: ["", "", ""] });
  const [msg, setMsg] = useState("");
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      const d = await api<{ hub: HubState; board: BoardLite; code: string }>(`/api/presenter/hub/admin?id=${sessionId}`);
      setHub(d.hub);
      setBoard(d.board);
      setCode(d.code);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Hub error");
    }
  }, [sessionId]);

  useEffect(() => {
    load();
    const iv = setInterval(load, 3000);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(iv);
      clearInterval(t);
    };
  }, [load]);

  const act = async (body: Record<string, unknown>) => {
    setMsg("");
    try {
      const d = await api<{ hub?: HubState }>("/api/presenter/hub/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sessionId, ...body }),
      });
      if (d.hub) setHub(d.hub);
      send({ type: "hub" });
      if (navigator.vibrate) navigator.vibrate(30);
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  };

  const b = "rounded-xl px-2 py-3 text-sm font-semibold active:scale-95 transition";
  const on = (cond: boolean) => (cond ? "bg-orange-600" : "bg-neutral-800");
  const clock = hub?.phase === "quiz" ? quizClock(hub.quiz, now) : null;

  /* ---------- Run of show: one button walks the 9 acts in order ---------- */
  const [actIdx, setActIdx] = useState(() => {
    try {
      return Number(localStorage.getItem(`presenter-act-${sessionId}`) || 0);
    } catch {
      return 0;
    }
  });
  const phase = (p: string, extra: Record<string, unknown> = {}) => act({ action: "phase", phase: p, ...extra });
  const ACTS: Array<{ label: string; hint: string; run: () => Promise<void> | void }> = [
    { label: "Lobby", hint: "Title + QR on TV. People join on phones.", run: () => phase("lobby") },
    { label: "Act 1 · Dark for the snap", hint: "You open (60–90 s), then snap.", run: () => send({ type: "standby" }) },
    { label: "Act 1 · Shree enters", hint: "Twin appears and opens the show.", run: () => send({ type: "start" }) },
    { label: "Act 1 · Before poll", hint: "Confidence poll on phones.", run: () => phase("poll", { poll: "before" }) },
    {
      label: "Act 2 · Meet the cast",
      hint: "Intros, 30 s each. Shree reacts by name.",
      run: () => {
        send({ type: "layout", layout: "twin" });
        send({ type: "intros", on: true });
        send({ type: "direct", text: "Start the introductions: invite each person, one at a time, to say their name and one task they wish they never had to do again, in about 20 seconds. React in ONE short, warm, witty sentence (light office humour is welcome, like 'ah, the 49-tab Excel of doom'), by name. Begin now by inviting the first volunteer." });
      },
    },
    {
      label: "Act 3 · Quiz screen",
      hint: "Then tap Quiz ▶ GO below.",
      run: () => {
        send({ type: "intros", on: false });
        return phase("quiz");
      },
    },
    { label: "Act 4 · The Mirror", hint: "20-question self-assessment on phones.", run: () => phase("assessment") },
    { label: "Act 5 · The Story (slides)", hint: "Shree presents. Polls 1 and 2 buttons below.", run: () => send({ type: "present" }) },
    { label: "Act 5 · Debate", hint: "Two sides vote on phones; Shree moderates.", run: () => phase("poll", { poll: "debate" }) },
    { label: "Act 6 · The Build", hint: "Fill the flyer inputs below, tap Start build.", run: () => send({ type: "layout", layout: "twin" }) },
    { label: "Act 7 · Over to you", hint: "Shree pauses; switch HDMI.", run: () => send({ type: "layout", layout: "handover" }) },
    { label: "Act 6½ · Welcome back + reveal", hint: "Shree returns; tap Reveal app below.", run: () => send({ type: "resume" }) },
    { label: "Act 6½ · Score the app", hint: "Fact poll (then Value, ROI buttons).", run: () => phase("poll", { poll: "check-fact" }) },
    { label: "Act 8 · Ask anything", hint: "Q&A list on TV; 'Shree answers' below.", run: () => phase("questions") },
    { label: "Act 9 · Finale", hint: "Tap 'Finale next' for 3rd, 2nd, winner, levels.", run: () => phase("finale") },
    { label: "Act 9 · After poll", hint: "Same question as the start.", run: () => phase("poll", { poll: "after" }) },
    { label: "Act 9 · Commitments", hint: "Pledge on TV, commitments on phones.", run: () => phase("commit") },
    { label: "Thank you", hint: "Your last word.", run: () => phase("closed") },
  ];
  // Snap or "Hey Shree" brought him in: move the stepper on without re-running the step.
  const lastEntrance = useRef("");
  useEffect(() => {
    const how = status?.entrance || "";
    if (how && how !== lastEntrance.current) {
      lastEntrance.current = how;
      if (ACTS[actIdx]?.label === "Act 1 · Dark for the snap") {
        const n = actIdx + 1;
        setActIdx(n);
        try {
          localStorage.setItem(`presenter-act-${sessionId}`, String(n));
        } catch {}
      }
    }
    if (!how) lastEntrance.current = "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.entrance]);

  const goAct = async (i: number) => {
    const n = Math.max(0, Math.min(ACTS.length - 1, i));
    setActIdx(n);
    try {
      localStorage.setItem(`presenter-act-${sessionId}`, String(n));
    } catch {}
    await ACTS[n].run();
  };

  return (
    <div className="rounded-xl bg-neutral-900 p-3 space-y-3">
      <div className="rounded-xl bg-neutral-800 p-3">
        <div className="text-[11px] uppercase tracking-wider text-white/50">Run of show · step {actIdx + 1}/{ACTS.length}</div>
        <div className="mt-1 text-base font-bold">{ACTS[actIdx]?.label}</div>
        <div className="text-xs text-white/60">{ACTS[actIdx]?.hint}</div>
        {actIdx + 1 < ACTS.length && <div className="mt-1 text-xs text-white/40">Next: {ACTS[actIdx + 1].label}</div>}
        {status?.listening && (
          <div className="mt-2 rounded-lg bg-black/40 px-2 py-1.5 text-xs">
            👂 Listening for {status.listening.snap ? "snap ✓" : "snap ✗ (mic blocked)"} · {status.listening.voice ? "“Hey Shree” ✓" : "voice ✗"}
            {status.listening.test && <span className="text-yellow-300"> · TEST MODE</span>}
          </div>
        )}
        {status?.entrance && status.layout !== "standby" && <div className="mt-2 text-xs text-green-400">Shree in via {status.entrance} ✓</div>}
        {status?.layout === "montage" && (
          <button className="mt-2 w-full rounded-lg bg-neutral-700 py-2 text-xs" onClick={() => send({ type: "skip-montage" })}>
            Montage playing… Skip to Shree
          </button>
        )}
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span className="text-white/50">TV sound</span>
          <button className="rounded-lg bg-neutral-700 px-3 py-1.5" onClick={() => send({ type: "sound", volume: Math.max(0, (status?.sound?.volume ?? 0.8) - 0.15) })}>−</button>
          <span className="w-8 text-center">{Math.round((status?.sound?.volume ?? 0.8) * 100)}</span>
          <button className="rounded-lg bg-neutral-700 px-3 py-1.5" onClick={() => send({ type: "sound", volume: Math.min(1, (status?.sound?.volume ?? 0.8) + 0.15) })}>+</button>
          <button className={`rounded-lg px-3 py-1.5 ${status?.sound?.muted ? "bg-red-700" : "bg-neutral-700"}`} onClick={() => send({ type: "sound", muted: !status?.sound?.muted })}>
            {status?.sound?.muted ? "Muted" : "Mute"}
          </button>
        </div>
        {status?.intros && <div className="mt-2 text-xs text-sky-300">Intros on: saving each spoken intro{status.introSaved ? ` · last saved: ${status.introSaved}` : ""}</div>}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button className={`${b} bg-neutral-700`} onClick={() => goAct(actIdx - 1)}>◀ Back</button>
          <button className={`${b} bg-neutral-700`} onClick={() => goAct(actIdx)}>Redo</button>
          <button className={`${b} bg-orange-600 text-base`} onClick={() => goAct(actIdx + 1)}>Next act ▶</button>
        </div>
      </div>
      <EntranceTest status={status} send={send} />

      <div className="flex items-center justify-between text-sm">
        <b>Audience hub {code && <span className="text-white/50">· /p/{code}</span>}</b>
        <span className="text-white/60">{board?.attendees.length || 0} joined</span>
      </div>
      <div className="text-xs text-white/60">
        Phase: <b className="text-white">{hub?.phase || "…"}</b>
        {hub?.phase === "poll" && ` · ${hub.poll}`}
        {clock && clock.status !== "off" && ` · quiz ${clock.status === "done" ? "done" : clock.status === "leadin" ? "starting" : `Q${clock.idx + 1}`}`}
        {hub?.phase === "assessment" && ` · ${board?.assessment.completed || 0} done`}
        {hub?.phase === "finale" && ` · step ${hub.finaleStep || 0}/5`}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button className={`${b} ${on(hub?.phase === "lobby")}`} onClick={() => act({ action: "phase", phase: "lobby" })}>Lobby</button>
        <button className={`${b} ${on(hub?.phase === "quiz")}`} onClick={() => act({ action: "phase", phase: "quiz" })}>Quiz screen</button>
        <button className={`${b} bg-green-700`} onClick={() => confirm("Start the 30-question quiz now?") && act({ action: "quiz-start" })}>Quiz ▶ GO</button>
        <button className={`${b} ${on(hub?.phase === "assessment")}`} onClick={() => act({ action: "phase", phase: "assessment" })}>Assessment</button>
        <button className={`${b} ${on(hub?.phase === "questions")}`} onClick={() => act({ action: "phase", phase: "questions" })}>Q&A list</button>
        <button className={`${b} ${on(hub?.phase === "commit")}`} onClick={() => act({ action: "phase", phase: "commit" })}>Commit</button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {POLLS.map((p) => (
          <button key={p.key} className={`${b} py-2 text-xs ${on(hub?.phase === "poll" && hub.poll === p.key)}`} onClick={() => act({ action: "phase", phase: "poll", poll: p.key })}>
            {p.key}
            <div className="text-[10px] font-normal text-white/60">{(board?.polls[p.key] || []).reduce((a, c) => a + c, 0)} votes</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button className={`${b} bg-amber-600`} onClick={() => act({ action: "finale-step" })}>Finale next ▶</button>
        <button className={`${b} bg-neutral-800`} onClick={() => act({ action: "finale-step", step: Math.max(0, (hub?.finaleStep || 0) - 1) })}>◀ Finale back</button>
        <button className={`${b} ${on(hub?.phase === "closed")}`} onClick={() => act({ action: "phase", phase: "closed" })}>Thank you</button>
      </div>
      <div className="text-[11px] text-white/40">Finale steps: 1 third · 2 second · 3 winner · 4 levels · 5 before/after. Shree announces each one.</div>

      <FlyerControls
        fi={fi}
        setFi={setFi}
        build={hub?.flyerBuild || null}
        now={now}
        onBuild={async () => {
          if (!fi.name.trim() || !fi.date.trim() || !fi.venue.trim() || fi.highlights.some((h) => !h.trim())) {
            setMsg("Fill all 4 flyer inputs (or tap a preset).");
            return;
          }
          await act({ action: "phase", phase: "build" });
          send({ type: "flyer-build", inputs: fi });
        }}
        onReveal={async (forceBackup: boolean) => {
          const fb = hub?.flyerBuild;
          // Silent switch: live build if it's ready, otherwise the pre-built backup with the same inputs.
          const path = fb?.status === "ready" && !forceBackup ? `/api/presenter/flyer/app?code=${code}` : backupFlyerUrl(fb?.inputs || (fi.name ? fi : FLYER_PRESETS[0].inputs));
          await act({ action: "flyer-url", url: `${window.location.origin}${path}` });
          await act({ action: "phase", phase: "flyer" });
        }}
      />

      <div className="grid grid-cols-2 gap-2">
        <button className={`${b} bg-neutral-800`} onClick={() => send({ type: "hub" })}>Show hub on TV</button>
        <button className={`${b} bg-neutral-800`} onClick={() => confirm("Wipe all quiz answers and reset the quiz?") && act({ action: "quiz-reset" })}>Reset quiz</button>
      </div>

      {!!board?.questions.length && (
        <div className="space-y-2">
          <div className="text-xs text-white/50">Phone questions</div>
          {board.questions.filter((q) => q.status === "open").slice(0, 8).map((q) => (
            <div key={q.id} className="rounded-lg bg-neutral-800 p-2 text-sm">
              <div>{q.text}</div>
              <div className="mt-2 flex gap-2">
                <button className="rounded-lg bg-orange-700 px-3 py-1 text-xs" onClick={() => { send({ type: "direct", text: `Answer this audience question out loud in about 30 seconds: "${q.text}". If it's about building or tool setup, hand it to Shreesha.` }); act({ action: "question-status", qid: q.id, status: "answered" }); }}>
                  Shree answers
                </button>
                <button className="rounded-lg bg-neutral-700 px-3 py-1 text-xs" onClick={() => act({ action: "question-status", qid: q.id, status: "answered" })}>Done</button>
                <button className="rounded-lg bg-neutral-700 px-3 py-1 text-xs" onClick={() => act({ action: "question-status", qid: q.id, status: "hidden" })}>Hide</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {msg && <div className="text-xs text-red-400">{msg}</div>}
    </div>
  );
}

function FlyerControls({
  fi,
  setFi,
  build,
  now,
  onBuild,
  onReveal,
}: {
  fi: FlyerInputs;
  setFi: (f: FlyerInputs) => void;
  build: HubState["flyerBuild"] | null;
  now: number;
  onBuild: () => void;
  onReveal: (forceBackup: boolean) => void;
}) {
  const inp = "w-full rounded-lg bg-neutral-800 px-3 py-2 text-sm outline-none";
  const secs = build ? Math.round(((build.finishedAt || now) - build.startedAt) / 1000) : 0;
  return (
    <div className="space-y-2 rounded-lg border border-white/10 p-2">
      <div className="flex items-center justify-between text-xs">
        <b>Flyer build</b>
        <span className={build?.status === "ready" ? "text-green-400" : build?.status === "failed" ? "text-red-400" : "text-white/60"}>
          {build ? `${build.status} · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}${build.status === "failed" ? " · backup will be used" : ""}` : "not started"}
        </span>
      </div>
      <div className="flex gap-2">
        {FLYER_PRESETS.map((p) => (
          <button key={p.label} className="rounded-lg bg-neutral-700 px-3 py-1.5 text-xs" onClick={() => setFi({ ...p.inputs, highlights: [...p.inputs.highlights] })}>
            Preset: {p.label}
          </button>
        ))}
      </div>
      <input className={inp} placeholder="Event name" value={fi.name} onChange={(e) => setFi({ ...fi, name: e.target.value })} />
      <div className="grid grid-cols-2 gap-2">
        <input className={inp} placeholder="Date & time" value={fi.date} onChange={(e) => setFi({ ...fi, date: e.target.value })} />
        <input className={inp} placeholder="Venue" value={fi.venue} onChange={(e) => setFi({ ...fi, venue: e.target.value })} />
      </div>
      {fi.highlights.map((h, i) => (
        <input key={i} className={inp} placeholder={`Highlight ${i + 1}`} value={h} onChange={(e) => { const hs = [...fi.highlights]; hs[i] = e.target.value; setFi({ ...fi, highlights: hs }); }} />
      ))}
      <div className="grid grid-cols-2 gap-2">
        <button className="rounded-xl bg-green-700 py-3 text-sm font-semibold" onClick={onBuild}>Start build ▶</button>
        <button className="rounded-xl bg-orange-700 py-3 text-sm font-semibold" onClick={() => onReveal(false)}>Reveal app</button>
      </div>
      <button className="w-full rounded-lg bg-neutral-800 py-2 text-xs" onClick={() => onReveal(true)}>Reveal the backup app instead</button>
      <div className="text-[11px] text-white/40">Reveal uses the live build if it&apos;s ready, otherwise the tested backup app with the same details. Nobody sees the switch.</div>
    </div>
  );
}

function EntranceTest({ status, send }: { status: PresenterStatus | null; send: (c: PresenterCommand) => void }) {
  const [open, setOpen] = useState(false);
  const test = !!status?.listening?.test;
  const sens = status?.listening?.sens || "med";
  if (!open)
    return (
      <button className="w-full rounded-lg bg-neutral-800 py-2 text-xs text-white/70" onClick={() => setOpen(true)}>
        Test snap & “Hey Shree” before the show
      </button>
    );
  return (
    <div className="space-y-2 rounded-lg border border-yellow-500/40 p-2 text-xs">
      <div className="flex items-center justify-between">
        <b>Entrance test</b>
        <button className="text-white/50" onClick={() => { send({ type: "entrance-test", on: false }); setOpen(false); }}>Close</button>
      </div>
      <div className="text-white/60">Turn test on, then snap or say “Hey Shree” near the laptop. Nothing starts in test mode; you just see what was detected.</div>
      <div className="grid grid-cols-2 gap-2">
        <button className={`rounded-lg py-2 font-semibold ${test ? "bg-yellow-600" : "bg-neutral-700"}`} onClick={() => send({ type: "entrance-test", on: !test })}>
          Test mode: {test ? "ON" : "off"}
        </button>
        <div className="flex gap-1">
          {(["low", "med", "high"] as const).map((l) => (
            <button key={l} className={`flex-1 rounded-lg py-2 ${sens === l ? "bg-orange-600" : "bg-neutral-700"}`} onClick={() => send({ type: "entrance-sens", level: l })}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-[1.5em] text-sm text-green-400">{status?.testHit || (test ? "Waiting for a snap or “Hey Shree”…" : "")}</div>
      <div className="text-white/40">Sensitivity: high catches soft snaps but may react to claps or bangs; low needs a sharp snap close to the laptop.</div>
    </div>
  );
}
