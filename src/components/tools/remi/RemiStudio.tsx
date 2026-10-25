"use client";

// Dr.Remi conversational studio -- the AskShree "Shree" panel, rebuilt for
// sales: voice-first, any language in / same language out, evidence chips
// under every answer, and Bluetooth speaker / mic selection.
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { REMI_LANGUAGES, findLanguage, isRtl } from "@/lib/remi/languages";
import RemiAvatar, { type RemiState } from "./RemiAvatar";
import { useRemiChat } from "./useRemiChat";
import { EVIDENCE_LABEL, type RemiMessage, type RemiPublicWorkspace } from "./types";

export function LanguageSelect({
  value,
  onChange,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      title="Reply language"
      aria-label="Reply language"
      className={`h-8 rounded-xl border border-border bg-page text-[11px] text-ink px-2 outline-none focus:border-brand cursor-pointer ${className}`}
    >
      <option value="auto">🌐 Auto-detect</option>
      {REMI_LANGUAGES.map((l) => (
        <option key={l.code} value={l.code}>
          {l.native} · {l.name}
        </option>
      ))}
    </select>
  );
}

export function MessageBubble({ m, assistantName }: { m: RemiMessage; assistantName: string }) {
  if (m.hidden) return null;
  const rtl = isRtl(m.language?.code);
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className={`max-w-[85%] rounded-2xl rounded-br-[4px] px-3.5 py-2.5 bg-brand text-white shadow-soft-sm whitespace-pre-wrap ${m.pending ? "opacity-70 italic" : ""}`}>
          {m.pending ? "🎤 Listening to you…" : m.text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start gap-2">
      <div className={`max-w-[90%] rounded-2xl rounded-bl-[4px] px-3.5 py-2.5 border shadow-soft-sm ${m.error ? "bg-critical-wash border-critical/30 text-ink" : "bg-surface border-border text-ink"}`}>
        <div dir={rtl ? "rtl" : "ltr"} className="whitespace-pre-wrap leading-relaxed">
          {m.text}
        </div>
        {m.justification && (
          <div dir={rtl ? "rtl" : "ltr"} className="mt-2 flex items-start gap-1.5 text-[11px] text-good-text bg-good-wash/70 border border-good/20 rounded-lg px-2 py-1.5">
            <Icon name="check" className="w-3.5 h-3.5 mt-[1px] flex-shrink-0" />
            <span>{m.justification}</span>
          </div>
        )}
        {!!m.sources?.length && (
          <div className="mt-2 flex flex-wrap gap-1">
            {m.sources.map((s, i) =>
              s.source_url ? (
                <a
                  key={i}
                  href={s.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-brand-wash text-brand border border-brand/20 hover:underline"
                >
                  <Icon name="fileText" className="w-3 h-3" />
                  {s.title}
                  {s.evidence_type ? ` · ${EVIDENCE_LABEL[s.evidence_type] || s.evidence_type}` : ""}
                </a>
              ) : (
                <span key={i} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-brand-wash text-brand border border-brand/20">
                  <Icon name="fileText" className="w-3 h-3" />
                  {s.title}
                  {s.evidence_type ? ` · ${EVIDENCE_LABEL[s.evidence_type] || s.evidence_type}` : ""}
                </span>
              )
            )}
          </div>
        )}
        {(m.handoff || m.language) && (
          <div className="mt-1.5 flex items-center gap-2 text-[10px] text-ink-muted">
            {m.language && <span>🌐 {m.language.name}</span>}
            {m.handoff && <span className="text-brand font-semibold">• Specialist follow-up requested</span>}
          </div>
        )}
      </div>
      <span className="sr-only">{assistantName}</span>
    </div>
  );
}

export function DevicePanel({ audio, onClose }: { audio: ReturnType<typeof useRemiChat>["audio"]; onClose: () => void }) {
  return (
    <div className="absolute right-3 top-[84px] z-20 w-[290px] bg-surface border border-border rounded-2xl shadow-soft p-3.5 text-xs space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-bold text-ink flex items-center gap-1.5">
          <Icon name="bluetooth" className="w-4 h-4 text-brand" /> Audio devices
        </div>
        <button onClick={onClose} className="text-ink-muted hover:text-ink" aria-label="Close">
          <Icon name="x" className="w-4 h-4" />
        </button>
      </div>
      <label className="block space-y-1">
        <span className="text-ink-muted">Microphone</span>
        <select value={audio.inputId} onChange={(e) => audio.setInputId(e.target.value)} className="w-full h-8 rounded-lg border border-border bg-page px-2">
          <option value="default">System default</option>
          {audio.inputs.filter((d) => d.deviceId !== "default").map((d) => (
            <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
          ))}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-ink-muted">Speaker {audio.sinkSupported ? "" : "(set in your system sound settings)"}</span>
        <select
          disabled={!audio.sinkSupported}
          value={audio.outputId}
          onChange={(e) => audio.setOutputId(e.target.value)}
          className="w-full h-8 rounded-lg border border-border bg-page px-2 disabled:opacity-60"
        >
          <option value="default">System default</option>
          {audio.outputs.filter((d) => d.deviceId !== "default").map((d) => (
            <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
          ))}
        </select>
      </label>
      <p className="text-[10.5px] text-ink-muted leading-snug">
        Pair your Bluetooth speaker or speakerphone with this device first, then pick it here. For noisy exhibition halls a
        speakerphone or headset mic works far better than a speaker&apos;s built-in mic.
      </p>
      {!audio.inputs.some((d) => d.label && !/^Microphone \d/.test(d.label)) && (
        <button onClick={() => navigator.mediaDevices?.getUserMedia({ audio: true }).then((s) => { s.getTracks().forEach((t) => t.stop()); audio.refreshDevices(); }).catch(() => {})} className="text-brand font-semibold hover:underline">
          Show device names (allow microphone)
        </button>
      )}
    </div>
  );
}

export default function RemiStudio({
  ws,
  channel = "web",
  externalAsk,
  className = "",
}: {
  ws: RemiPublicWorkspace;
  channel?: "web" | "test" | "qr" | "embed";
  externalAsk?: { text: string; nonce: number } | null;
  className?: string;
}) {
  const chat = useRemiChat(ws, channel);
  const { audio } = chat;
  const [input, setInput] = useState("");
  const [devicesOpen, setDevicesOpen] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const chipsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat.messages, chat.thinking]);

  useEffect(() => {
    if (externalAsk?.text) chat.send({ text: externalAsk.text });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalAsk?.nonce]);

  const state: RemiState = audio.speaking ? "speaking" : chat.thinking ? "thinking" : audio.recording ? "listening" : "idle";
  const initials = ws.assistant_name.replace(/[^A-Za-z]/g, "").slice(0, 2) || "Dr";
  const statusText =
    state === "speaking" ? "Speaking" : state === "thinking" ? "Thinking" : audio.recording ? "Listening" : audio.handsFree ? "Hands-free on" : null;

  return (
    <div className={`relative bg-surface border border-border rounded-2xl shadow-soft overflow-hidden flex flex-col ${className}`}>
      {/* Header */}
      <div className="bg-gradient-to-b from-brand-wash/70 via-surface to-surface border-b border-border p-4 flex items-center justify-between gap-3 flex-shrink-0 min-h-[88px]">
        <div className="flex items-center gap-3.5 min-w-0">
          <RemiAvatar size={56} state={state} level={audio.level} initials={initials === "Dr" ? "Dr" : initials} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-bold text-sm text-ink truncate">{ws.assistant_name}</h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-brand-wash text-brand border border-brand/20 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live 24/7 · Any language
              </span>
            </div>
            <p className="text-[11px] text-ink-muted mt-0.5 truncate">
              {statusText ? <span className="text-brand font-semibold">{statusText}…</span> : ws.tagline}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <LanguageSelect value={chat.language} onChange={chat.setLanguage} className="hidden sm:block max-w-[150px]" />
          <button
            type="button"
            onClick={() => setDevicesOpen((v) => !v)}
            title="Microphone & speaker (Bluetooth)"
            aria-label="Audio devices"
            className="w-8 h-8 rounded-xl border border-border bg-page text-ink-muted hover:text-brand hover:border-brand/40 flex items-center justify-center shadow-soft-sm"
          >
            <Icon name="bluetooth" className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => chat.setVoiceOn(!chat.voiceOn)}
            title={chat.voiceOn ? "Voice replies on • click to mute" : "Voice replies off • click to hear answers"}
            aria-label={chat.voiceOn ? "Mute voice replies" : "Turn on voice replies"}
            className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-all ${
              chat.voiceOn ? "bg-brand text-white border-brand shadow-button" : "bg-page text-ink-muted border-border hover:text-brand shadow-soft-sm"
            }`}
          >
            <Icon name={chat.voiceOn ? "volume2" : "volumeX"} className="w-4 h-4" />
          </button>
        </div>
      </div>
      {devicesOpen && <DevicePanel audio={audio} onClose={() => setDevicesOpen(false)} />}

      {/* Transcript */}
      <div className="flex-1 flex flex-col overflow-hidden bg-page">
        <div className="sm:hidden px-3 pt-2">
          <LanguageSelect value={chat.language} onChange={chat.setLanguage} className="w-full" />
        </div>
        <div className="flex-1 p-4 overflow-y-auto space-y-3 text-[12.5px] min-h-0">
          {chat.messages.map((m) => (
            <MessageBubble key={m.key} m={m} assistantName={ws.assistant_name} />
          ))}
          {chat.thinking && (
            <div className="flex items-center gap-2 text-[11px] text-ink-muted pl-1">
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full bg-brand animate-bounce" style={{ animationDelay: `${i * 120}ms` }} />
                ))}
              </span>
              {ws.assistant_name} is checking the product knowledge…
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Suggestion chips */}
        {!!chat.suggestions.length && (
          <div className="px-2 py-2 bg-surface border-t border-border flex items-center gap-1.5">
            <button type="button" onClick={() => chipsRef.current?.scrollBy({ left: -180, behavior: "smooth" })} aria-label="Scroll left" className="w-6 h-6 rounded-lg border border-border bg-page text-ink-muted hover:text-brand flex items-center justify-center flex-shrink-0 text-xs">‹</button>
            <div ref={chipsRef} className="flex-1 flex items-center gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
              {chat.suggestions.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={chat.thinking}
                  onClick={() => chat.send({ text: q })}
                  className="text-[11px] px-2.5 py-1 rounded-full bg-page hover:bg-brand-wash hover:text-brand border border-border text-ink-muted whitespace-nowrap transition-colors flex-shrink-0 disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => chipsRef.current?.scrollBy({ left: 180, behavior: "smooth" })} aria-label="Scroll right" className="w-6 h-6 rounded-lg border border-border bg-page text-ink-muted hover:text-brand flex items-center justify-center flex-shrink-0 text-xs">›</button>
          </div>
        )}

        {/* Input capsule */}
        <div className="p-3 border-t border-border bg-surface">
          {audio.micError && <div className="text-[11px] text-critical mb-2">{audio.micError}</div>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!input.trim()) return;
              audio.unlock();
              chat.send({ text: input });
              setInput("");
            }}
            className="w-full bg-page border border-border rounded-full flex items-center px-3 sm:px-3.5 py-1.5 gap-1.5 sm:gap-2 focus-within:border-brand transition-all"
          >
            <Icon name="search" className="hidden sm:block w-4 h-4 text-ink-muted flex-shrink-0" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={audio.recording ? "Listening… tap the mic again to send" : `Ask ${ws.assistant_name} in any language…`}
              maxLength={1500}
              dir="auto"
              className="flex-1 min-w-0 bg-transparent border-none outline-none text-ink text-xs placeholder:text-ink-muted"
            />
            <button
              type="button"
              onClick={() => {
                audio.unlock();
                if (!chat.voiceOn) chat.setVoiceOn(true);
                audio.setConversationMode(!audio.handsFree);
              }}
              title={audio.handsFree ? "Hands-free conversation ON — just talk. Click to stop." : "Hands-free conversation: talk naturally, no buttons"}
              aria-label="Hands-free conversation mode"
              className={`h-7 px-2 rounded-full border flex items-center gap-1 text-[10.5px] font-semibold flex-shrink-0 transition-colors ${
                audio.handsFree ? "border-brand bg-brand text-white" : "border-border bg-surface text-ink-muted hover:text-brand"
              }`}
            >
              <Icon name="waveform" className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{audio.handsFree ? "Hands-free" : "Talk"}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                audio.unlock();
                audio.toggleTalk();
              }}
              disabled={chat.thinking}
              aria-label={audio.recording ? "Stop and send" : "Speak your question"}
              title={audio.recording ? "Tap to send" : "Tap to speak (any language)"}
              className={`w-7 h-7 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors ${
                audio.recording ? "border-brand bg-brand-wash text-brand animate-pulse" : "border-border bg-surface text-ink-muted hover:text-brand"
              }`}
            >
              <Icon name="mic" className="w-[13px] h-[13px]" />
            </button>
            <button
              type="submit"
              disabled={!input.trim() || chat.thinking}
              aria-label="Send"
              className="w-7 h-7 rounded-full bg-[radial-gradient(circle_at_35%_30%,var(--accent-btn-1),var(--accent-btn-2))] text-white flex items-center justify-center flex-shrink-0 shadow-button hover:brightness-110 disabled:opacity-40"
            >
              <Icon name="arrowUp" className="w-[13px] h-[13px]" />
            </button>
          </form>
          <p className="text-[10px] text-ink-muted mt-1.5 text-center">
            {findLanguage(chat.language) ? `Replying in ${findLanguage(chat.language)!.name}` : "Speak or type in any language — answers come back in yours."} · Conversations are recorded to help our team follow up.
          </p>
        </div>
      </div>
    </div>
  );
}
