"use client";

import { useState, useEffect, useRef } from "react";
import Icon from "@/components/Icon";

export interface LiveSignal {
  time: string;
  tag: string;
  text: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
}

export default function LiveRecordingView({
  eventName,
  eventType,
  watchFor,
  onStopAndAnalyse,
}: {
  eventName: string;
  eventType: string;
  watchFor?: string;
  onStopAndAnalyse: (data: {
    transcriptText: string;
    segments: Array<{ start: string; end: string; text: string }>;
    durationSeconds: number;
  }) => void;
}) {
  const [seconds, setSeconds] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState<string>("");
  const [segments, setSegments] = useState<Array<{ start: string; end: string; text: string }>>([]);
  const [showLivePanel, setShowLivePanel] = useState(false);
  const [liveSignals, setLiveSignals] = useState<LiveSignal[]>([]);
  const [micActive, setMicActive] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  // References
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);
  const wakeLockRef = useRef<any>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptBufferRef = useRef<string>("");
  const secondsRef = useRef<number>(0);

  // Format Elapsed Time HH:MM:SS
  function formatTime(totalSec: number): string {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  // 1. Request Screen Wake Lock (Keeps mobile awake on conference table)
  useEffect(() => {
    async function requestWakeLock() {
      try {
        if ("wakeLock" in navigator && (navigator as any).wakeLock) {
          wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
        }
      } catch {
        // WakeLock unsupported or rejected, gracefully ignore
      }
    }
    requestWakeLock();

    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, []);

  // 2. Start Timer
  useEffect(() => {
    if (!isPaused) {
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          const next = s + 1;
          secondsRef.current = next;
          return next;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPaused]);

  // 3. Audio Recording & Web Speech Recognition
  useEffect(() => {
    let stream: MediaStream | null = null;

    async function initAudio() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setMicActive(true);
        setMicError(null);

        // MediaRecorder for raw audio buffer
        const recorder = new MediaRecorder(stream, {
          mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
            ? "audio/webm;codecs=opus"
            : undefined,
        });

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };

        recorder.start(5000); // 5-second chunk intervals
        mediaRecorderRef.current = recorder;

        // Browser Web Speech API for instantaneous zero-latency transcription
        const SpeechRecognition =
          (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

        if (SpeechRecognition) {
          const recognizer = new SpeechRecognition();
          recognizer.continuous = true;
          recognizer.interimResults = true;
          recognizer.lang = "en-US";

          recognizer.onresult = (event: any) => {
            let finalChunk = "";
            let interimChunk = "";

            for (let i = event.resultIndex; i < event.results.length; ++i) {
              if (event.results[i].isFinal) {
                finalChunk += event.results[i][0].transcript + " ";
              } else {
                interimChunk += event.results[i][0].transcript;
              }
            }

            if (finalChunk) {
              const currentTimestamp = formatTime(secondsRef.current);
              transcriptBufferRef.current += finalChunk;
              setLiveTranscript((prev) => prev + finalChunk);

              setSegments((prev) => [
                ...prev,
                {
                  start: currentTimestamp,
                  end: currentTimestamp,
                  text: finalChunk.trim(),
                },
              ]);

              // Check for quick keyword signals
              detectQuickSignal(finalChunk, currentTimestamp);
            }
          };

          recognizer.onerror = (err: any) => {
            console.warn("SpeechRecognition notice:", err.error);
          };

          recognizer.onend = () => {
            // Auto restart if still listening
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
              try {
                recognizer.start();
              } catch {}
            }
          };

          try {
            recognizer.start();
            recognitionRef.current = recognizer;
          } catch {}
        }
      } catch (err) {
        console.error("Microphone access failed:", err);
        setMicError(
          "Microphone permission was denied or is unavailable. Please check your browser settings."
        );
      }
    }

    initAudio();

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Quick Signal Heuristics
  function detectQuickSignal(text: string, time: string) {
    const lower = text.toLowerCase();
    let newSignal: LiveSignal | null = null;

    if (
      lower.includes("opportunity") ||
      lower.includes("pilot") ||
      lower.includes("looking for") ||
      lower.includes("need a solution") ||
      lower.includes("budget")
    ) {
      newSignal = {
        time,
        tag: "Potential Opportunity",
        text: text.slice(0, 90) + "...",
        priority: "HIGH",
      };
    } else if (
      lower.includes("problem") ||
      lower.includes("bottleneck") ||
      lower.includes("struggle") ||
      lower.includes("frustrated") ||
      lower.includes("challenge")
    ) {
      newSignal = {
        time,
        tag: "Pain Point Detected",
        text: text.slice(0, 90) + "...",
        priority: "MEDIUM",
      };
    } else if (
      lower.includes("vp") ||
      lower.includes("director") ||
      lower.includes("head of") ||
      lower.includes("founder") ||
      lower.includes("cto") ||
      lower.includes("ceo")
    ) {
      newSignal = {
        time,
        tag: "Person Detected",
        text: text.slice(0, 90) + "...",
        priority: "HIGH",
      };
    }

    if (newSignal) {
      setLiveSignals((prev) => [newSignal!, ...prev.slice(0, 10)]);
    }
  }

  function handleTogglePause() {
    if (!mediaRecorderRef.current) return;
    if (isPaused) {
      mediaRecorderRef.current.resume();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch {}
      }
      setIsPaused(false);
    } else {
      mediaRecorderRef.current.pause();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      setIsPaused(true);
    }
  }

  function handleStop() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }

    // Call Stop & Analyse handler with captured transcript
    const fullText = transcriptBufferRef.current.trim() || liveTranscript.trim() || "Live audio session completed.";
    onStopAndAnalyse({
      transcriptText: fullText,
      segments: segments.length > 0 ? segments : [{ start: "00:00:00", end: formatTime(seconds), text: fullText }],
      durationSeconds: seconds,
    });
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 flex flex-col items-center text-center animate-fadeIn space-y-8">
      {/* Top Context Pill */}
      <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-wash border border-brand/20 text-brand text-xs font-semibold">
        <span>{eventType}</span>
        <span>&bull;</span>
        <span className="truncate max-w-xs">{eventName || "Live Intelligence Session"}</span>
      </div>

      {/* Main Status & Pulsing Ring */}
      <div className="relative flex flex-col items-center justify-center">
        {/* Pulsing Aura */}
        <div className={`w-36 h-36 rounded-full flex items-center justify-center transition-all duration-700 ${
          isPaused ? "bg-warning/10" : "bg-critical/10"
        }`}>
          <div className={`w-24 h-24 rounded-full flex items-center justify-center shadow-lg transition-all duration-500 ${
            isPaused ? "bg-warning text-white" : "bg-critical text-white animate-pulse"
          }`}>
            <Icon name="mic" className="w-10 h-10" />
          </div>
        </div>

        {/* Status Label */}
        <div className="mt-5 flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${isPaused ? "bg-warning" : "bg-critical animate-ping"}`} />
          <h2 className="text-sm sm:text-base font-extrabold tracking-wider uppercase text-ink">
            {isPaused ? "INTELEXA IS PAUSED" : "INTELEXA IS LISTENING"}
          </h2>
        </div>

        {/* Elapsed Timer Display */}
        <div className="text-4xl sm:text-5xl font-mono font-bold text-ink tracking-tight mt-2">
          {formatTime(seconds)}
        </div>

        <p className="text-xs text-ink-muted mt-2 max-w-md">
          {isPaused
            ? "Microphone capture paused. Click Resume when ready."
            : "Screen kept awake. Put your phone on the table and focus on the event."}
        </p>

        {micError && (
          <div className="mt-4 p-3 bg-critical/10 border border-critical/30 text-critical text-xs rounded-xl max-w-md">
            {micError}
          </div>
        )}
      </div>

      {/* Audio Waveform Simulation */}
      {!isPaused && (
        <div className="flex items-center justify-center gap-1.5 h-8">
          {[40, 75, 55, 90, 60, 85, 45, 95, 70, 50, 80, 65, 40].map((h, i) => (
            <span
              key={i}
              style={{ height: `${h}%`, animationDelay: `${i * 0.08}s` }}
              className="w-1 bg-critical/70 rounded-full animate-bounce"
            />
          ))}
        </div>
      )}

      {/* Control Buttons */}
      <div className="flex items-center justify-center gap-4 w-full max-w-sm">
        <button
          type="button"
          onClick={handleTogglePause}
          className="flex-1 flex items-center justify-center gap-2 py-3 px-5 rounded-2xl border border-border bg-surface text-ink text-xs font-bold hover:bg-page transition shadow-soft"
        >
          <Icon name={isPaused ? "play" : "pause"} className="w-4 h-4" />
          {isPaused ? "Resume" : "Pause"}
        </button>

        <button
          type="button"
          onClick={handleStop}
          className="flex-1 flex items-center justify-center gap-2 py-3 px-5 rounded-2xl bg-critical text-white text-xs font-bold hover:bg-critical/90 transition shadow-soft"
        >
          <Icon name="stop" className="w-4 h-4" />
          Stop & Analyse
        </button>
      </div>

      {/* Watch For Banner (if configured) */}
      {watchFor && (
        <div className="w-full max-w-lg p-3.5 bg-page/60 border border-border rounded-xl text-left text-xs">
          <div className="font-bold text-ink-2 mb-1 flex items-center gap-1.5">
            <span>🎯 Custom Radar Active:</span>
          </div>
          <p className="text-ink-muted leading-relaxed">{watchFor}</p>
        </div>
      )}

      {/* Optional Live Intelligence Panel (Section 7) */}
      <div className="w-full max-w-lg text-left">
        <button
          type="button"
          onClick={() => setShowLivePanel(!showLivePanel)}
          className="w-full flex items-center justify-between p-3 border border-border rounded-xl bg-surface hover:bg-page transition text-xs font-semibold text-ink"
        >
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-brand" />
            Live Intelligence Signals ({liveSignals.length})
          </span>
          <span className="text-ink-muted text-[11px]">
            {showLivePanel ? "Hide Panel ▲" : "Show Panel ▼"}
          </span>
        </button>

        {showLivePanel && (
          <div className="mt-2 p-4 border border-border rounded-xl bg-surface shadow-soft space-y-3 animate-fadeIn">
            {liveSignals.length === 0 ? (
              <p className="text-xs text-ink-muted text-center py-3">
                Listening for high-priority signals, executive roles, and business opportunities...
              </p>
            ) : (
              liveSignals.map((sig, idx) => (
                <div
                  key={idx}
                  className="p-2.5 border-l-2 border-brand bg-page/50 rounded-r-lg space-y-1 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-brand uppercase text-[10px] tracking-wide">
                      {sig.tag}
                    </span>
                    <span className="text-[10px] text-ink-muted">{sig.time}</span>
                  </div>
                  <p className="text-ink leading-snug">{sig.text}</p>
                </div>
              ))
            )}

            {liveTranscript && (
              <div className="pt-2 border-t border-border">
                <span className="text-[10px] font-bold uppercase text-ink-muted block mb-1">
                  Live Spoken Stream (Edge Transcription):
                </span>
                <p className="text-[11px] text-ink-2 max-h-24 overflow-y-auto font-mono bg-page p-2 rounded-lg">
                  {liveTranscript}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
