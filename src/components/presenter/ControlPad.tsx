"use client";
// Presenter.ai — Shreesha's remote (phone + Bluetooth earpiece).
// Push-to-talk turns his whispered words into a private direction for Shree.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, presenterChannel, type PresenterCommand, type PresenterStatus } from "@/lib/presenter/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

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
