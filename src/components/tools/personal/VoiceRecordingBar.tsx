"use client";

import Icon from "@/components/Icon";
import { NoteSynthesisMode } from "@/app/api/personal/notes/ai/route";

interface VoiceRecordingBarProps {
  isRecording: boolean;
  isPaused: boolean;
  durationSec: number;
  transcript: string;
  interimTranscript: string;
  isProcessing: boolean;
  mode: NoteSynthesisMode;
  onModeChange: (mode: NoteSynthesisMode) => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onSynthesize: () => void;
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

const MODES: { key: NoteSynthesisMode; label: string; icon: string; desc: string }[] = [
  { key: "auto", label: "Auto", icon: "sparkle", desc: "AI picks the best structure" },
  { key: "meeting", label: "Meeting", icon: "users", desc: "Decisions & action items" },
  { key: "brainstorm", label: "Ideas", icon: "sun", desc: "Key themes & thesis" },
  { key: "tasks", label: "Tasks", icon: "check", desc: "To-do checklist" },
  { key: "clean", label: "Clean", icon: "edit", desc: "Polished transcript" },
];

export default function VoiceRecordingBar({
  isRecording,
  isPaused,
  durationSec,
  transcript,
  interimTranscript,
  isProcessing,
  mode,
  onModeChange,
  onPause,
  onResume,
  onCancel,
  onSynthesize,
}: VoiceRecordingBarProps) {
  const hasContent = !!(transcript || interimTranscript);

  return (
    <div className="border border-brand/20 bg-brand-wash/40 rounded-xl p-3.5 shadow-sm flex flex-col gap-3 transition-all animate-fadeIn">
      {/* Top status bar: Status, Timer, Visualizer, Mode selectors */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          {/* Pulsing indicator */}
          <div className="relative flex items-center justify-center">
            {isRecording && !isPaused && !isProcessing && (
              <span className="animate-ping absolute inline-flex h-3.5 w-3.5 rounded-full bg-critical opacity-75" />
            )}
            <span
              className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                isProcessing ? "bg-brand animate-pulse" : isPaused ? "bg-amber-500" : isRecording ? "bg-critical" : "bg-ink-muted"
              }`}
            />
          </div>

          <span className="text-[12.5px] font-semibold text-ink">
            {isProcessing ? "AI Structuring Note…" : isPaused ? "Recording Paused" : "Listening…"}
          </span>

          <span className="font-mono text-[11.5px] font-medium bg-surface/80 border border-border px-2 py-0.5 rounded text-ink-2">
            {formatDuration(durationSec)}
          </span>

          {/* Equalizer animation when listening */}
          {isRecording && !isPaused && !isProcessing && (
            <div className="flex items-end gap-0.5 h-3.5 px-1">
              <span className="w-1 bg-critical/70 rounded-full animate-bounce [animation-delay:0ms] h-2.5" />
              <span className="w-1 bg-critical/90 rounded-full animate-bounce [animation-delay:150ms] h-3.5" />
              <span className="w-1 bg-critical/70 rounded-full animate-bounce [animation-delay:300ms] h-2" />
              <span className="w-1 bg-critical rounded-full animate-bounce [animation-delay:100ms] h-3" />
              <span className="w-1 bg-critical/60 rounded-full animate-bounce [animation-delay:250ms] h-1.5" />
            </div>
          )}
        </div>

        {/* Synthesis Style Pills */}
        <div className="flex items-center gap-1 bg-surface border border-border/70 rounded-lg p-0.5">
          {MODES.map((m) => {
            const selected = mode === m.key;
            return (
              <button
                key={m.key}
                type="button"
                disabled={isProcessing}
                onClick={() => onModeChange(m.key)}
                title={m.desc}
                className={`flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded transition-colors ${
                  selected
                    ? "bg-brand text-white shadow-xs"
                    : "text-ink-muted hover:text-ink hover:bg-page"
                } disabled:opacity-50`}
              >
                <Icon name={m.icon} className="w-3 h-3 flex-shrink-0" />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Streaming transcript preview window */}
      <div className="bg-surface/90 border border-border/80 rounded-lg px-3 py-2.5 min-h-[62px] max-h-[120px] overflow-y-auto text-[12.5px] leading-relaxed">
        {hasContent ? (
          <p className="text-ink">
            {transcript}{" "}
            <span className="text-ink-muted italic">{interimTranscript}</span>
          </p>
        ) : (
          <p className="text-ink-muted/80 italic text-[12px] flex items-center gap-1.5">
            <Icon name="mic" className="w-3.5 h-3.5 text-brand opacity-70 animate-pulse" />
            Speak naturally... Dictate ideas, meeting discussions, or to-dos.
          </p>
        )}
      </div>

      {/* Control Buttons */}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <div className="flex items-center gap-1.5">
          {/* Pause / Resume */}
          {!isProcessing && isRecording && (
            <button
              type="button"
              onClick={isPaused ? onResume : onPause}
              className="flex items-center gap-1 text-[11.5px] font-medium text-ink-2 bg-surface hover:bg-page border border-border px-2.5 py-1.5 rounded-md transition-colors"
            >
              <Icon name={isPaused ? "play" : "pause"} className="w-3 h-3" />
              <span>{isPaused ? "Resume" : "Pause"}</span>
            </button>
          )}

          {/* Cancel */}
          <button
            type="button"
            disabled={isProcessing}
            onClick={onCancel}
            className="flex items-center gap-1 text-[11.5px] font-medium text-critical hover:bg-critical-wash px-2 py-1.5 rounded-md transition-colors disabled:opacity-40"
          >
            <Icon name="trash" className="w-3 h-3" />
            <span>Discard</span>
          </button>
        </div>

        {/* Primary Synthesize CTA */}
        <button
          type="button"
          disabled={!hasContent || isProcessing}
          onClick={onSynthesize}
          className="flex items-center gap-1.5 text-[12px] font-semibold text-white bg-brand hover:brightness-105 active:scale-95 disabled:opacity-50 disabled:pointer-events-none px-3.5 py-1.5 rounded-md shadow-xs transition-all"
        >
          {isProcessing ? (
            <>
              <svg className="animate-spin -ml-0.5 mr-1 h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span>Structuring Note…</span>
            </>
          ) : (
            <>
              <Icon name="sparkle" className="w-3.5 h-3.5" />
              <span>Done & Synthesize</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
