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

  // Audio Level Meter & Sync Status
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [chunksSynced, setChunksSynced] = useState<number>(0);
  const [syncingChunk, setSyncingChunk] = useState<boolean>(false);
  const [wordCount, setWordCount] = useState<number>(0);
  const [stopping, setStopping] = useState<boolean>(false);
  const [copiedLive, setCopiedLive] = useState<boolean>(false);

  // References
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const wakeLockRef = useRef<any>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const chunkTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const whisperTranscriptRef = useRef<string>("");
  const secondsRef = useRef<number>(0);
  const lastChunkTimeRef = useRef<number>(0);
  const isStoppingRef = useRef<boolean>(false);

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

  // Upload and Transcribe an Audio Slice via Whisper
  async function transcribeChunk(blob: Blob, offsetSec: number) {
    if (blob.size < 1200) return; // Ignore microscopic or silent clicks

    setSyncingChunk(true);
    try {
      const form = new FormData();
      const mimeType = blob.type || "audio/webm";
      const ext = mimeType.includes("mp4") ? "mp4" : "webm";
      form.append("file", blob, `chunk_${offsetSec}.${ext}`);
      form.append("offset", offsetSec.toString());

      const res = await fetch("/api/intelexa/transcribe", {
        method: "POST",
        body: form,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.text?.trim()) {
          const newText = data.text.trim();
          whisperTranscriptRef.current += (whisperTranscriptRef.current ? " " : "") + newText;
          setLiveTranscript(whisperTranscriptRef.current);
          setWordCount(whisperTranscriptRef.current.split(/\s+/).filter(Boolean).length);
          setChunksSynced((c) => c + 1);

          if (Array.isArray(data.segments) && data.segments.length > 0) {
            setSegments((prev) => [...prev, ...data.segments]);
          } else {
            setSegments((prev) => [
              ...prev,
              {
                start: formatTime(offsetSec),
                end: formatTime(secondsRef.current),
                text: newText,
              },
            ]);
          }

          // Check for key signals
          detectQuickSignal(newText, formatTime(offsetSec));
        }
      } else {
        console.warn("Chunk transcription returned status:", res.status);
      }
    } catch (err) {
      console.warn("Chunk transcription network issue:", err);
    } finally {
      setSyncingChunk(false);
    }
  }

  // 3. Audio Recording & Continuous Chunk Pipeline
  useEffect(() => {
    let stream: MediaStream | null = null;

    async function initAudio() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: { ideal: 1 },
            sampleRate: { ideal: 48000 },
          },
        });

        setMicActive(true);
        setMicError(null);

        // 3a. Audio Context for Live Volume Level Meter
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            const ctx = new AudioContextClass();
            audioContextRef.current = ctx;
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            const source = ctx.createMediaStreamSource(stream);
            source.connect(analyser);

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            const updateMeter = () => {
              if (isStoppingRef.current) return;
              analyser.getByteFrequencyData(dataArray);
              let sum = 0;
              for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i];
              }
              const avg = sum / dataArray.length;
              setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
              animFrameRef.current = requestAnimationFrame(updateMeter);
            };
            updateMeter();
          }
        } catch {
          // AudioContext unsupported, ignore volume meter
        }

        // 3b. MediaRecorder with High Voice Fidelity Bitrate (128 kbps)
        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";

        const recorderOptions: MediaRecorderOptions = {
          audioBitsPerSecond: 128000,
        };
        if (mimeType) recorderOptions.mimeType = mimeType;

        const recorder = new MediaRecorder(stream, recorderOptions);

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };

        // Start recorder with 2-second timeslices
        recorder.start(2000);
        mediaRecorderRef.current = recorder;

        // 3c. Continuous Rolling Chunk Pipeline (Every 30 Seconds)
        chunkTimerRef.current = setInterval(async () => {
          if (recorder.state === "recording" && audioChunksRef.current.length > 0) {
            const currentOffset = lastChunkTimeRef.current;
            lastChunkTimeRef.current = secondsRef.current;

            const sliceBlob = new Blob(audioChunksRef.current, {
              type: mimeType || "audio/webm",
            });
            audioChunksRef.current = []; // Reset buffer

            await transcribeChunk(sliceBlob, currentOffset);
          }
        }, 30000); // 30 seconds
      } catch (err) {
        console.error("Microphone access failed:", err);
        setMicError(
          "Microphone permission was denied or is unavailable. Please grant microphone access in your browser settings."
        );
      }
    }

    initAudio();

    return () => {
      isStoppingRef.current = true;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
      if (chunkTimerRef.current) clearInterval(chunkTimerRef.current);
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
      lower.includes("budget") ||
      lower.includes("pricing")
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
      lower.includes("challenge") ||
      lower.includes("issue")
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
      lower.includes("ceo") ||
      lower.includes("speaker")
    ) {
      newSignal = {
        time,
        tag: "Leader Detected",
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
      setIsPaused(false);
    } else {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
    }
  }

  // Final Stop & Analyse Handler (Flushes final audio slice to Whisper)
  async function handleStop() {
    setStopping(true);
    isStoppingRef.current = true;

    if (timerRef.current) clearInterval(timerRef.current);
    if (chunkTimerRef.current) clearInterval(chunkTimerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    // Stop MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }

    // Wait 300ms for final dataavailable event
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Flush final audio slice if exists
    if (audioChunksRef.current.length > 0) {
      const mimeType = mediaRecorderRef.current?.mimeType || "audio/webm";
      const finalBlob = new Blob(audioChunksRef.current, { type: mimeType });
      audioChunksRef.current = [];
      await transcribeChunk(finalBlob, lastChunkTimeRef.current);
    }

    const fullText =
      whisperTranscriptRef.current.trim() ||
      liveTranscript.trim() ||
      "Audio session completed.";

    onStopAndAnalyse({
      transcriptText: fullText,
      segments:
        segments.length > 0
          ? segments
          : [{ start: "00:00:00", end: formatTime(secondsRef.current), text: fullText }],
      durationSeconds: secondsRef.current,
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

      {/* Main Status & Audio Pulse */}
      <div className="relative flex flex-col items-center justify-center">
        {/* Pulsing Aura */}
        <div
          className={`w-36 h-36 rounded-full flex items-center justify-center transition-all duration-700 ${
            isPaused ? "bg-warning/10" : "bg-critical/10"
          }`}
        >
          <div
            className={`w-24 h-24 rounded-full flex items-center justify-center shadow-lg transition-all duration-500 ${
              isPaused ? "bg-warning text-white" : "bg-critical text-white animate-pulse"
            }`}
          >
            <Icon name="mic" className="w-10 h-10" />
          </div>
        </div>

        {/* Status Label */}
        <div className="mt-5 flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              isPaused ? "bg-warning" : "bg-critical animate-ping"
            }`}
          />
          <h2 className="text-sm sm:text-base font-extrabold tracking-wider uppercase text-ink">
            {stopping
              ? "FINALIZING LAST AUDIO CHUNK..."
              : isPaused
              ? "INTELEXA IS PAUSED"
              : "INTELEXA IS RECORDING & TRANSCRIBING"}
          </h2>
        </div>

        {/* Elapsed Timer Display */}
        <div className="text-4xl sm:text-5xl font-mono font-bold text-ink tracking-tight mt-2">
          {formatTime(seconds)}
        </div>

        {/* Live Audio Level & Whisper Sync Status */}
        <div className="mt-3 flex items-center justify-center gap-3 text-xs flex-wrap">
          {/* Live Mic Level */}
          <div className="flex items-center gap-1.5 px-3 py-1 bg-surface border border-border rounded-full shadow-soft">
            <span className="text-ink-muted text-[11px]">Mic Level:</span>
            <div className="w-16 h-2 bg-page rounded-full overflow-hidden border border-border">
              <div
                style={{ width: `${Math.max(5, audioLevel)}%` }}
                className={`h-full transition-all duration-100 ${
                  audioLevel > 15 ? "bg-good" : "bg-ink-muted/50"
                }`}
              />
            </div>
            <span className="text-[10px] font-mono text-ink-muted">{audioLevel}%</span>
          </div>

          {/* Continuous Whisper Status */}
          <div className="flex items-center gap-1.5 px-3 py-1 bg-brand-wash border border-brand/20 text-brand rounded-full font-semibold text-[11px]">
            <span className={`w-1.5 h-1.5 rounded-full ${syncingChunk ? "bg-warning animate-ping" : "bg-good"}`} />
            <span>
              {syncingChunk
                ? "Syncing 30s chunk..."
                : `Whisper Active • ${chunksSynced} synced (${wordCount} words)`}
            </span>
          </div>
        </div>

        <p className="text-xs text-ink-muted mt-2 max-w-md">
          {isPaused
            ? "Recording paused. Click Resume when ready."
            : "Screen kept awake. Continuous Whisper audio chunks are automatically transcribed and saved every 30 seconds."}
        </p>

        {micError && (
          <div className="mt-4 p-3 bg-critical/10 border border-critical/30 text-critical text-xs rounded-xl max-w-md">
            {micError}
          </div>
        )}
      </div>

      {/* Control Buttons */}
      <div className="flex items-center justify-center gap-4 w-full max-w-sm">
        <button
          type="button"
          onClick={handleTogglePause}
          disabled={stopping}
          className="flex-1 flex items-center justify-center gap-2 py-3 px-5 rounded-2xl border border-border bg-surface text-ink text-xs font-bold hover:bg-page transition shadow-soft disabled:opacity-50"
        >
          <Icon name={isPaused ? "play" : "pause"} className="w-4 h-4" />
          {isPaused ? "Resume" : "Pause"}
        </button>

        <button
          type="button"
          onClick={handleStop}
          disabled={stopping}
          className="flex-1 flex items-center justify-center gap-2 py-3 px-5 rounded-2xl bg-critical text-white text-xs font-bold hover:bg-critical/90 transition shadow-soft disabled:opacity-50"
        >
          <Icon name="stop" className="w-4 h-4" />
          {stopping ? "Finalizing..." : "Stop & Analyse"}
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

      {/* Live Transcript Stream & Signals Panel */}
      <div className="w-full max-w-xl text-left space-y-3">
        {/* Live Audio Transcript Box */}
        <div className="p-4 border border-border rounded-2xl bg-surface shadow-soft space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-ink flex items-center gap-1.5">
              <span>🎙️ Live Whisper Transcript</span>
              <span className="text-[10px] font-normal text-ink-muted font-mono">
                ({wordCount} words)
              </span>
            </span>
            <div className="flex items-center gap-2">
              {liveTranscript && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(liveTranscript);
                    setCopiedLive(true);
                    setTimeout(() => setCopiedLive(false), 2000);
                  }}
                  className="px-2 py-0.5 text-[10px] font-semibold rounded bg-page border border-border hover:border-brand text-ink-muted hover:text-ink transition"
                >
                  {copiedLive ? "Copied! ✓" : "Copy Text"}
                </button>
              )}
              {syncingChunk && (
                <span className="text-[10px] text-brand font-medium animate-pulse">
                  Transcribing chunk...
                </span>
              )}
            </div>
          </div>

          <div className="max-h-40 overflow-y-auto font-mono text-[11.5px] text-ink-2 bg-page/60 p-3 rounded-xl border border-border leading-relaxed">
            {liveTranscript || (
              <span className="text-ink-muted italic">
                Listening to audio... First 30-second Whisper chunk will appear shortly.
              </span>
            )}
          </div>
        </div>

        {/* Collapsible Strategic Signals Panel */}
        <button
          type="button"
          onClick={() => setShowLivePanel(!showLivePanel)}
          className="w-full flex items-center justify-between p-3 border border-border rounded-xl bg-surface hover:bg-page transition text-xs font-semibold text-ink"
        >
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-brand" />
            Detected Signals & Opportunities ({liveSignals.length})
          </span>
          <span className="text-ink-muted text-[11px]">
            {showLivePanel ? "Hide Panel ▲" : "Show Panel ▼"}
          </span>
        </button>

        {showLivePanel && (
          <div className="p-4 border border-border rounded-xl bg-surface shadow-soft space-y-3 animate-fadeIn">
            {liveSignals.length === 0 ? (
              <p className="text-xs text-ink-muted text-center py-3">
                No high-priority signals detected yet. Speaking content is analyzed every 30 seconds.
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
          </div>
        )}
      </div>
    </div>
  );
}
