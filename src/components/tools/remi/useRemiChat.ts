"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { findLanguage, toBcp47 } from "@/lib/remi/languages";
import { useRemiAudio } from "./useRemiAudio";
import type { RemiMessage, RemiPublicWorkspace } from "./types";

type Channel = "web" | "kiosk" | "test" | "qr" | "embed";

let keySeq = 0;
const k = () => `m${Date.now()}-${keySeq++}`;

export function greetingFor(ws: RemiPublicWorkspace) {
  return (
    ws.greeting ||
    `Hello! I'm ${ws.assistant_name}, ${ws.name}'s AI sales partner. 👋\nAsk me about our products, results, pricing or availability — speak or type in any language and I'll answer in yours.`
  );
}

export function useRemiChat(ws: RemiPublicWorkspace, channel: Channel) {
  const base = `/api/remi/public/${ws.slug}`;
  const [messages, setMessages] = useState<RemiMessage[]>([{ key: "welcome", role: "assistant", text: greetingFor(ws) }]);
  const [thinking, setThinking] = useState(false);
  const [voiceOn, setVoiceOn] = useState(channel === "kiosk");
  const [language, setLanguage] = useState<string>(ws.default_language || "auto");

  // Personal devices (web / QR / embed): if the workspace is on Auto and the
  // visitor's phone or browser is set to a language other than English,
  // pre-select it so answers come back in their language from the first word.
  // Kiosks are shared devices, so they stay on pure auto-detect.
  useEffect(() => {
    if (channel === "kiosk" || (ws.default_language && ws.default_language !== "auto")) return;
    try {
      const prefs = navigator.languages?.length ? navigator.languages : [navigator.language];
      const first = findLanguage(prefs[0]);
      if (first && first.code !== "en") setLanguage(first.code);
    } catch {
      /* ignore */
    }
  }, [channel, ws.default_language]);
  const [suggestions, setSuggestions] = useState<string[]>(ws.suggested_questions || []);
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);

  const tokenRef = useRef<string | null>(null);
  const voiceOnRef = useRef(voiceOn);
  voiceOnRef.current = voiceOn;
  const langRef = useRef(language);
  langRef.current = language;
  const inflight = useRef(false);

  const startSession = useCallback(async () => {
    const res = await fetch(`${base}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.token) throw new Error(data.error || "Couldn't connect.");
    tokenRef.current = data.token;
    return data.token as string;
  }, [base, channel]);

  // Audio is created first; send() is reached through a ref so the
  // utterance callback always calls the latest version.
  const sendRef = useRef<(i: { audio?: string; mime?: string }) => void>(() => {});
  const audio = useRemiAudio({ onUtterance: (b64, mime) => sendRef.current({ audio: b64, mime }) });
  const audioRef = useRef(audio);
  audioRef.current = audio;

  const speak = useCallback(
    async (msg: RemiMessage) => {
      if (!voiceOnRef.current || !msg.text) return;
      try {
        if (!msg.messageId || !tokenRef.current) throw new Error("no id");
        const res = await fetch(`${base}/speak`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: tokenRef.current, messageId: msg.messageId }),
        });
        if (!res.ok) throw new Error("tts");
        const url = URL.createObjectURL(await res.blob());
        await audioRef.current.playUrl(url);
        URL.revokeObjectURL(url);
      } catch {
        await audioRef.current.speakBrowser(msg.text, toBcp47(msg.language?.code || langRef.current));
      }
    },
    [base]
  );

  const send = useCallback(
    async (input: { text?: string; audio?: string; mime?: string; hidden?: boolean }) => {
      if (inflight.current) return;
      const text = input.text?.trim();
      if (!text && !input.audio) return;
      inflight.current = true;
      audioRef.current.setBusy(true);
      audioRef.current.stopPlayback();
      setError(null);
      setLastActivity(Date.now());
      const userKey = k();
      setMessages((m) => [
        ...m,
        { key: userKey, role: "user", text: text || "…", pending: !text, hidden: input.hidden },
      ]);
      setThinking(true);

      const call = async (token: string) =>
        fetch(`${base}/turn`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            text,
            audio: input.audio,
            mime: input.mime,
            language: langRef.current === "auto" ? null : langRef.current,
          }),
        });

      try {
        let token = tokenRef.current || (await startSession());
        let res = await call(token);
        if (res.status === 401) {
          token = await startSession();
          res = await call(token);
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMessages((m) => m.filter((x) => !(x.key === userKey && x.pending)));
          throw new Error(data.error || "Something went wrong.");
        }
        if (data.transcript) {
          setMessages((m) => m.map((x) => (x.key === userKey ? { ...x, text: data.transcript, pending: false } : x)));
        }
        const reply: RemiMessage = {
          key: k(),
          role: "assistant",
          text: data.reply,
          justification: data.justification,
          sources: data.sources,
          language: data.language,
          messageId: data.messageId,
          handoff: data.handoff,
        };
        setMessages((m) => [...m, reply]);
        if (Array.isArray(data.suggestions) && data.suggestions.length) setSuggestions(data.suggestions);
        setThinking(false);
        setLastActivity(Date.now());
        await speak(reply);
      } catch (e) {
        setThinking(false);
        const msg = e instanceof Error ? e.message : "Something went wrong.";
        setError(msg);
        setMessages((m) => [...m, { key: k(), role: "assistant", text: msg, error: true }]);
      } finally {
        inflight.current = false;
        audioRef.current.setBusy(false);
        setLastActivity(Date.now());
      }
    },
    [base, startSession, speak]
  );

  sendRef.current = send;

  const endSession = useCallback(() => {
    const token = tokenRef.current;
    if (!token) return;
    tokenRef.current = null;
    const body = JSON.stringify({ token });
    try {
      if (navigator.sendBeacon) navigator.sendBeacon(`${base}/end`, new Blob([body], { type: "text/plain" }));
      else fetch(`${base}/end`, { method: "POST", body, keepalive: true });
    } catch {
      /* ignore */
    }
  }, [base]);

  const reset = useCallback(() => {
    endSession();
    audioRef.current.stopPlayback();
    setMessages([{ key: k(), role: "assistant", text: greetingFor(ws) }]);
    setSuggestions(ws.suggested_questions || []);
    setLanguage(ws.default_language || "auto");
    setError(null);
  }, [endSession, ws]);

  useEffect(() => {
    const onHide = () => endSession();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      endSession();
    };
  }, [endSession]);

  return {
    messages,
    thinking,
    send,
    voiceOn,
    setVoiceOn: (on: boolean) => {
      setVoiceOn(on);
      if (!on) audioRef.current.stopPlayback();
      else audioRef.current.unlock();
    },
    language,
    setLanguage,
    suggestions,
    lastActivity,
    touch: () => setLastActivity(Date.now()),
    error,
    reset,
    audio,
  };
}
