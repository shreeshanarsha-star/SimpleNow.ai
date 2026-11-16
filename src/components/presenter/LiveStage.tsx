"use client";
// Presenter.ai — the TV screen. Runs the twin (Anam video + voice), shows the
// deck, listens to the room through the twin's mic, asks the Director what to
// say, and obeys commands from Shreesha's control page (Supabase broadcast).
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient as createAnamClient, AnamEvent } from "@anam-ai/js-sdk";
import type { AnamClient } from "@anam-ai/js-sdk";
import {
  api,
  bridgePhrase,
  openPdf,
  pageText,
  presenterChannel,
  renderPage,
  type PresenterCommand,
  type PresenterStatus,
} from "@/lib/presenter/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import HubScreen, { type Board } from "@/components/presenter/HubScreen";
import Montage from "@/components/presenter/Montage";
import { cue, duck, getSoundState, initSound, setBed, setMuted, setVolume } from "@/lib/presenter/sound";
import { DEFAULT_HUB, FLYER_PRESETS, QUIZ, SHOW_STEPS, backupFlyerUrl, pollByKey, quizClock, type HubState } from "@/lib/presenter/content";

type Session = { id: string; code: string; title: string; state: Record<string, unknown> };
type Line = { role: "room" | "shree" | "shreesha"; text: string };
type Layout = PresenterStatus["layout"];

export default function LiveStage({ sessionId }: { sessionId?: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [layout, setLayout] = useState<Layout>("standby");
  const [slide, setSlide] = useState(0);
  const [slideCount, setSlideCount] = useState(0);
  const [caption, setCaption] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [connected, setConnected] = useState(false);
  const [note, setNote] = useState("Standby");
  const [armed, setArmed] = useState(false);
  const [hub, setHub] = useState<HubState>(DEFAULT_HUB);
  const [board, setBoard] = useState<Board | null>(null);
  const [quizKey, setQuizKey] = useState<number[]>([]);
  const [tick, setTick] = useState(Date.now());
  const [finaleShown, setFinaleShown] = useState(0);
  const [montage, setMontage] = useState(false);
  const montageDone = useRef<(() => void) | null>(null);
  const [buildText, setBuildText] = useState("");
  const building = useRef(false);
  const hubRef = useRef<{ hub: HubState; board: Board | null; offset: number; lastQuizNote: number; lastFinale: number; lastReveal: string; lastWish: string; busy: boolean }>({
    hub: DEFAULT_HUB,
    board: null,
    offset: 0,
    lastQuizNote: -1,
    lastFinale: 0,
    lastReveal: "",
    lastWish: "",
    busy: false,
  });

  const anamRef = useRef<AnamClient | null>(null);
  const chanRef = useRef<RealtimeChannel | null>(null);
  const deckRef = useRef<any>(null);
  const notesRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const textCache = useRef<Map<number, string>>(new Map());
  const transcript = useRef<Line[]>([]);
  const seenMsgIds = useRef<Set<string>>(new Set());
  const s = useRef({
    slide: 0,
    slideCount: 0,
    auto: true,
    paused: false,
    micOn: true,
    speaking: false,
    busy: false,
        layout: "standby" as Layout,
    lastHeard: "",
    lastSaid: "",
    speakTimer: 0 as unknown as ReturnType<typeof setTimeout>,
    gen: 0,
    slideNarrated: false,
    intros: false,
    entranceTest: false,
    sens: "med" as "low" | "med" | "high",
    listening: null as PresenterStatus["listening"],
    entrance: "",
    testHit: "",
    introSaved: "",
    pendingAfterSpeech: null as null | (() => void),
    // Echo guard: strict = room mic muted while Shree talks (+0.7 s); open = always on; off = never.
    echo: "strict" as "strict" | "open" | "off",
    micOk: undefined as boolean | undefined,
    lastSpeechEnd: 0,
    speakStart: 0,
    speakText: "",
    resume: null as null | { text: string; after: (() => void) | null },
    manualInterrupt: 0,
    roomBusy: false,
    quietListen: false,
    lastRoomAt: 0,
    expect: null as null | ((heard: string) => Promise<boolean>),
    ap: {
      on: true,
      running: false,
      gen: 0,
      idx: -1,
      label: "",
      stepStart: 0,
      budget: 0,
      showStart: 0,
      skip: false,
      pausedMs: 0,
      pausedAt: 0,
      waiting: "",
      waitResume: null as null | (() => void),
    },
  });

  /* ------------------------------ status ------------------------------ */
  const pushStatus = useCallback((extra?: Partial<PresenterStatus>) => {
    const st: PresenterStatus = {
      connected: !!anamRef.current,
      speaking: s.current.speaking,
      paused: s.current.paused,
      auto: s.current.auto,
      micOn: s.current.micOn,
      layout: s.current.layout,
      slide: s.current.slide,
      slideCount: s.current.slideCount,
      lastHeard: s.current.lastHeard,
      lastSaid: s.current.lastSaid,
      listening: s.current.listening,
      entrance: s.current.entrance,
      testHit: s.current.testHit,
      intros: s.current.intros,
      introSaved: s.current.introSaved,
      echo: s.current.echo,
      micOk: s.current.micOk,
      ap: {
        on: s.current.ap.on,
        running: s.current.ap.running,
        idx: s.current.ap.idx,
        total: SHOW_STEPS.length,
        label: s.current.ap.label,
        stepElapsed: s.current.ap.stepStart ? Math.round((Date.now() - s.current.ap.stepStart) / 1000) : 0,
        budget: s.current.ap.budget,
        showElapsed: s.current.ap.showStart ? Math.round((Date.now() - s.current.ap.showStart - s.current.ap.pausedMs) / 1000) : 0,
        planned: SHOW_STEPS.slice(0, Math.max(0, s.current.ap.idx)).reduce((a, b) => a + b.budget, 0),
        waiting: s.current.ap.waiting,
      },
      sound: (() => {
        const ss = getSoundState();
        return { volume: ss.volume, muted: ss.muted };
      })(),
      at: Date.now(),
      ...extra,
    };
    chanRef.current?.send({ type: "broadcast", event: "status", payload: st });
  }, []);

  const setLayoutBoth = useCallback(
    (l: Layout) => {
      s.current.layout = l;
      setLayout(l);
      pushStatus();
    },
    [pushStatus]
  );

  /* ------------------------------ deck ------------------------------ */
  const slideText = useCallback(async (idx: number) => {
    if (textCache.current.has(idx)) return textCache.current.get(idx)!;
    let t = "";
    const src = notesRef.current || deckRef.current;
    if (src && idx < src.numPages) t = await pageText(src, idx + 1).catch(() => "");
    textCache.current.set(idx, t);
    return t;
  }, []);

  const drawSlide = useCallback(async (idx: number) => {
    const doc = deckRef.current;
    const c = canvasRef.current;
    const box = stageRef.current;
    if (!doc || !c || !box) return;
    const r = box.getBoundingClientRect();
    await renderPage(doc, idx + 1, c, r.width, r.height).catch(() => {});
  }, []);

  /* ------------------------------ echo guard ------------------------------ */
  // Shree must never hear himself or the music: the room mic is open only when
  // someone is expected to talk, and (strict) never while he speaks.
  const micWanted = useCallback(() => {
    const st = s.current;
    if (!st.micOn || st.echo === "off") return false;
    if (st.echo === "strict" && (st.speaking || Date.now() - st.lastSpeechEnd < 700)) return false;
    const L = st.layout;
    if (L === "twin" || L === "slides") return true;
    if (L === "hub") return ["questions", "wishwall", "poll"].includes(hubRef.current.hub.phase);
    return false;
  }, []);
  const micState = useRef<boolean | null>(null);
  const applyMic = useCallback(() => {
    const c = anamRef.current;
    if (!c) {
      micState.current = null;
      return;
    }
    const want = micWanted();
    if (micState.current === want) return;
    micState.current = want;
    try {
      if (want) c.unmuteInputAudio();
      else c.muteInputAudio();
    } catch {}
  }, [micWanted]);
  useEffect(() => {
    const iv = setInterval(applyMic, 250);
    return () => clearInterval(iv);
  }, [applyMic]);

  /* ------------------------------ speech ------------------------------ */
  const markSpeechDone = useCallback(() => {
    clearTimeout(s.current.speakTimer);
    if (!s.current.speaking) return;
    s.current.speaking = false;
    s.current.lastSpeechEnd = Date.now();
    setSpeaking(false);
    pushStatus();
    const next = s.current.pendingAfterSpeech;
    s.current.pendingAfterSpeech = null;
    if (next) setTimeout(next, 1200);
  }, [pushStatus]);

  const speak = useCallback(
    async (text: string, after?: () => void) => {
      const client = anamRef.current;
      if (!text || text.includes("[SILENT]")) {
        after?.();
        return;
      }
      s.current.lastSaid = text;
      s.current.speakText = text;
      s.current.speakStart = Date.now();
      s.current.resume = null;
      transcript.current.push({ role: "shree", text });
      setCaption(text);
      const words = text.split(/\s+/).length;
      s.current.speaking = true;
      setSpeaking(true);
      micState.current = null;
      applyMic();
      s.current.pendingAfterSpeech = after || null;
      pushStatus();
      clearTimeout(s.current.speakTimer);
      if (!client) {
        // No twin (Anam down or not connected): Shree still speaks, in the browser's voice.
        setNote("Twin offline — backup voice");
        s.current.speakTimer = setTimeout(markSpeechDone, (words / 2.3) * 1000 + 4000);
        try {
          const synth = window.speechSynthesis;
          if (synth) {
            synth.cancel();
            const u = new SpeechSynthesisUtterance(text);
            const voices = synth.getVoices();
            u.voice = voices.find((v) => /en-IN/i.test(v.lang) && /male|ravi|prabhat/i.test(v.name)) || voices.find((v) => /en-IN/i.test(v.lang)) || voices.find((v) => /^en/i.test(v.lang)) || null;
            u.rate = 1.02;
            u.onend = () => markSpeechDone();
            u.onerror = () => markSpeechDone();
            synth.speak(u);
          }
        } catch {}
        return;
      }
      // Safety net in case the end-of-speech event never arrives.
      s.current.speakTimer = setTimeout(markSpeechDone, (words / 2.4) * 1000 + 4000);
      try {
        await client.talk(text);
      } catch (err) {
        console.error("talk failed", err);
        markSpeechDone();
      }
    },
    [markSpeechDone, pushStatus, applyMic]
  );

  /** Speak and resolve when finished (or superseded). */
  const say = useCallback(
    (text: string) =>
      new Promise<void>((resolve) => {
        if (!text || text.includes("[SILENT]")) return resolve();
        const timer = setTimeout(resolve, (text.split(/\s+/).length / 2.2) * 1000 + 8000);
        speak(text, () => {
          clearTimeout(timer);
          resolve();
        });
      }),
    [speak]
  );

  /** Someone talked over Shree (open mode): remember the rest to pick up after. */
  const onTalkInterrupted = useCallback(() => {
    const st = s.current;
    if (st.speaking && Date.now() - st.manualInterrupt > 1500 && st.speakText) {
      const words = st.speakText.split(/\s+/);
      const spoken = Math.floor(((Date.now() - st.speakStart) / 1000) * 2.5);
      const rest = words.slice(spoken).join(" ");
      if (rest.split(/\s+/).length > 8) st.resume = { text: rest, after: st.pendingAfterSpeech };
      st.pendingAfterSpeech = null;
    }
    markSpeechDone();
  }, [markSpeechDone]);

  const onTalkInterruptedRef = useRef(onTalkInterrupted);
  onTalkInterruptedRef.current = onTalkInterrupted;

  const director = useCallback(
    async (body: Record<string, unknown>) => {
      const out = await api<{ say: string }>("/api/presenter/director", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session?.id,
          transcript: transcript.current.slice(-12),
          slideCount: s.current.slideCount,
          people: peopleContext(hubRef.current.board),
          phase:
            hubContext(hubRef.current.hub, hubRef.current.board) +
            (s.current.intros
              ? " ACT 2 INTRODUCTIONS IN PROGRESS: people are introducing themselves one by one (name + one task they wish they never had to do again). After each person, react warmly and briefly (1 to 2 sentences): use their name only if they said it or it matches someone signed in, relate lightly to Shreesha's note about them if there is one, then invite the next person. If it's unclear who spoke, react without a name."
              : ""),
          ...body,
        }),
      });
      return out.say;
    },
    [session?.id]
  );

  /* ------------------------------ presenting ------------------------------ */
  const presentSlide = useCallback(
    async (idx: number) => {
      // Each call supersedes any earlier one still waiting on the Director,
      // so a Next/Prev tap never leaves two flows racing (the "jumping" bug).
      const gen = ++s.current.gen;
      s.current.busy = true;
      s.current.slideNarrated = false;
      s.current.slide = idx;
      setSlide(idx);
      setNote(`Preparing slide ${idx + 1}…`);
      pushStatus();
      try {
        await drawSlide(idx);
        const [text, nextA, nextB] = await Promise.all([slideText(idx), slideText(idx + 1), slideText(idx + 2)]);
        // No dead air between slides: a short transition if the next line takes a moment.
        const bridge = setTimeout(() => {
          if (gen === s.current.gen && anamRef.current && !s.current.speaking) {
            const lines = ["Right, moving on.", "Okay, next one.", "Now, here's where it gets interesting.", "Let's keep going.", "Alright, next."];
            anamRef.current.talk(lines[(idx * 7) % lines.length]).catch(() => {});
          }
        }, 2500);
        const say = await director({ mode: "slide", slideIdx: idx, slideText: text, nextSlidesText: `${nextA}\n---\n${nextB}` }).finally(() => clearTimeout(bridge));
        if (gen !== s.current.gen) return; // superseded
        setNote("");
        await speak(say, () => {
          if (gen !== s.current.gen) return;
          s.current.slideNarrated = true;
          if (s.current.auto && !s.current.paused && s.current.layout === "slides" && s.current.slide === idx && idx + 1 < s.current.slideCount) {
            presentSlide(idx + 1);
          }
        });
      } catch (err) {
        if (gen === s.current.gen) setNote(err instanceof Error ? err.message : "Director error");
      } finally {
        if (gen === s.current.gen) s.current.busy = false;
      }
    },
    [director, drawSlide, pushStatus, slideText, speak]
  );

  const onRoomSpeech = useCallback(
    async (heard: string) => {
      const st = s.current;
      if (!heard.trim() || st.paused) return;
      // Echo filter: ignore anything that sounds like Shree's own last lines.
      const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2);
      const hw = norm(heard);
      const mine = new Set(norm(transcript.current.filter((l) => l.role === "shree").slice(-2).map((l) => l.text).join(" ")));
      if (hw.length >= 3 && hw.filter((w) => mine.has(w)).length / hw.length >= 0.6) return;
      st.lastRoomAt = Date.now();
      st.lastHeard = heard;
      transcript.current.push({ role: "room", text: heard });
      pushStatus();
      if (st.quietListen) return; // Shreesha (or a guest) has the floor: listen only
      if (st.expect) {
        const handled = await st.expect(heard).catch(() => false);
        if (handled) return;
      }
      if (st.intros && session?.id) {
        // Save the spoken intro to that person's memory (background, never blocks Shree).
        api<{ matched: string | null }>("/api/presenter/intro", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: session.id, heard }),
        })
          .then((r) => {
            if (r.matched) {
              st.introSaved = r.matched;
              pushStatus();
            }
          })
          .catch(() => {});
      }
      const wasSlide = st.slide;
      st.roomBusy = true;
      const resume = st.resume;
      st.resume = null;
      const t = setTimeout(() => {
        anamRef.current?.talk(bridgePhrase()).catch(() => {});
      }, 1500);
      try {
        let reply = await director({ mode: "room", heard, slideIdx: wasSlide, slideText: await slideText(wasSlide), nextSlidesText: await slideText(wasSlide + 1) });
        clearTimeout(t);
        // Parked for Q&A: add it to the question list.
        const qa = reply.match(/\[QA:\s*([^\]]+)\]/i);
        if (qa && session?.id) {
          reply = reply.replace(qa[0], "").trim();
          api("/api/presenter/hub/admin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: session.id, action: "room-question", text: qa[1] }),
          }).catch(() => {});
        }
        if (!reply.includes("[SILENT]")) await say(reply);
        // Pick up exactly where he was cut off, like a human would.
        if (resume) {
          await new Promise((r) => setTimeout(r, 400));
          speak(`Where was I? Right. ${resume.text}`, resume.after || undefined);
        } else if (!st.ap.running && st.slideNarrated && st.slide === wasSlide && st.layout === "slides" && st.auto && !st.paused && wasSlide + 1 < st.slideCount) {
          presentSlide(wasSlide + 1);
        }
      } catch {
        clearTimeout(t);
      } finally {
        st.roomBusy = false;
      }
    },
    [director, presentSlide, pushStatus, slideText, speak, say, session?.id]
  );

  /* ------------------------------ audience hub ------------------------------ */
  const refreshHub = useCallback(async () => {
    if (!session?.id) return;
    try {
      const t0 = Date.now();
      const data = await api<{ hub: HubState; board: Board; quizKey: number[] }>(`/api/presenter/hub/admin?id=${session.id}`);
      hubRef.current.offset = data.board.serverNow - (t0 + Date.now()) / 2;
      hubRef.current.hub = data.hub;
      hubRef.current.board = data.board;
      setHub(data.hub);
      setBoard(data.board);
      setQuizKey(data.quizKey);
    } catch {
      /* keep the last good state on screen */
    }
  }, [session?.id]);

  // Shree's own lines during the hub: a quick quiz comment every 5 questions, and the finale reveals.
  const hubLines = useCallback(async () => {
    const h = hubRef.current;
    if (s.current.layout !== "hub" || s.current.paused || s.current.speaking || h.busy) return;
    // Generate + speak a line; "busy" lets the autopilot wait for it to finish.
    const line = async (p: Promise<string>) => {
      h.busy = true;
      try {
        await say(await p);
      } finally {
        h.busy = false;
      }
    };
    if (h.hub.phase === "quiz") {
      const c = quizClock(h.hub.quiz, Date.now() + h.offset);
      if (c.status === "leadin" || c.status === "off") h.lastQuizNote = -1;
      const checkpoint = c.status === "reveal" && (c.idx + 1) % 5 === 0 && c.idx + 1 < QUIZ.length ? c.idx : c.status === "done" ? QUIZ.length : -1;
      if (checkpoint >= 0 && checkpoint !== h.lastQuizNote) {
        h.lastQuizNote = checkpoint;
        const pq = h.board?.quiz.perQuestion || [];
        const from = checkpoint === QUIZ.length ? 0 : checkpoint - 4;
        const slice = pq.slice(from, checkpoint === QUIZ.length ? QUIZ.length : checkpoint + 1);
        const answered = slice.reduce((a, b) => a + b.answered, 0);
        const correct = slice.reduce((a, b) => a + b.correct, 0);
        const pct = answered ? Math.round((correct / answered) * 100) : 0;
        const instruction =
          checkpoint === QUIZ.length
            ? `The quiz just ended. Room got about ${pct}% right overall. One or two short sentences: scores are locked, the winner is revealed at the finale. Name nobody.`
            : `Quiz checkpoint after question ${checkpoint + 1} of 30. The room got about ${pct}% of the last five right. Make ONE short, witty sentence (under 15 words) to keep energy up. Don't read questions or answers. Name nobody. The next question starts in 2 seconds.`;
        line(director({ mode: "free", instruction }).catch(() => "[SILENT]"));
      }
    }
    // Game / prediction reveal.
    if (h.hub.phase === "poll" && typeof h.hub.pollReveal === "number" && h.hub.poll) {
      const key = `${h.hub.poll}:${h.hub.pollReveal}`;
      const p = pollByKey(h.hub.poll);
      if (p && key !== h.lastReveal) {
        h.lastReveal = key;
        const counts = h.board?.polls[p.key] || [];
        const votes = p.options.map((o, i) => `${o} = ${counts[i] || 0}`).join("; ");
        const instruction = p.liveResult
          ? `Reveal the prediction result. The room predicted: ${votes}. What actually happened in Shreesha's demo: "${p.options[h.hub.pollReveal]}". In 2 or 3 sentences, react to how the room guessed, then land the lesson: an agent can only act within the information, tools, access and permissions it has; intelligence doesn't grant access. Name nobody.`
          : `Reveal the answer to "${p.q}". Votes: ${votes}. Best answer: "${p.options[h.hub.pollReveal]}". Why: ${p.explain}. In 2 short sentences, react to the vote with light humour and explain why, ending with the idea that AI, HI or notepad: what matters is ROI. Name nobody.`;
        cue("correct");
        await line(director({ mode: "free", instruction }).catch(() => "[SILENT]"));
        return;
      }
    }
    if (h.hub.phase === "wishwall" && h.hub.wishGroups?.length) {
      const key = JSON.stringify(h.hub.wishGroups.map((g) => g.label));
      if (key !== h.lastWish) {
        h.lastWish = key;
        const themes = h.hub.wishGroups.map((g) => `${g.label} (${g.items.length})`).join(", ");
        await line(
          director({
            mode: "free",
            instruction: `The HR Wish Wall is on screen, grouped into themes: ${themes}. In 2 or 3 short sentences: note that different roles share very similar frustrations, with light humour, then say: maybe our first AI opportunity isn't replacing anyone, it's removing some of this repetitive work. Name nobody.`,
          }).catch(() => "[SILENT]")
        );
        return;
      }
    }
    if (h.hub.phase !== "finale") {
      h.lastFinale = 0;
      setFinaleShown(0);
    }
    if (h.hub.phase === "finale") {
      const step = h.hub.finaleStep || 0;
      if (step !== h.lastFinale && step > 0) {
        h.lastFinale = step;
        const lb = h.board?.quiz.leaderboard || [];
        const ann = (i: number, place: string) =>
          lb[i] ? `Announce ${place} place in the quiz: ${lb[i].name}, with ${lb[i].correct} out of 30. Build a little drama, one or two sentences, then congratulate them.` : `There's no ${place} place (not enough players). Say so lightly in one sentence.`;
        const instruction =
          step === 1
            ? ann(2, "third")
            : step === 2
              ? ann(1, "second")
              : step === 3
                ? ann(0, "first. They are tonight's quiz champion")
                : step === 4
                  ? `Reveal the team AI-level chart (counts only): ${(h.board?.assessment.levelCounts || []).map((l) => `${l.name} ${l.count}`).join(", ")}. Two or three sentences: celebrate honestly, then the goal of one level up in 90 days. Everyone's badge is on their phone, private. Name nobody.`
                  : `Compare the before and after poll ("${pollByKey("before")?.q}"): before ${JSON.stringify(h.board?.polls["before"] || [])}, after ${JSON.stringify(h.board?.polls["after"] || [])} for options ${JSON.stringify(pollByKey("before")?.options || [])}. Two sentences, honest.`;
        h.busy = true;
        const lineP = director({ mode: "free", instruction }).catch(() => "[SILENT]");
        if (step <= 3) {
          // Drumroll first, then the name appears and Shree announces it.
          const len = step === 1 ? 1.6 : step === 2 ? 2.2 : 3.2;
          cue("drumroll", { length: len });
          await new Promise((r) => setTimeout(r, len * 1000 + 150));
          setFinaleShown(step);
          if (step === 3) cue("win");
        } else setFinaleShown(step);
        try {
          await say(await lineP);
        } finally {
          h.busy = false;
        }
      }
    }
  }, [director, say]);

  useEffect(() => {
    if (!session?.id) return;
    refreshHub();
    const iv = setInterval(() => {
      refreshHub().then(hubLines);
    }, hub.phase === "quiz" ? 1000 : 2500);
    return () => clearInterval(iv);
  }, [session?.id, refreshHub, hubLines, hub.phase]);

  useEffect(() => {
    if (layout !== "hub") return;
    const iv = setInterval(() => setTick(Date.now()), 200);
    return () => clearInterval(iv);
  }, [layout]);

  /* ------------------------------ sound design ------------------------------ */
  // Music never plays under intros, slides or the debate; it dips under Shree's voice.
  useEffect(() => {
    duck(speaking);
  }, [speaking]);

  const sfx = useRef({ tickSec: -1, tickIdx: -1, correctIdx: -1, phase: "" });
  useEffect(() => {
    if (!armed || layout === "montage") return;
    const clock = hub.phase === "quiz" ? quizClock(hub.quiz, tick + hubRef.current.offset) : null;
    let next: Parameters<typeof setBed>[0] = "off";
    if (layout === "hub") {
      if (hub.phase === "lobby") next = "lobby";
      else if (hub.phase === "quiz") next = clock && clock.status !== "off" && clock.status !== "done" ? "quiz" : "off";
      else if (hub.phase === "assessment") next = "lobby";
      else if (hub.phase === "build") next = "build";
      else if (hub.phase === "commit" || hub.phase === "closed") next = "closing";
    }
    setBed(next);
    // Quiz: ticks in the last 3 seconds, a chime on each answer reveal.
    if (clock && layout === "hub") {
      if (clock.status === "answer" && clock.msLeft <= 3000) {
        const sec = Math.ceil(clock.msLeft / 1000);
        if (sec !== sfx.current.tickSec || clock.idx !== sfx.current.tickIdx) {
          sfx.current.tickSec = sec;
          sfx.current.tickIdx = clock.idx;
          cue("tick");
        }
      }
      if (clock.status === "reveal" && clock.idx !== sfx.current.correctIdx) {
        sfx.current.correctIdx = clock.idx;
        cue("correct");
      }
    }
    // App reveal moment.
    if (hub.phase !== sfx.current.phase) {
      if (hub.phase === "flyer" && layout === "hub") cue("reveal");
      sfx.current.phase = hub.phase;
    }
  }, [armed, layout, hub.phase, hub.quiz, tick]);

  /* ------------------------------ Anam ------------------------------ */
  // Explorer plan caps a conversation at 10 minutes, so we run a relay: at ~8 min
  // a second session warms up silently in a hidden video, and we swap at the end
  // of a sentence. Memory lives in the Director, so the swap is invisible.
  const retiring = useRef<WeakSet<AnamClient>>(new WeakSet());
  const slotRef = useRef(0);
  const [activeSlot, setActiveSlot] = useState(0);
  const relay = useRef<{ standby: AnamClient | null; standbySlot: number; standbyReady: boolean; readyAt: number; standbyReadyAt: number; reconnecting: boolean }>({
    standby: null,
    standbySlot: 1,
    standbyReady: false,
    readyAt: 0,
    standbyReadyAt: 0,
    reconnecting: false,
  });
  const videoEl = (slot: number) => document.getElementById(`twin-video-${slot}`) as HTMLVideoElement | null;

  const openClient = useCallback(
    async (slot: number, asStandby: boolean) => {
      const { sessionToken } = await api<{ sessionToken: string }>("/api/presenter/anam-token", { method: "POST" });
      const client = createAnamClient(sessionToken);
      const isActive = () => anamRef.current === client;
      client.addListener(AnamEvent.CONNECTION_ESTABLISHED, () => {
        if (!isActive()) return;
        setConnected(true);
        pushStatus({ connected: true });
      });
      client.addListener(AnamEvent.SESSION_READY, () => {
        if (relay.current.standby === client) {
          client.muteInputAudio();
          relay.current.standbyReady = true;
          relay.current.standbyReadyAt = Date.now();
          return;
        }
        relay.current.readyAt = Date.now();
        setNote("");
        if (!s.current.micOn) client.muteInputAudio();
      });
      client.addListener(AnamEvent.MESSAGE_STREAM_EVENT_RECEIVED, (ev) => {
        if (isActive() && ev.role === "persona" && ev.endOfSpeech) markSpeechDone();
      });
      client.addListener(AnamEvent.TALK_STREAM_INTERRUPTED, () => {
        if (isActive()) onTalkInterruptedRef.current();
      });
      client.addListener(AnamEvent.MESSAGE_HISTORY_UPDATED, (messages) => {
        if (!isActive()) return;
        const last = [...messages].reverse().find((m) => m.role === "user");
        if (!last || seenMsgIds.current.has(last.id)) return;
        seenMsgIds.current.add(last.id);
        onRoomSpeech(last.content);
      });
      client.addListener(AnamEvent.CONNECTION_CLOSED, (reason) => {
        if (retiring.current.has(client)) return;
        if (relay.current.standby === client) {
          relay.current.standby = null;
          relay.current.standbyReady = false;
          return;
        }
        if (!isActive()) return;
        anamRef.current = null;
        setConnected(false);
        markSpeechDone();
        pushStatus({ connected: false });
        // Unplanned drop: promote a warm standby if we have one, else reconnect.
        const r = relay.current;
        if (r.standby && r.standbyReady) {
          promoteStandby();
        } else {
          setNote(`Reconnecting (${String(reason)})…`);
          setTimeout(() => connectTwinRef.current(), 800);
        }
      });
      if (asStandby) {
        relay.current.standby = client;
        relay.current.standbySlot = slot;
        relay.current.standbyReady = false;
      } else {
        anamRef.current = client;
      }
      const v = videoEl(slot);
      if (v) v.muted = asStandby;
      await client.streamToVideoElement(`twin-video-${slot}`);
      return client;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [markSpeechDone, onRoomSpeech, pushStatus]
  );

  const promoteStandby = useCallback(() => {
    const r = relay.current;
    const next = r.standby;
    if (!next || !r.standbyReady) return false;
    const old = anamRef.current;
    if (old) retiring.current.add(old);
    anamRef.current = next;
    slotRef.current = r.standbySlot;
    setActiveSlot(r.standbySlot);
    const v = videoEl(r.standbySlot);
    if (v) v.muted = false;
    if (s.current.micOn) next.unmuteInputAudio();
    r.readyAt = r.standbyReadyAt || Date.now();
    r.standby = null;
    r.standbyReady = false;
    setConnected(true);
    pushStatus({ connected: true });
    if (old) setTimeout(() => old.stopStreaming().catch(() => {}), 400);
    return true;
  }, [pushStatus]);

  const connectTwin = useCallback(async () => {
    if (anamRef.current || relay.current.reconnecting) return;
    relay.current.reconnecting = true;
    setNote("Connecting the twin…");
    try {
      await openClient(slotRef.current, false);
      setActiveSlot(slotRef.current);
    } catch (err) {
      anamRef.current = null;
      setNote(err instanceof Error ? `Twin error: ${err.message}` : "Twin error");
    } finally {
      relay.current.reconnecting = false;
    }
  }, [openClient]);
  const connectTwinRef = useRef(connectTwin);
  connectTwinRef.current = connectTwin;

  const disconnectTwin = useCallback(async () => {
    const c = anamRef.current;
    const sb = relay.current.standby;
    relay.current.standby = null;
    relay.current.standbyReady = false;
    if (sb) {
      retiring.current.add(sb);
      sb.stopStreaming().catch(() => {});
    }
    if (!c) return;
    retiring.current.add(c);
    anamRef.current = null;
    await c.stopStreaming().catch(() => {});
    setConnected(false);
    pushStatus({ connected: false });
  }, [pushStatus]);

  // Relay watchdog: pre-warm at 8 min, swap between sentences after 9 min, force at 9 min 40 s.
  useEffect(() => {
    const PREWARM = 8 * 60_000;
    const SWAP = 9 * 60_000;
    const FORCE = 9 * 60_000 + 40_000;
    const iv = setInterval(async () => {
      const r = relay.current;
      if (!anamRef.current || !r.readyAt) return;
      const age = Date.now() - r.readyAt;
      if (age > PREWARM && !r.standby) {
        try {
          await openClient(1 - slotRef.current, true);
        } catch {
          r.standby = null;
        }
        return;
      }
      if (r.standby && r.standbyReady) {
        if (age > SWAP && !s.current.speaking && !s.current.busy) promoteStandby();
        else if (age > FORCE) {
          // Out of time: finish on the fresh session.
          anamRef.current?.interruptPersona();
          const said = s.current.lastSaid;
          promoteStandby();
          if (s.current.speaking && said) {
            s.current.speaking = false;
            setTimeout(() => anamRef.current?.talk("Where was I? Right.").catch(() => {}), 300);
          }
        }
      }
    }, 3000);
    return () => clearInterval(iv);
  }, [openClient, promoteStandby]);

  /* ------------------------------ commands ------------------------------ */
  const handle = useCallback(
    async (cmd: PresenterCommand) => {
      const st = s.current;
      // Any new instruction cancels a slide narration still being prepared.
      if (!["mic", "auto", "reconnect", "sound", "cue", "echo", "ap", "entrance-test", "entrance-sens", "hub"].includes(cmd.type)) {
        st.gen++;
        st.manualInterrupt = Date.now();
        try {
          window.speechSynthesis?.cancel();
        } catch {}
      }
      switch (cmd.type) {
        case "wake":
          setLayoutBoth("twin");
          await connectTwin();
          break;
        case "standby":
          anamRef.current?.interruptPersona();
          setLayoutBoth("standby");
          break;
        case "start": {
          stopEntranceRef.current();
          if (!st.entrance) st.entrance = "button";
          // Snap hit → 30 s montage (twin connects behind it) → Shree appears and opens.
          cue("snap");
          setBed("montage");
          setLayoutBoth("montage");
          setMontage(true);
          const linePromise = director({
            mode: "free",
            instruction:
              "You have just appeared on screen after a cinematic montage; Shreesha introduced you and snapped his fingers to bring you in. Open with high energy in 4 to 6 short sentences: a light, friendly comeback to Shreesha (for example, that unlike him you didn't need three cups of filter coffee to get here), greet everyone (good evening), introduce yourself as Shree, Shreesha's digital twin, and say tonight is not a lecture, it's interactive: their phones are their remote (they have already joined). Give a one-line movie-trailer agenda: a quiz, a mirror, a story, a live app build, and a winner. End by saying the first vote is on their phones now. Under 40 seconds.",
          }).catch(() => "Good evening everyone! I'm Shree, Shreesha's digital twin. Tonight isn't a lecture, it's interactive, and your phone is your remote. The first vote is on your phones now.");
          const connecting = connectTwin();
          await new Promise<void>((r) => (montageDone.current = r));
          setMontage(false);
          setBed("off");
          await connecting;
          cue("reveal");
          setLayoutBoth("twin");
          await new Promise((r) => setTimeout(r, 900));
          await say(await linePromise);
          // Autopilot: the rest of the show runs by itself from here.
          if (st.ap.on && !st.ap.running) runShowRef.current(0);
          break;
        }
        case "skip-montage":
          montageDone.current?.();
          break;
        case "sound":
          if (typeof cmd.volume === "number") setVolume(cmd.volume);
          if (typeof cmd.muted === "boolean") setMuted(cmd.muted);
          pushStatus();
          break;
        case "cue":
          cue(cmd.cue);
          break;
        case "present":
          setLayoutBoth("slides");
          st.paused = false;
          presentSlide(st.slide);
          break;
        case "next":
        case "prev":
        case "goto": {
          anamRef.current?.interruptPersona();
          st.pendingAfterSpeech = null;
          const n = cmd.type === "goto" ? cmd.idx : st.slide + (cmd.type === "next" ? 1 : -1);
          const idx = Math.max(0, Math.min(st.slideCount - 1, n));
          setLayoutBoth("slides");
          st.busy = false;
          presentSlide(idx);
          break;
        }
        case "pause":
          if (!st.paused) st.ap.pausedAt = Date.now();
          st.paused = true;
          st.pendingAfterSpeech = null;
          anamRef.current?.interruptPersona();
          pushStatus();
          break;
        case "resume": {
          if (st.paused && st.ap.pausedAt) st.ap.pausedMs += Date.now() - st.ap.pausedAt;
          st.ap.pausedAt = 0;
          st.paused = false;
          pushStatus();
          const back = st.layout === "handover";
          if (back) setLayoutBoth("twin");
          if (!anamRef.current) await connectTwin();
          if (back && st.ap.waitResume) st.ap.waitResume();
          else if (st.layout === "slides" && !st.slideNarrated) presentSlide(st.slide);
          break;
        }
        case "echo":
          st.echo = cmd.mode;
          micState.current = null;
          applyMic();
          pushStatus();
          break;
        case "ap":
          if (cmd.action === "on" || cmd.action === "off") {
            st.ap.on = cmd.action === "on";
            if (!st.ap.on) {
              st.ap.gen++;
              st.ap.running = false;
              st.auto = true;
            }
          }
          else if (cmd.action === "skip") {
            st.ap.skip = true;
            anamRef.current?.interruptPersona();
            st.ap.waitResume?.();
          } else if (cmd.action === "stop") {
            st.ap.gen++;
            st.ap.running = false;
            st.auto = true;
            st.ap.label = "Autopilot stopped";
          } else if (cmd.action === "back" || cmd.action === "start") {
            const target = cmd.action === "back" ? Math.max(0, st.ap.idx - 1) : cmd.idx ?? Math.max(0, st.ap.idx);
            st.ap.gen++;
            anamRef.current?.interruptPersona();
            st.ap.waitResume?.();
            st.ap.on = true;
            setTimeout(() => runShowRef.current(target), 300);
          }
          pushStatus();
          break;
        case "stop":
          st.pendingAfterSpeech = null;
          anamRef.current?.interruptPersona();
          markSpeechDone();
          break;
        case "say":
          transcript.current.push({ role: "shreesha", text: `(direction) say: ${cmd.text}` });
          speak(cmd.text);
          break;
        case "direct": {
          transcript.current.push({ role: "shreesha", text: `(private direction) ${cmd.text}` });
          const say = await director({ mode: "direct", instruction: cmd.text, slideIdx: st.slide, slideText: await slideText(st.slide) });
          if (!say.includes("[SILENT]")) {
            anamRef.current?.interruptPersona();
            speak(say);
          }
          break;
        }
        case "intros":
          st.intros = cmd.on;
          pushStatus();
          break;
        case "entrance-test":
          st.entranceTest = cmd.on;
          st.testHit = "";
          if (cmd.on && !anamRef.current) startEntranceRef.current();
          if (!cmd.on && st.layout !== "standby") stopEntranceRef.current();
          pushStatus();
          break;
        case "entrance-sens":
          st.sens = cmd.level;
          if (st.listening) st.listening = { ...st.listening, sens: cmd.level };
          pushStatus();
          break;
        case "mic":
          st.micOn = cmd.on;
          if (anamRef.current) {
            if (cmd.on) anamRef.current.unmuteInputAudio();
            else anamRef.current.muteInputAudio();
          }
          pushStatus();
          break;
        case "layout":
          if (cmd.layout === "handover") {
            anamRef.current?.interruptPersona();
            st.paused = true;
            // Act 7: disconnect after a moment to save Anam minutes; "Resume" reconnects.
            setTimeout(() => {
              if (s.current.layout === "handover") disconnectTwin();
            }, 4000);
          }
          setLayoutBoth(cmd.layout);
          if (cmd.layout === "slides") drawSlide(st.slide);
          break;
        case "auto":
          st.auto = cmd.on;
          pushStatus();
          break;
        case "reconnect":
          await disconnectTwin();
          await connectTwin();
          break;
        case "flyer-build": {
          if (building.current) break;
          building.current = true;
          setBuildText("");
          setLayoutBoth("hub");
          // Runs in the background: the presentation never waits for it.
          (async () => {
            try {
              const res = await fetch("/api/presenter/flyer", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: session?.id, inputs: cmd.inputs }),
              });
              if (!res.body) throw new Error("no stream");
              const reader = res.body.getReader();
              const dec = new TextDecoder();
              let acc = "";
              for (;;) {
                const { value, done } = await reader.read();
                if (done) break;
                acc += dec.decode(value, { stream: true });
                setBuildText(acc.length > 20000 ? acc.slice(-20000) : acc);
              }
            } catch {
              /* backup app covers this */
            } finally {
              building.current = false;
              refreshHub();
            }
          })();
          await refreshHub();
          speak(
            await director({
              mode: "free",
              instruction: `The room gave the flyer details: "${cmd.inputs.name}", ${cmd.inputs.date}, at ${cmd.inputs.venue}, highlights: ${cmd.inputs.highlights.join("; ")}. Say you've just handed the instruction to an AI and the build has started on screen. In 3 or 4 short sentences explain vibe coding: describe the app in plain English, the AI writes the code, a human checks it. Then say that before Shreesha shows you a real AI agent, there's one quick prediction to make.`,
            }).catch(() => "[SILENT]")
          );
          break;
        }
        case "hub":
          await refreshHub();
          if (st.layout !== "hub") {
            st.pendingAfterSpeech = null;
            setLayoutBoth("hub");
          }
          break;
      }
    },
    [connectTwin, director, disconnectTwin, drawSlide, markSpeechDone, presentSlide, pushStatus, refreshHub, setLayoutBoth, slideText, speak]
  );

  const handleRef = useRef(handle);
  handleRef.current = handle;

  /* ------------------------------ boot ------------------------------ */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const q = sessionId ? `?id=${sessionId}` : "";
        const { session: sess } = await api<{ session: Session }>(`/api/presenter/session${q}`);
        if (cancelled) return;
        setSession(sess);
        const urls = await api<{ deck: string | null; notes: string | null }>(`/api/presenter/deck?sessionId=${sess.id}`);
        if (urls.deck) {
          deckRef.current = await openPdf(urls.deck);
          s.current.slideCount = deckRef.current.numPages;
          setSlideCount(deckRef.current.numPages);
        } else setNote("No deck uploaded yet — upload it in the console.");
        if (urls.notes) notesRef.current = await openPdf(urls.notes).catch(() => null);
        // Give the phone agent the deck + notes text (background, best effort).
        (async () => {
          const n = deckRef.current?.numPages || notesRef.current?.numPages || 0;
          if (!n) return;
          const slides: Array<{ body: string; notes: string }> = [];
          for (let i = 0; i < n; i++) {
            const body = deckRef.current && i < deckRef.current.numPages ? await pageText(deckRef.current, i + 1).catch(() => "") : "";
            const notes = notesRef.current && i < notesRef.current.numPages ? await pageText(notesRef.current, i + 1).catch(() => "") : "";
            slides.push({ body, notes });
          }
          await api("/api/presenter/hub/admin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: sess.id, action: "slides", slides }),
          }).catch(() => {});
        })();
        const ch = presenterChannel(sess.id);
        ch.on("broadcast", { event: "cmd" }, ({ payload }) => handleRef.current(payload as PresenterCommand));
        ch.on("broadcast", { event: "ping" }, () => pushStatus());
        ch.subscribe();
        chanRef.current = ch;
      } catch (err) {
        setNote(err instanceof Error ? err.message : "Could not load the session");
      }
    })();
    return () => {
      cancelled = true;
      chanRef.current?.unsubscribe();
      anamRef.current?.stopStreaming().catch(() => {});
    };
  }, [sessionId, pushStatus]);

  useEffect(() => {
    if (layout === "slides") drawSlide(slide);
  }, [layout, slide, drawSlide]);

  useEffect(() => {
    const onResize = () => s.current.layout === "slides" && drawSlide(s.current.slide);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [drawSlide]);

  /* ------------------------------ autopilot ------------------------------ */
  // Runs the whole show in order after the opening. Each step ends when it's done
  // or its time budget runs out. Interruptions are handled by onRoomSpeech; the
  // autopilot simply waits until the room and Shree are quiet before moving on.
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const adminAct = useCallback(
    async (body: Record<string, unknown>) => {
      if (!session?.id) return null;
      const d = await api<{ hub?: HubState }>("/api/presenter/hub/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: session.id, ...body }),
      }).catch(() => null);
      await refreshHub();
      return d;
    },
    [session?.id, refreshHub]
  );

  const runShow = useCallback(
    async (from: number) => {
      const ap = s.current.ap;
      const gen = ++ap.gen;
      ap.running = true;
      if (!ap.showStart) ap.showStart = Date.now();
      s.current.auto = false; // the autopilot advances slides itself
      const H = () => hubRef.current;
      const alive = () => ap.gen === gen && !ap.skip;
      const people = () => H().board?.attendees.length || 0;
      const votes = (k: string) => (H().board?.polls[k] || []).reduce((a, b) => a + b, 0);
      // Wait up to ms (paused time doesn't count) or until cond() is true.
      const wait = async (ms: number, cond?: () => boolean) => {
        const t0 = Date.now();
        let paused = 0;
        while (alive()) {
          if (s.current.paused) {
            await sleep(300);
            paused += 300;
            continue;
          }
          if (cond && cond()) return true;
          if (Date.now() - t0 - paused >= ms) return false;
          await sleep(300);
        }
        return false;
      };
      const quiet = () => !s.current.speaking && !s.current.roomBusy && !s.current.busy && !H().busy && !s.current.resume;
      const settle = (ms = 90_000) => wait(ms, quiet);
      const line = async (instruction: string) => {
        await settle();
        if (!alive()) return;
        const text = await director({ mode: "free", instruction }).catch(() => "");
        if (alive() && text) await say(text);
      };
      const hubView = () => {
        if (s.current.layout !== "hub") setLayoutBoth("hub");
      };
      const pollRun = async (key: string, ms: number, intro?: string | true, read?: string) => {
        const p = pollByKey(key);
        if (!p) return;
        await adminAct({ action: "phase", phase: "poll", poll: key });
        hubView();
        if (intro) await line(typeof intro === "string" ? intro : `Open the vote "${p.q}" in one short, lively sentence: everyone votes on their phones now.`);
        await wait(ms, () => people() > 0 && votes(key) >= people());
        if (!alive()) return;
        if (typeof p.best === "number") {
          H().lastReveal = "";
          await adminAct({ action: "poll-reveal", best: p.best });
          await wait(25_000, () => H().lastReveal === `${key}:${p.best}` && quiet());
        } else if (read) {
          const c = H().board?.polls[key] || [];
          await line(`${read} The votes: ${p.options.map((o, i) => `${o} = ${c[i] || 0}`).join("; ")}.`);
        }
      };

      const STEP: Record<string, (budget: number) => Promise<void>> = {
        before: async (b) => {
          await pollRun("before", Math.min(b - 15_000, 40_000), undefined, `Read the result of "${pollByKey("before")?.q}" in one light sentence and say we'll ask again at the end.`);
        },
        intros: async (b) => {
          setLayoutBoth("twin");
          s.current.intros = true;
          await line("Start the introductions now: invite each person, one at a time, to say their name and one task they wish they never had to do again, in about 20 seconds. Ask for the first volunteer.");
          const t0 = Date.now();
          let lastNudge = Date.now();
          const all = () => {
            const a = H().board?.attendees || [];
            return a.length > 0 && a.filter((x) => x.spoken).length >= a.length;
          };
          while (alive() && Date.now() - t0 < b - 25_000 && !all()) {
            await wait(1000);
            const silentFor = Date.now() - Math.max(s.current.lastRoomAt, s.current.lastSpeechEnd);
            if (quiet() && silentFor > 18_000 && Date.now() - lastNudge > 18_000) {
              lastNudge = Date.now();
              await line("The room has gone quiet during introductions. In one warm sentence, invite the next person who hasn't introduced themselves yet (no names unless certain).");
            }
          }
          s.current.intros = false;
          await line("Wrap up the introductions in one sentence and say: let's see what we have in common.");
        },
        wishwall: async () => {
          H().lastWish = "";
          await adminAct({ action: "wishwall" });
          hubView();
          await wait(45_000, () => H().lastWish !== "" && quiet());
          await wait(4000);
        },
        quiz: async (b) => {
          await adminAct({ action: "phase", phase: "quiz" });
          hubView();
          await line("Introduce the quickfire quiz in two short, high-energy sentences: 30 questions, 7 seconds each, phones ready, the winner is revealed at the end.");
          if (!alive()) return;
          await adminAct({ action: "quiz-start" });
          await wait(b, () => quizClock(H().hub.quiz, Date.now() + H().offset).status === "done");
          if (!alive() && !ap.skip) return;
          if (ap.skip) await adminAct({ action: "quiz-stop" });
          await settle(20_000);
          await wait(2500);
        },
        mirror: async (b) => {
          await adminAct({ action: "phase", phase: "assessment" });
          hubView();
          await line("Introduce the Mirror in 2 or 3 sentences: 20 questions on their phones, about 5 minutes, pick the highest statement that's true today, honest beats impressive, it's private and the level is revealed at the end.");
          const done = () => people() > 0 && (H().board?.assessment.completed || 0) >= people();
          await wait(b - 60_000, done);
          if (alive() && !done()) {
            await line("One short, friendly sentence: one more minute for the self-assessment.");
            await wait(50_000, done);
          }
          await line("Thank everyone in one sentence; levels are revealed at the finale. Then say: now, the story.");
        },
        story: async (b) => {
          // Present every Story slide up to the live-build slide; open Polls 1 and 2 where the deck says so.
          let end = Math.min(16, s.current.slideCount || 16);
          for (let i = 0; i < (s.current.slideCount || 0); i++) {
            if (/FLYER CHALLENGE|WE BUILD AN APP/i.test(await slideText(i))) {
              end = i;
              break;
            }
          }
          const t0 = Date.now();
          for (let i = 0; i < end && alive(); i++) {
            if (Date.now() - t0 > b) {
              await line("We're short on time: wrap up the story in one sentence and move on.");
              break;
            }
            setLayoutBoth("slides");
            await settle();
            presentSlide(i);
            await wait(150_000, () => s.current.slide === i && s.current.slideNarrated && quiet());
            const txt = await slideText(i);
            if (/POLL\s*1/i.test(txt)) await pollRun("poll1", 35_000, true, "Read the result in one sentence and connect it to the 3-check test.");
            if (/POLL\s*2/i.test(txt)) await pollRun("poll2", 35_000, true, "Read the result in one sentence: the most popular first task.");
          }
        },
        game: async () => {
          await line("Introduce a quick game in one sentence: AI, HI or notepad? Three quick questions on your phones.");
          for (const k of ["game-1", "game-2", "game-3"]) if (alive()) await pollRun(k, 30_000, true);
        },
        debate: async (b) => {
          await pollRun(
            "debate",
            Math.min(45_000, b / 3),
            "Present the debate in 2 or 3 sentences: a 300-employee company, will AI agents replace jobs or redesign them? Side A: jobs will shrink. Side B: jobs will be redesigned. Everyone votes on their phones now."
          );
          if (!alive()) return;
          const c = H().board?.polls["debate"] || [];
          await line(`Read the debate vote (replace = ${c[0] || 0}, redesign = ${c[1] || 0}) in one sentence, then invite one person from each side to say why, in a sentence each. Moderate warmly.`);
          const t0 = Date.now();
          await wait(70_000, () => s.current.lastRoomAt > t0 && Date.now() - s.current.lastRoomAt > 14_000 && quiet());
          await line("Close the debate in 2 or 3 balanced sentences: neither outcome is guaranteed; what decides it is process redesign, skills, governance and human judgement. At 300 people the real risk isn't replacement, it's competitors with AI-skilled teams doing more with the same headcount.");
        },
        build: async () => {
          let end = -1;
          for (let i = 0; i < (s.current.slideCount || 0); i++) if (/FLYER CHALLENGE/i.test(await slideText(i))) end = i;
          if (end >= 0) {
            setLayoutBoth("slides");
            s.current.slide = end;
            setSlide(end);
            drawSlide(end);
          } else setLayoutBoth("twin");
          await line("Introduce the live build in 2 or 3 sentences: we'll build a real app from the room's ideas, nobody writes code. Ask the room to call out four things: an event name, a date and time, a venue, and three highlights.");
          let inputs: { name: string | null; date: string | null; venue: string | null; highlights: string[] } = { name: null, date: null, venue: null, highlights: [] };
          const missing = () => [!inputs.name && "the event name", !inputs.date && "a date and time", !inputs.venue && "a venue", inputs.highlights.length < 3 && `${3 - inputs.highlights.length} more highlight${inputs.highlights.length === 2 ? "" : "s"}`].filter(Boolean) as string[];
          s.current.expect = async (heard) => {
            const r = await api<{ inputs?: typeof inputs }>("/api/presenter/extract", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ kind: "flyer", heard, current: inputs }),
            }).catch(() => null);
            if (!r?.inputs) return false;
            inputs = r.inputs;
            const m = missing();
            if (m.length) await say(`Love it. Now ${m.join(", ")}?`);
            return true;
          };
          await wait(75_000, () => missing().length === 0);
          s.current.expect = null;
          if (!alive()) return;
          if (missing().length) {
            const p = FLYER_PRESETS[0].inputs;
            inputs = { name: inputs.name || p.name, date: inputs.date || p.date, venue: inputs.venue || p.venue, highlights: [...inputs.highlights, ...p.highlights].slice(0, 3) };
            await say("Let me fill in the gaps with one of my own ideas.");
          }
          // Claude Code on the laptop builds and deploys it (Shreesha types "build and deploy").
          await adminAct({ action: "flyer-inputs", inputs });
          hubView();
          await say(`Here's our brief: ${inputs.name}, on ${inputs.date}, at ${inputs.venue}, with ${inputs.highlights.join(", ")}. Shreesha, over to Claude. Tell it: build and deploy.`);
          await wait(12_000);
          await line(
            "While Claude Code builds the app on the laptop, explain vibe coding in 3 or 4 short sentences: we describe the app in plain English, the AI writes the code and publishes it, and a human checks it. Then say we'll open the app on everyone's phone right after Shreesha's demo."
          );
          const isLive = () => H().hub.flyerBuild?.status === "ready";
          await wait(240_000, isLive);
          if (isLive()) {
            const fb = H().hub.flyerBuild!;
            const secs = fb.finishedAt ? Math.round((fb.finishedAt - fb.startedAt) / 1000) : null;
            cue("correct");
            await line(`The app Claude just built is live${secs ? ` (built and deployed in ${Math.floor(secs / 60)} minutes ${secs % 60} seconds; quote it)` : ""}. One excited sentence, then: Shreesha, bring me back on screen.`);
          } else await line("One sentence: Claude is still finishing the app; we'll check on it right after Shreesha's demo.");
        },
        predict: async () => {
          await pollRun("predict", 30_000, "One or two sentences: before Shreesha shows you a real AI agent, predict on your phones: will it finish the task on its own, need a human, or get blocked?");
          const c = H().board?.polls["predict"] || [];
          await line(`One sentence on the predictions (${(pollByKey("predict")?.options || []).map((o, i) => `${o} = ${c[i] || 0}`).join("; ")}), then hand over: "Shreesha, over to you."`);
        },
        handover: async () => {
          handleRef.current({ type: "layout", layout: "handover" });
          ap.waiting = "Say “Hey Shree, we're back” or tap Resume";
          pushStatus();
          await new Promise<void>((resolve) => {
            ap.waitResume = resolve;
            const iv = setInterval(() => {
              if (!alive()) {
                clearInterval(iv);
                resolve();
              }
            }, 500);
          });
          ap.waitResume = null;
          ap.waiting = "";
          pushStatus();
        },
        back: async () => {
          setLayoutBoth("twin");
          if (!anamRef.current) connectTwin();
          await wait(20_000, () => !!anamRef.current);
          await line("Welcome everyone back warmly in one or two sentences, then ask Shreesha: so, how did the agent do? Did it finish on its own, need a human, or get blocked?");
          const options = pollByKey("predict")?.options || [];
          let result: number | null = null;
          s.current.expect = async (heard) => {
            const r = await api<{ index: number | null }>("/api/presenter/extract", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ kind: "choice", heard, options }),
            }).catch(() => null);
            if (r && typeof r.index === "number") {
              result = r.index;
              return true;
            }
            return false;
          };
          await wait(45_000, () => result !== null || typeof H().hub.pollReveal === "number");
          s.current.expect = null;
          if (!alive()) return;
          const chosen = result !== null ? result : typeof H().hub.pollReveal === "number" ? H().hub.pollReveal : null;
          if (chosen === null) return;
          await adminAct({ action: "phase", phase: "poll", poll: "predict" });
          H().lastReveal = "";
          await adminAct({ action: "poll-reveal", best: chosen });
          hubView();
          await wait(30_000, () => H().lastReveal === `predict:${chosen}` && quiet());
        },
        reveal: async () => {
          const fb = H().hub.flyerBuild;
          // Live build only if Claude built and published it; otherwise the tested backup (no build-time claim).
          const live = fb?.status === "ready" && (fb.provider === "claude" || fb.provider === "claude-code");
          const path = live ? `/flyer-ai?code=${session?.code}` : backupFlyerUrl(fb?.inputs || FLYER_PRESETS[0].inputs);
          await adminAct({ action: "flyer-url", url: `${window.location.origin}${path}` });
          await adminAct({ action: "phase", phase: "flyer" });
          hubView();
          const secs = live && fb?.finishedAt ? Math.round((fb.finishedAt - fb.startedAt) / 1000) : null;
          await line(`The app is ready${secs ? ` (it was built in ${Math.floor(secs / 60)} minutes ${secs % 60} seconds, quote that)` : ""}. In 2 or 3 sentences: everyone scans the QR code, makes a flyer for the event, and shares it. You have 90 seconds.`);
          await wait(90_000);
          for (const k of ["check-fact", "check-value", "check-roi"]) if (alive()) await pollRun(k, 25_000, true, "Read the result in one short sentence.");
        },
        qa: async (b) => {
          await adminAct({ action: "phase", phase: "questions" });
          hubView();
          await line("Open Q&A in one or two sentences: ask out loud or on your phones, no question is too basic.");
          const t0 = Date.now();
          let quietRounds = 0;
          while (alive() && Date.now() - t0 < b - 25_000) {
            await settle();
            const q = (H().board?.questions || []).find((x) => x.status === "open");
            if (q) {
              quietRounds = 0;
              await adminAct({ action: "question-status", qid: q.id, status: "answered" });
              let ans = await director({
                mode: "free",
                instruction: `Answer this audience question in about 30 seconds, plain spoken English: "${q.text}". If it's about building apps, tool setup or Shreesha's agent demo, don't answer it: say warmly that this one is for Shreesha, and end with the tag [SHREESHA].`,
              }).catch(() => "");
              const toShreesha = /\[SHREESHA\]/i.test(ans);
              ans = ans.replace(/\[SHREESHA\]/gi, "").trim();
              await say(ans);
              if (toShreesha) {
                s.current.quietListen = true;
                const t1 = Date.now();
                await wait(75_000, () => s.current.lastRoomAt > t1 && Date.now() - s.current.lastRoomAt > 8000);
                s.current.quietListen = false;
                await line("One short sentence thanking Shreesha and inviting the next question.");
              }
            } else {
              quietRounds++;
              await wait(15_000, () => (H().board?.questions || []).some((x) => x.status === "open"));
              if (quietRounds === 2) await line("The room is quiet. Ask: what would stop you from trying one thing tomorrow? One sentence.");
              if (quietRounds >= 4) break;
            }
          }
          await line("Wrap up Q&A in one sentence: any question we didn't get to, Shreesha will follow up in the team's WhatsApp group.");
        },
        finale: async () => {
          await adminAct({ action: "phase", phase: "finale" });
          hubView();
          await line("One high-energy sentence: it's finale time, starting with tonight's quiz champions.");
          for (const step of [1, 2, 3, 4]) {
            if (!alive()) return;
            await adminAct({ action: "finale-step", step });
            await wait(30_000, () => H().lastFinale === step && quiet());
            await wait(1500);
          }
          await pollRun("after", 30_000, "One sentence: last vote, the same question as the start. How confident are you using AI in your daily work now?");
          await adminAct({ action: "phase", phase: "finale" });
          await adminAct({ action: "finale-step", step: 5 });
          hubView();
          await wait(30_000, () => H().lastFinale === 5 && quiet());
        },
        close: async () => {
          await adminAct({ action: "phase", phase: "commit" });
          hubView();
          await line("In 2 or 3 sentences: invite everyone to read the pledge on screen together, out loud, then type their one 30-day commitment on their phones.");
          await wait(75_000, () => people() > 0 && (H().board?.commitments.length || 0) >= people());
          await line("Invite one or two volunteers to share their commitment out loud. One sentence.");
          const t0 = Date.now();
          await wait(45_000, () => s.current.lastRoomAt > t0 && Date.now() - s.current.lastRoomAt > 10_000 && quiet());
          setLayoutBoth("twin");
          await line(
            "Shreesha now asks you: after 75 minutes with our P&C team, what is the one thing you want them to remember? Answer in your own words in 3 to 5 warm, memorable sentences (you don't need to be a tech expert; spot the problem, ask better questions, check the answer; use AI where it creates value, human judgement where it matters, a notepad when that's enough), ending with: AI, HI or notepad: what matters is ROI. Then say the last word belongs to Shreesha."
          );
          await adminAct({ action: "phase", phase: "closed" });
          hubView();
        },
      };

      for (let i = Math.max(0, from); i < SHOW_STEPS.length; i++) {
        if (ap.gen !== gen) return;
        ap.skip = false;
        ap.idx = i;
        ap.label = SHOW_STEPS[i].label;
        ap.budget = SHOW_STEPS[i].budget;
        ap.stepStart = Date.now();
        ap.waiting = "";
        pushStatus();
        try {
          await STEP[SHOW_STEPS[i].id](SHOW_STEPS[i].budget * 1000);
        } catch (err) {
          console.error("[autopilot]", SHOW_STEPS[i].id, err);
        }
        s.current.expect = null;
        s.current.quietListen = false;
        s.current.intros = false;
      }
      if (ap.gen === gen) {
        ap.running = false;
        s.current.auto = true;
        ap.label = "Show complete";
        ap.idx = SHOW_STEPS.length;
        pushStatus();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [adminAct, connectTwin, director, drawSlide, presentSlide, pushStatus, say, setLayoutBoth, slideText, session?.code]
  );
  const runShowRef = useRef(runShow);
  runShowRef.current = runShow;
  // Keep Shreesha's dashboard clock fresh while the autopilot runs.
  useEffect(() => {
    const iv = setInterval(() => s.current.ap.running && pushStatus(), 2000);
    return () => clearInterval(iv);
  }, [pushStatus]);

  /* ------------------------------ dark-screen entrance ------------------------------ */
  // While the TV is dark, the laptop mic listens for (1) a finger snap and
  // (2) "Hey Shree" / "Hey bro, come in front". Whichever fires first brings
  // Shree in; the phone button is always the last backup.
  const entranceRef = useRef<{ stream: MediaStream | null; ctx: AudioContext | null; iv: ReturnType<typeof setInterval> | null; rec: any; active: boolean }>({
    stream: null,
    ctx: null,
    iv: null,
    rec: null,
    active: false,
  });

  const stopEntrance = useCallback(() => {
    const e = entranceRef.current;
    e.active = false;
    if (e.iv) clearInterval(e.iv);
    e.iv = null;
    try {
      e.rec?.stop();
    } catch {}
    e.rec = null;
    e.stream?.getTracks().forEach((t) => t.stop());
    e.stream = null;
    e.ctx?.close().catch(() => {});
    e.ctx = null;
    if (s.current.listening) {
      s.current.listening = null;
      pushStatus();
    }
  }, [pushStatus]);

  const fireEntrance = useCallback(
    (how: "snap" | "voice", detail: string) => {
      const st = s.current;
      if (st.entranceTest) {
        st.testHit = `${how === "snap" ? "Snap" : "Voice"} detected ${detail}`;
        pushStatus();
        return;
      }
      if (st.layout === "handover") {
        // Back from Shreesha's demo: "Hey Shree, we're back".
        stopEntrance();
        handleRef.current({ type: "resume" });
        return;
      }
      if (st.layout !== "standby" || anamRef.current) return;
      st.entrance = how;
      stopEntrance();
      handleRef.current({ type: "start" });
    },
    [pushStatus, stopEntrance]
  );

  const startEntrance = useCallback(async () => {
    const e = entranceRef.current;
    if (e.active) return;
    e.active = true;
    let snap = false;
    let voice = false;
    // (1) Snap: short, sharp, high-frequency burst that dies away fast.
    // Not after the demo: applause would trigger it. Voice or button only there.
    if (s.current.layout !== "handover") try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      if (!e.active) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 1800;
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      src.connect(hp);
      hp.connect(an);
      const buf = new Float32Array(an.fftSize);
      let baseline = 0.02;
      let cand: { at: number; peak: number; loud: number } | null = null;
      let lastFire = 0;
      e.stream = stream;
      e.ctx = ctx;
      e.iv = setInterval(() => {
        an.getFloatTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
        const now = performance.now();
        const t = { low: { min: 0.32, ratio: 8 }, med: { min: 0.18, ratio: 6 }, high: { min: 0.1, ratio: 4.5 } }[s.current.sens];
        if (cand) {
          if (peak > cand.peak * 0.5) cand.loud++;
          if (cand.loud >= 4) cand = null; // stayed loud: speech, music or a cough
          else if (now - cand.at > 90) {
            const strength = cand.peak;
            cand = null;
            if (now - lastFire > 1500) {
              lastFire = now;
              fireEntrance("snap", `(strength ${strength.toFixed(2)})`);
            }
          }
          return;
        }
        if (peak > t.min && peak > baseline * t.ratio) cand = { at: now, peak, loud: 0 };
        else baseline = baseline * 0.97 + Math.max(peak, 0.005) * 0.03;
      }, 10);
      snap = true;
    } catch {
      snap = false;
    }
    // (2) Voice: Chrome's built-in speech recognition (needs internet).
    const W = window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any };
    const Rec = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (Rec) {
      const WAKE = /\b(hey|hi|hello|ok|okay|come on|yo)[ ,]+(shree|shri|sree|sri|shre|bro|brother)\b|\bcome (in )?(to )?(the )?front\b|\b(shree|shri|sree|sri)\b.{0,25}\bcome\b|\bwe('| a)?re back\b|\bback to you\b/i;
      const begin = () => {
        if (!e.active) return;
        const rec = new Rec();
        rec.lang = "en-IN";
        rec.continuous = true;
        rec.interimResults = true;
        rec.onresult = (ev: any) => {
          for (let i = ev.resultIndex; i < ev.results.length; i++) {
            const text = String(ev.results[i][0].transcript || "");
            if (WAKE.test(text)) {
              fireEntrance("voice", `("${text.trim().slice(0, 60)}")`);
              try {
                rec.abort();
              } catch {}
              return;
            }
          }
        };
        rec.onend = () => {
          if (e.active && e.rec === rec) setTimeout(begin, 250);
        };
        rec.onerror = (ev: any) => {
          if (ev?.error === "not-allowed" && s.current.listening) {
            s.current.listening = { ...s.current.listening, voice: false };
            pushStatus();
          }
        };
        e.rec = rec;
        try {
          rec.start();
        } catch {}
      };
      begin();
      voice = true;
    }
    s.current.listening = { snap, voice, test: s.current.entranceTest, sens: s.current.sens };
    pushStatus();
  }, [fireEntrance, pushStatus]);

  const startEntranceRef = useRef(startEntrance);
  startEntranceRef.current = startEntrance;
  const stopEntranceRef = useRef(stopEntrance);
  stopEntranceRef.current = stopEntrance;

  // Listen only while the screen is dark and Shree isn't on yet (or in test mode).
  useEffect(() => {
    if (!armed) return;
    if (layout === "standby" && !connected) {
      s.current.entrance = "";
      startEntrance();
    } else if (layout === "handover" && s.current.ap.running) {
      // Wait ~6 s so the twin has released the mic, then listen for "we're back".
      const t = setTimeout(() => startEntranceRef.current(), 6000);
      return () => clearTimeout(t);
    } else if (!s.current.entranceTest) stopEntrance();
  }, [armed, layout, connected, startEntrance, stopEntrance]);

  useEffect(() => () => stopEntranceRef.current(), []);

  /* ------------------------------ render ------------------------------ */
  const twinBig = layout === "twin";
  const showTwin = layout === "twin" || layout === "slides" || layout === "hub";
  const twinSide = layout === "slides" || layout === "hub";

  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden select-none" style={{ cursor: armed ? "none" : "default" }}>
      {!armed && (
        <button
          onClick={() => {
            setArmed(true);
            document.documentElement.requestFullscreen?.().catch(() => {});
            initSound();
            setNote("");
            // Ask for the microphone now (one click), so the snap listener is ready later.
            if (!navigator.mediaDevices?.getUserMedia) {
              s.current.micOk = false;
              pushStatus();
            } else
              navigator.mediaDevices
                .getUserMedia({ audio: true })
                .then((m) => {
                  m.getTracks().forEach((t) => t.stop());
                  s.current.micOk = true;
                  pushStatus();
                })
                .catch(() => {
                  s.current.micOk = false;
                  pushStatus();
                });
            // Pre-show: the lobby (title + QR) is on screen until Shreesha starts.
            refreshHub();
            setLayoutBoth("hub");
          }}
          className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/90"
        >
          <span className="text-2xl font-semibold">Presenter.ai — TV screen</span>
          <span className="text-white/60">{session ? `Session ${session.code} · ${slideCount || "no"} slides` : "Loading…"}</span>
          <span className="mt-4 rounded-full bg-orange-600 px-6 py-3 text-lg">Click to start (full screen, sound on)</span>
          <span className="text-white/40 text-sm mt-2">Opens on the lobby (title + QR). Run the show from your phone with Next act.</span>
        </button>
      )}

      {/* Slides */}
      <div
        ref={stageRef}
        className="absolute flex items-center justify-center transition-all duration-500"
        style={
          layout === "slides"
            ? { left: "2%", top: "3%", width: "70%", height: "94%", opacity: 1 }
            : { left: "2%", top: "3%", width: "70%", height: "94%", opacity: 0, pointerEvents: "none" }
        }
      >
        <canvas ref={canvasRef} className="rounded-xl shadow-2xl bg-white" />
      </div>

      {/* Opening montage */}
      {montage && (
        <div className="absolute inset-0 z-40">
          <Montage onDone={() => montageDone.current?.()} />
        </div>
      )}

      {/* Audience hub */}
      {layout === "hub" && session && (
        <div className="absolute" style={{ left: "2%", top: "3%", width: "70%", height: "94%" }}>
          <HubScreen hub={{ ...hub, finaleStep: hub.phase === "finale" ? Math.min(hub.finaleStep || 0, finaleShown) : hub.finaleStep }} board={board} quizKey={quizKey} code={session.code} title={session.title} serverNow={tick + hubRef.current.offset} buildText={buildText} />
        </div>
      )}

      {/* Twin */}
      <div
        className="absolute transition-all duration-500 overflow-hidden rounded-2xl bg-black"
        style={
          twinBig
            ? { left: "10%", top: "6%", width: "80%", height: "80%", opacity: 1 }
            : twinSide
              ? { left: "74%", top: "3%", width: "24%", height: "40%", opacity: 1 }
              : { left: "40%", top: "40%", width: "20%", height: "20%", opacity: 0 }
        }
      >
        {[0, 1].map((slot) => (
          <video
            key={slot}
            id={`twin-video-${slot}`}
            autoPlay
            playsInline
            className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
            style={{ opacity: activeSlot === slot ? 1 : 0 }}
          />
        ))}
        {showTwin && (
          <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-lg bg-black/60 px-3 py-1.5 text-sm">
            <span className={`h-2.5 w-2.5 rounded-full ${speaking ? "bg-green-400 animate-pulse" : connected ? "bg-white/50" : "bg-red-500"}`} />
            Shree · {speaking ? "speaking" : connected ? "listening" : "offline"}
          </div>
        )}
      </div>

      {/* Caption */}
      {showTwin && caption && (
        <div
          className="absolute rounded-2xl bg-white/10 backdrop-blur px-5 py-4 text-white/90 transition-all duration-500"
          style={
            twinBig
              ? { left: "10%", top: "88%", width: "80%", fontSize: "1.4vw" }
              : { left: "74%", top: "45%", width: "24%", maxHeight: "50%", overflow: "hidden", fontSize: "1.05vw", lineHeight: 1.45 }
          }
        >
          {caption}
        </div>
      )}

      {layout === "handover" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
          <div className="text-[4vw] font-bold">Over to Shreesha</div>
          <div className="text-white/50 text-[1.4vw]">Shree will be right back…</div>
        </div>
      )}

      {armed && note && layout !== "standby" && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-4 py-1 text-xs text-white/60">{note}</div>
      )}
    </div>
  );
}

/* Context for the Director: phone-tagged names are certain, so Shree may use them. */
function peopleContext(board: Board | null) {
  if (!board?.attendees.length) return undefined;
  return board.attendees.map((a) => `- ${a.name}${a.intro ? ` (task they'd love to drop: ${a.intro})` : ""}`).join("\n");
}

function hubContext(hub: HubState, board: Board | null) {
  const parts = [`Audience hub phase: ${hub.phase}. ${board?.attendees.length || 0} people signed in on phones.`];
  if (hub.phase === "poll" && hub.poll) {
    const p = pollByKey(hub.poll);
    const counts = board?.polls[hub.poll] || [];
    if (p) parts.push(`Live poll "${p.q}": ${p.options.map((o, i) => `${o} = ${counts[i] || 0}`).join("; ")}.`);
  }
  const fb = hub.flyerBuild;
  if (fb) {
    const secs = fb.finishedAt ? Math.round((fb.finishedAt - fb.startedAt) / 1000) : null;
    parts.push(`Flyer app build: ${fb.status}${secs ? `, built in ${Math.floor(secs / 60)} min ${secs % 60} s (quote this real build time)` : ""}.`);
  }
  if (hub.phase === "assessment") parts.push(`${board?.assessment.completed || 0} have finished the self-assessment.`);
  if (hub.phase === "questions" && board?.questions.length)
    parts.push(`Open phone questions (most recent first): ${board.questions.filter((q) => q.status === "open").slice(0, 6).map((q) => `"${q.text}"`).join(" | ")}`);
  return parts.join(" ");
}

