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
    intentionalClose: false,
    layout: "standby" as Layout,
    lastHeard: "",
    lastSaid: "",
    speakTimer: 0 as unknown as ReturnType<typeof setTimeout>,
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
      if (!client) {
        setNote("Twin not connected — showing text only");
        after?.();
        return;
      }
      s.current.speaking = true;
      setSpeaking(true);
      s.current.pendingAfterSpeech = after || null;
      pushStatus();
      // Safety net in case the end-of-speech event never arrives.
      const words = text.split(/\s+/).length;
      clearTimeout(s.current.speakTimer);
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
        body: JSON.stringify({ sessionId: session?.id, transcript: transcript.current.slice(-12), slideCount: s.current.slideCount, ...body }),
      });
      return out.say;
    },
    [session?.id]
  );

  /* ------------------------------ presenting ------------------------------ */
  const presentSlide = useCallback(
    async (idx: number) => {
      if (s.current.busy) return;
      s.current.busy = true;
      s.current.slide = idx;
      setSlide(idx);
      setNote(`Preparing slide ${idx + 1}…`);
      pushStatus();
      try {
        await drawSlide(idx);
        const [text, nextA, nextB] = await Promise.all([slideText(idx), slideText(idx + 1), slideText(idx + 2)]);
        const say = await director({ mode: "slide", slideIdx: idx, slideText: text, nextSlidesText: `${nextA}\n---\n${nextB}` });
        setNote("");
        await speak(say, () => {
          if (s.current.auto && !s.current.paused && s.current.slide === idx && idx + 1 < s.current.slideCount) {
            presentSlide(idx + 1);
          }
        });
      } catch (err) {
        setNote(err instanceof Error ? err.message : "Director error");
      } finally {
        s.current.busy = false;
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
          // Continue the current slide's flow, if presenting.
          if (s.current.layout === "slides" && s.current.auto && !s.current.paused && wasSlide + 1 < s.current.slideCount) {
            presentSlide(wasSlide + 1);
          }
        });
      } catch {
        clearTimeout(t);
      }
    },
    [director, presentSlide, pushStatus, slideText, speak]
  );

  /* ------------------------------ Anam ------------------------------ */
  const connectTwin = useCallback(async () => {
    if (anamRef.current) return;
    setNote("Connecting the twin…");
    try {
      const { sessionToken } = await api<{ sessionToken: string }>("/api/presenter/anam-token", { method: "POST" });
      const client = createAnamClient(sessionToken);
      client.addListener(AnamEvent.CONNECTION_ESTABLISHED, () => {
        setConnected(true);
        pushStatus({ connected: true });
      });
      client.addListener(AnamEvent.SESSION_READY, () => {
        setNote("");
        if (!s.current.micOn) client.muteInputAudio();
      });
      client.addListener(AnamEvent.MESSAGE_STREAM_EVENT_RECEIVED, (ev) => {
        if (ev.role === "persona" && ev.endOfSpeech) markSpeechDone();
      });
      client.addListener(AnamEvent.TALK_STREAM_INTERRUPTED, () => markSpeechDone());
      client.addListener(AnamEvent.MESSAGE_HISTORY_UPDATED, (messages) => {
        const last = [...messages].reverse().find((m) => m.role === "user");
        if (!last || seenMsgIds.current.has(last.id)) return;
        seenMsgIds.current.add(last.id);
        onRoomSpeech(last.content);
      });
      client.addListener(AnamEvent.CONNECTION_CLOSED, (reason) => {
        anamRef.current = null;
        setConnected(false);
        markSpeechDone();
        pushStatus({ connected: false });
        if (!s.current.intentionalClose) {
          setNote(`Reconnecting (${String(reason)})…`);
          setTimeout(() => connectTwin(), 800);
        }
        s.current.intentionalClose = false;
      });
      anamRef.current = client;
      await client.streamToVideoElement("twin-video");
    } catch (err) {
      anamRef.current = null;
      setNote(err instanceof Error ? `Twin error: ${err.message}` : "Twin error");
    }
  }, [markSpeechDone, onRoomSpeech, pushStatus]);

  const disconnectTwin = useCallback(async () => {
    const c = anamRef.current;
    if (!c) return;
    s.current.intentionalClose = true;
    anamRef.current = null;
    await c.stopStreaming().catch(() => {});
    setConnected(false);
    pushStatus({ connected: false });
  }, [pushStatus]);

  /* ------------------------------ commands ------------------------------ */
  const handle = useCallback(
    async (cmd: PresenterCommand) => {
      const st = s.current;
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
          setLayoutBoth("twin");
          await connectTwin();
          speak(await director({ mode: "free", instruction: "Open the session with high energy: greet everyone (good evening), introduce yourself as Shree, Shreesha Narsha's digital twin, and say tonight is interactive. Ask: did I say interact? Then answer yourself. Ask everyone to scan the QR code. Under 60 seconds." }));
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
      }
    },
    [connectTwin, director, disconnectTwin, drawSlide, markSpeechDone, presentSlide, pushStatus, setLayoutBoth, slideText, speak]
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

  /* ------------------------------ render ------------------------------ */
  const twinBig = layout === "twin";
  const showTwin = layout === "twin" || layout === "slides";

  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden select-none" style={{ cursor: armed ? "none" : "default" }}>
      {!armed && (
        <button
          onClick={() => {
            setArmed(true);
            document.documentElement.requestFullscreen?.().catch(() => {});
            pushStatus();
          }}
          className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/90"
        >
          <span className="text-2xl font-semibold">Presenter.ai — TV screen</span>
          <span className="text-white/60">{session ? `Session ${session.code} · ${slideCount || "no"} slides` : "Loading…"}</span>
          <span className="mt-4 rounded-full bg-orange-600 px-6 py-3 text-lg">Click to arm (full screen, sound on)</span>
          <span className="text-white/40 text-sm mt-2">The screen stays dark until you wake the twin from your control page.</span>
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

      {/* Twin */}
      <div
        className="absolute transition-all duration-500 overflow-hidden rounded-2xl bg-black"
        style={
          twinBig
            ? { left: "10%", top: "6%", width: "80%", height: "80%", opacity: 1 }
            : layout === "slides"
              ? { left: "74%", top: "3%", width: "24%", height: "40%", opacity: 1 }
              : { left: "40%", top: "40%", width: "20%", height: "20%", opacity: 0 }
        }
      >
        <video id="twin-video" autoPlay playsInline className="h-full w-full object-cover" />
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
