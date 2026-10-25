"use client";

// Exhibition kiosk: full-screen, voice-first, hands-free. An "attract" screen
// cycles greetings in many languages until a visitor taps; then Remi greets
// them and listens continuously. After N seconds of silence the session is
// closed (summary + email to the team) and the kiosk resets for the next visitor.
import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import Logo from "@/components/Logo";
import RemiAvatar, { type RemiState } from "./RemiAvatar";
import AvatarLightbox from "./AvatarLightbox";
import { useRemiChat } from "./useRemiChat";
import { DevicePanel, LanguageSelect, MessageBubble } from "./RemiStudio";
import type { RemiPublicWorkspace } from "./types";

const HELLOS = [
  "Hello", "नमस्ते", "ನಮಸ್ಕಾರ", "வணக்கம்", "Hola", "Olá", "Bonjour", "مرحبا", "Hallo", "Selamat datang",
  "Xin chào", "你好", "こんにちは", "Jambo", "Привет", "Merhaba", "নমস্কার", "Ciao",
];

export default function RemiKiosk({ ws }: { ws: RemiPublicWorkspace }) {
  const chat = useRemiChat(ws, "kiosk");
  const { audio } = chat;
  const [active, setActive] = useState(false);
  const [hello, setHello] = useState(0);
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => {
      setHello((h) => (h + 1) % HELLOS.length);
      setNow(Date.now());
    }, 1600);
    return () => clearInterval(t);
  }, []);

  // Idle reset for the next visitor.
  const idleMs = (ws.kiosk_idle_seconds || 90) * 1000;
  const busy = chat.thinking || audio.speaking || audio.recording;
  useEffect(() => {
    if (!active || busy) return;
    if (now - chat.lastActivity > idleMs) {
      audio.setConversationMode(false);
      chat.reset();
      setActive(false);
    }
  }, [now, active, busy, chat, audio, idleMs]);

  async function start() {
    audio.unlock();
    chat.setVoiceOn(true);
    setActive(true);
    chat.touch();
    try {
      await audio.setConversationMode(true);
    } catch {
      /* mic blocked: visitor can still type/tap */
    }
    chat.send({ text: "Hello", hidden: true });
  }

  const state: RemiState = audio.speaking ? "speaking" : chat.thinking ? "thinking" : audio.recording ? "listening" : "idle";
  const visible = chat.messages.filter((m) => !m.hidden).slice(-4);

  return (
    <div className="fixed inset-0 bg-page text-ink flex flex-col overflow-hidden">
      <header className="px-6 py-3 flex items-center justify-between border-b border-border bg-surface/80 backdrop-blur">
        <div className="flex items-center gap-3">
          <Logo height={24} />
          <span className="text-ink-muted">·</span>
          <span className="font-bold text-sm">{ws.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSelect value={chat.language} onChange={chat.setLanguage} />
          <button onClick={() => setDevicesOpen((v) => !v)} aria-label="Audio devices" className="w-8 h-8 rounded-xl border border-border bg-page text-ink-muted hover:text-brand flex items-center justify-center">
            <Icon name="bluetooth" className="w-4 h-4" />
          </button>
          <button
            onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}
            aria-label="Full screen"
            className="w-8 h-8 rounded-xl border border-border bg-page text-ink-muted hover:text-brand flex items-center justify-center"
          >
            <Icon name="maximize" className="w-4 h-4" />
          </button>
        </div>
      </header>
      {devicesOpen && <DevicePanel audio={audio} onClose={() => setDevicesOpen(false)} />}

      {!active ? (
        <button onClick={start} className="flex-1 flex flex-col items-center justify-center gap-8 cursor-pointer select-none bg-[radial-gradient(ellipse_at_center,var(--brand-wash),var(--page)_70%)]">
          <RemiAvatar size={260} state="idle" src={ws.avatar_url} alt={ws.assistant_name} />
          <div className="text-center space-y-3 px-6">
            <div key={hello} className="text-5xl sm:text-6xl font-extrabold text-brand animate-pulse">{HELLOS[hello]}!</div>
            <div className="text-2xl font-bold">I&apos;m {ws.assistant_name} — {ws.name}&apos;s AI product expert</div>
            <div className="text-lg text-ink-2">Ask me anything about our products, in any language.</div>
          </div>
          <span className="inline-flex items-center gap-3 px-8 py-4 rounded-full bg-[radial-gradient(circle_at_35%_30%,var(--accent-btn-1),var(--accent-btn-2))] text-white text-xl font-bold shadow-button">
            <Icon name="mic" className="w-6 h-6" /> Tap to talk
          </span>
        </button>
      ) : (
        <main className="flex-1 min-h-0 grid grid-rows-[auto_1fr_auto] gap-4 p-6 max-w-4xl w-full mx-auto">
          <div className="flex flex-col items-center gap-3">
            <button type="button" onClick={() => ws.avatar_url && setPhotoOpen(true)} disabled={!ws.avatar_url} aria-label={`Enlarge ${ws.assistant_name}'s photo`} className="rounded-full enabled:cursor-zoom-in">
              <RemiAvatar size={170} state={state} level={audio.level} src={ws.avatar_url} alt={ws.assistant_name} />
            </button>
            {ws.avatar_url && (
              <AvatarLightbox open={photoOpen} onClose={() => setPhotoOpen(false)} src={ws.avatar_url} name={ws.assistant_name} caption={ws.tagline} />
            )}
            <div className="text-lg font-bold text-brand h-7">
              {state === "speaking" ? "Speaking…" : state === "thinking" ? "Thinking…" : state === "listening" ? "Listening…" : audio.handsFree ? "Go ahead, I'm listening" : "Tap the mic to talk"}
            </div>
            {audio.handsFree && (
              <div className="flex items-end gap-1 h-6">
                {Array.from({ length: 14 }).map((_, i) => (
                  <span key={i} className="w-1.5 rounded-full bg-brand/70" style={{ height: `${6 + Math.abs(Math.sin(i + now / 300)) * audio.level * 22}px` }} />
                ))}
              </div>
            )}
          </div>
          <div className="min-h-0 overflow-y-auto space-y-3 text-base">
            {visible.map((m) => (
              <MessageBubble key={m.key} m={m} assistantName={ws.assistant_name} />
            ))}
          </div>
          <div className="space-y-3">
            {!!chat.suggestions.length && (
              <div className="flex flex-wrap justify-center gap-2">
                {chat.suggestions.slice(0, 4).map((q) => (
                  <button key={q} disabled={chat.thinking} onClick={() => chat.send({ text: q })} className="px-4 py-2 rounded-full border border-border bg-surface text-sm hover:bg-brand-wash hover:text-brand disabled:opacity-50">
                    {q}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => {
                  audio.unlock();
                  audio.toggleTalk();
                }}
                className={`w-16 h-16 rounded-full flex items-center justify-center shadow-button text-white ${audio.recording ? "bg-brand animate-pulse" : "bg-[radial-gradient(circle_at_35%_30%,var(--accent-btn-1),var(--accent-btn-2))]"}`}
                aria-label="Talk"
              >
                <Icon name="mic" className="w-7 h-7" />
              </button>
              <button
                onClick={() => audio.setConversationMode(!audio.handsFree)}
                className={`px-4 h-11 rounded-full border text-sm font-semibold flex items-center gap-2 ${audio.handsFree ? "bg-brand text-white border-brand" : "bg-surface border-border text-ink-muted"}`}
              >
                <Icon name="waveform" className="w-4 h-4" /> Hands-free {audio.handsFree ? "on" : "off"}
              </button>
              <button
                onClick={() => {
                  audio.setConversationMode(false);
                  chat.reset();
                  setActive(false);
                }}
                className="px-4 h-11 rounded-full border border-border bg-surface text-sm text-ink-muted flex items-center gap-2"
              >
                <Icon name="refresh" className="w-4 h-4" /> New visitor
              </button>
            </div>
            {audio.micError && <p className="text-center text-sm text-critical">{audio.micError}</p>}
            <p className="text-center text-[11px] text-ink-muted">
              This conversation is processed by AI and recorded so our team can follow up. Please don&apos;t share sensitive personal information.
            </p>
          </div>
        </main>
      )}
    </div>
  );
}
