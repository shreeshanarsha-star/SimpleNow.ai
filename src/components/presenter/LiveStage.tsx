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
import { DEFAULT_HUB, QUIZ, pollByKey, quizClock, type HubState } from "@/lib/presenter/content";

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
  const [buildText, setBuildText] = useState("");
  const building = useRef(false);
  const hubRef = useRef<{ hub: HubState; board: Board | null; offset: number; lastQuizNote: number; lastFinale: number }>({
    hub: DEFAULT_HUB,
    board: null,
    offset: 0,
    lastQuizNote: -1,
    lastFinale: 0,
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

  /* ------------------------------ speech ------------------------------ */
  const markSpeechDone = useCallback(() => {
    clearTimeout(s.current.speakTimer);
    if (!s.current.speaking) return;
    s.current.speaking = false;
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
      transcript.current.push({ role: "shree", text });
      setCaption(text);
      const words = text.split(/\s+/).length;
      s.current.speaking = true;
      setSpeaking(true);
      s.current.pendingAfterSpeech = after || null;
      pushStatus();
      clearTimeout(s.current.speakTimer);
      if (!client) {
        // No twin: show the caption for a natural reading time, never race ahead.
        setNote("Twin not connected — showing text only");
        s.current.speakTimer = setTimeout(markSpeechDone, (words / 2.6) * 1000 + 1500);
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
    [markSpeechDone, pushStatus]
  );

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
        const say = await director({ mode: "slide", slideIdx: idx, slideText: text, nextSlidesText: `${nextA}\n---\n${nextB}` });
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
      if (!heard.trim() || s.current.paused) return;
      s.current.lastHeard = heard;
      transcript.current.push({ role: "room", text: heard });
      pushStatus();
      if (s.current.intros && session?.id) {
        // Save the spoken intro to that person's memory (background, never blocks Shree).
        api<{ matched: string | null }>("/api/presenter/intro", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: session.id, heard }),
        })
          .then((r) => {
            if (r.matched) {
              s.current.introSaved = r.matched;
              pushStatus();
            }
          })
          .catch(() => {});
      }
      const wasSlide = s.current.slide;
      let bridged = false;
      const t = setTimeout(() => {
        bridged = true;
        anamRef.current?.talk(bridgePhrase()).catch(() => {});
      }, 1500);
      try {
        const say = await director({ mode: "room", heard, slideIdx: wasSlide, slideText: await slideText(wasSlide), nextSlidesText: await slideText(wasSlide + 1) });
        clearTimeout(t);
        if (say.includes("[SILENT]")) return;
        await speak(bridged ? say : say, () => {
          // Move on only if this slide had already been fully presented; otherwise
          // stay put (Shreesha taps Next), so a stray remark never skips content.
          if (s.current.slideNarrated && s.current.slide === wasSlide && s.current.layout === "slides" && s.current.auto && !s.current.paused && wasSlide + 1 < s.current.slideCount) {
            presentSlide(wasSlide + 1);
          }
        });
      } catch {
        clearTimeout(t);
      }
    },
    [director, presentSlide, pushStatus, slideText, speak, session?.id]
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
    if (s.current.layout !== "hub" || s.current.paused || s.current.speaking) return;
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
        speak(await director({ mode: "free", instruction }).catch(() => "[SILENT]"));
      }
    }
    if (h.hub.phase !== "finale") h.lastFinale = 0;
    if (h.hub.phase === "finale") {
      const step = h.hub.finaleStep || 0;
      if (step !== h.lastFinale && step > 0) {
        h.lastFinale = step;
        const lb = h.board?.quiz.leaderboard || [];
        const say = (i: number, place: string) =>
          lb[i] ? `Announce ${place} place in the quiz: ${lb[i].name}, with ${lb[i].correct} out of 30. Build a little drama, one or two sentences, then congratulate them.` : `There's no ${place} place (not enough players). Say so lightly in one sentence.`;
        const instruction =
          step === 1
            ? say(2, "third")
            : step === 2
              ? say(1, "second")
              : step === 3
                ? say(0, "first. They are tonight's quiz champion")
                : step === 4
                  ? `Reveal the team AI-level chart (counts only): ${(h.board?.assessment.levelCounts || []).map((l) => `${l.name} ${l.count}`).join(", ")}. Two or three sentences: celebrate honestly, then the goal of one level up in 90 days. Everyone's badge is on their phone, private. Name nobody.`
                  : `Compare the before and after poll ("${pollByKey("before")?.q}"): before ${JSON.stringify(h.board?.polls["before"] || [])}, after ${JSON.stringify(h.board?.polls["after"] || [])} for options ${JSON.stringify(pollByKey("before")?.options || [])}. Two sentences, honest.`;
        speak(await director({ mode: "free", instruction }).catch(() => "[SILENT]"));
      }
    }
  }, [director, speak]);

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
        if (isActive()) markSpeechDone();
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
      if (!["mic", "auto", "reconnect"].includes(cmd.type)) st.gen++;
      switch (cmd.type) {
        case "wake":
          setLayoutBoth("twin");
          await connectTwin();
          break;
        case "standby":
          anamRef.current?.interruptPersona();
          setLayoutBoth("standby");
          break;
        case "start":
          stopEntranceRef.current();
          if (!st.entrance) st.entrance = "button";
          setLayoutBoth("twin");
          await connectTwin();
          speak(await director({ mode: "free", instruction: "You have just appeared on screen after Shreesha's snap. Open with high energy in 4 to 6 short sentences: greet everyone (good evening), introduce yourself as Shree, Shreesha Narsha's digital twin, and say tonight is not a lecture, it's interactive: their phones are their remote (they have already joined). Give a one-line movie-trailer agenda: a quiz, a mirror, a story, a live app build, and a winner. End by saying the first vote is on their phones now. Under 40 seconds." }));
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
          st.paused = true;
          st.pendingAfterSpeech = null;
          anamRef.current?.interruptPersona();
          pushStatus();
          break;
        case "resume":
          st.paused = false;
          pushStatus();
          if (st.layout === "handover") setLayoutBoth("twin");
          if (!anamRef.current) await connectTwin();
          if (st.layout === "slides") presentSlide(st.slide);
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
              instruction: `The room gave the flyer details: "${cmd.inputs.name}", ${cmd.inputs.date}, at ${cmd.inputs.venue}, highlights: ${cmd.inputs.highlights.join("; ")}. Say you've just handed the instruction to an AI and the build has started on screen. In 3 or 4 short sentences explain vibe coding: describe the app in plain English, the AI writes the code, a human checks it. Then hand over: "Shreesha, over to you."`,
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
    try {
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
      const WAKE = /\b(hey|hi|hello|ok|okay|come on|yo)[ ,]+(shree|shri|sree|sri|shre|bro|brother)\b|\bcome (in )?(to )?(the )?front\b|\b(shree|shri|sree|sri)\b.{0,25}\bcome\b/i;
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
            // Ask for the microphone now (one click), so the snap listener is ready later.
            navigator.mediaDevices?.getUserMedia({ audio: true }).then((m) => m.getTracks().forEach((t) => t.stop())).catch(() => {});
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

      {/* Audience hub */}
      {layout === "hub" && session && (
        <div className="absolute" style={{ left: "2%", top: "3%", width: "70%", height: "94%" }}>
          <HubScreen hub={hub} board={board} quizKey={quizKey} code={session.code} title={session.title} serverNow={tick + hubRef.current.offset} buildText={buildText} />
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
