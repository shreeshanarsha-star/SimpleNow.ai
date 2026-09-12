"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Icon from "@/components/Icon";
import { VScroller } from "@/components/Scroller";
import { saveVaultSession, saveVaultChunk } from "@/lib/intelexaVault";

export interface LiveSignal {
  time: string;
  tag: string;
  text: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
}

export default function LiveRecordingView({
  sessionId,
  eventName,
  eventType,
  watchFor,
  onStopAndAnalyse,
}: {
  sessionId?: string;
  eventName: string;
  eventType: string;
  watchFor?: string;
  onStopAndAnalyse: (data: {
    transcriptText: string;
    segments: Array<{ start: string; end: string; text: string }>;
    durationSeconds: number;
    audioBlob?: Blob;
  }) => void;
}) {
  const activeSessionId = useRef<string>(sessionId || `session_${Date.now()}`).current;
  const eventNameRef = useRef(eventName);
  eventNameRef.current = eventName;
  const eventTypeRef = useRef(eventType);
  eventTypeRef.current = eventType;

  const [seconds, setSeconds] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState<string>("");
  const [interimSpeech, setInterimSpeech] = useState<string>("");
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
  const [stoppingStatus, setStoppingStatus] = useState<string>("Finalizing audio & transcribing...");
  const [copiedLive, setCopiedLive] = useState<boolean>(false);
  const [hasWebSpeech, setHasWebSpeech] = useState<boolean>(false);
  const [lowAudioWarning, setLowAudioWarning] = useState<boolean>(false);

  // Master Audio Recording (NEVER WIPED: Stores 100% of all audio slices)
  const masterRecordingChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const activeSegmentRecorderRef = useRef<MediaRecorder | null>(null);
  const segmentIndexRef = useRef<number>(0);
  const detectedMimeTypeRef = useRef<string>("audio/webm");

  const wakeLockRef = useRef<any>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const segmentCycleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const silentFramesCountRef = useRef<number>(0);

  const whisperTranscriptRef = useRef<string>("");
  const webSpeechTranscriptRef = useRef<string>("");
  const speechRecognitionRef = useRef<any>(null);
  const secondsRef = useRef<number>(0);
  const isStoppingRef = useRef<boolean>(false);
  const isPausedRef = useRef<boolean>(false);
  const inFlightPromisesRef = useRef<Promise<any>[]>([]);

  // Format Elapsed Time HH:MM:SS
  function formatTime(totalSec: number): string {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  // 1. Request Screen Wake Lock (Keeps mobile awake during keynote)
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

  // 2. Start Session Timer
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

  // Quick Signal Heuristics
  const detectQuickSignal = useCallback((text: string, time: string) => {
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
  }, []);

  // Transcribe an Audio Slice via Whisper
  const transcribeAudioBlob = useCallback(
    async (blob: Blob, offsetSec: number, chunkIndex: number, isFinalMaster = false): Promise<string> => {
      if (blob.size < 1200) return "";

      setSyncingChunk(true);
      try {
        const form = new FormData();
        const mimeType = blob.type || detectedMimeTypeRef.current || "audio/webm";
        const ext = mimeType.includes("mp4") ? "mp4" : "webm";
        form.append("file", blob, `audio_${offsetSec}.${ext}`);
        form.append("offset", offsetSec.toString());

        const res = await fetch("/api/intelexa/transcribe", {
          method: "POST",
          body: form,
        });

        if (res.ok) {
          const data = await res.json();
          if (data.text?.trim()) {
            const newText = data.text.trim();

            if (isFinalMaster) {
              whisperTranscriptRef.current = newText;
            } else {
              whisperTranscriptRef.current += (whisperTranscriptRef.current ? " " : "") + newText;
            }

            setLiveTranscript(whisperTranscriptRef.current);
            setWordCount(whisperTranscriptRef.current.split(/\s+/).filter(Boolean).length);
            setChunksSynced((c) => c + 1);

            if (Array.isArray(data.segments) && data.segments.length > 0) {
              setSegments((prev) => (isFinalMaster ? data.segments : [...prev, ...data.segments]));
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

            detectQuickSignal(newText, formatTime(offsetSec));

            saveVaultChunk({
              sessionId: activeSessionId,
              chunkIndex,
              offsetSec,
              blob,
              whisperText: newText,
              createdAt: Date.now(),
            });

            return newText;
          }
        } else {
          console.warn("Whisper transcription response status:", res.status);
          saveVaultChunk({
            sessionId: activeSessionId,
            chunkIndex,
            offsetSec,
            blob,
            createdAt: Date.now(),
          });
        }
      } catch (err) {
        console.warn("Whisper transcription network error:", err);
        saveVaultChunk({
          sessionId: activeSessionId,
          chunkIndex,
          offsetSec,
          blob,
          createdAt: Date.now(),
        });
      } finally {
        setSyncingChunk(false);
      }
      return "";
    },
    [activeSessionId, detectQuickSignal]
  );

  // Helper to start next discrete segment recorder
  // EACH RECORDER OWNS ITS OWN PRIVATE `localChunks` CLOSURE (CANNOT BE WIPED)
  const startSegmentRecorder = useCallback(() => {
    if (!streamRef.current || isStoppingRef.current) return;

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/mp4")
      ? "audio/mp4"
      : "";

    detectedMimeTypeRef.current = mimeType || "audio/webm";

    const recorderOptions: MediaRecorderOptions = { audioBitsPerSecond: 128000 };
    if (mimeType) recorderOptions.mimeType = mimeType;

    const thisIndex = segmentIndexRef.current++;
    const startOffset = secondsRef.current;
    const localChunks: Blob[] = []; // PRIVATE LOCAL ARRAY IN THIS FUNCTION CLOSURE

    const segRecorder = new MediaRecorder(streamRef.current, recorderOptions);

    segRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        localChunks.push(e.data);
        // Also permanently append to the master continuous recording
        masterRecordingChunksRef.current.push(e.data);
      }
    };

    segRecorder.onstop = () => {
      const actualMime = segRecorder.mimeType || mimeType || "audio/webm";
      if (localChunks.length > 0) {
        const segBlob = new Blob(localChunks, { type: actualMime });
        if (segBlob.size > 1500) {
          const task = transcribeAudioBlob(segBlob, startOffset, thisIndex);
          inFlightPromisesRef.current.push(task);
        }
      }
    };

    segRecorder.start(1000);
    activeSegmentRecorderRef.current = segRecorder;
  }, [transcribeAudioBlob]);

  // Cycle segment recorder: stops current segment (flushing its private closure) & starts a new one
  const cycleSegmentRecorder = useCallback(() => {
    if (isStoppingRef.current || isPausedRef.current) return;
    const oldRecorder = activeSegmentRecorderRef.current;
    startSegmentRecorder();
    if (oldRecorder && oldRecorder.state !== "inactive") {
      try {
        oldRecorder.stop();
      } catch (e) {
        console.warn("Error stopping segment recorder:", e);
      }
    }
  }, [startSegmentRecorder]);

  // 3. Main Audio Recording Pipeline Initialization
  // EMPTY DEPENDENCY ARRAY: Runs ONCE on mount so stream is never destroyed prematurely!
  useEffect(() => {
    let stream: MediaStream | null = null;

    async function initAudio() {
      try {
        // Robust getUserMedia with progressive fallback
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
        } catch {
          // Fallback to basic audio constraint
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }

        streamRef.current = stream;
        setMicActive(true);
        setMicError(null);

        // 3a. Audio Context for Live Volume Level Meter
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            const ctx = new AudioContextClass();
            audioContextRef.current = ctx;
            if (ctx.state === "suspended") {
              ctx.resume().catch(() => {});
            }
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
              const level = Math.min(100, Math.round((avg / 128) * 100));
              setAudioLevel(level);

              if (level < 3) {
                silentFramesCountRef.current++;
                if (silentFramesCountRef.current > 300) {
                  // >5 seconds of complete silence
                  setLowAudioWarning(true);
                }
              } else {
                silentFramesCountRef.current = 0;
                setLowAudioWarning(false);
              }

              animFrameRef.current = requestAnimationFrame(updateMeter);
            };
            updateMeter();
          }
        } catch {
          // AudioContext unsupported, ignore volume meter
        }

        // 3b. Start initial Segment Recorder
        startSegmentRecorder();

        // 3c. Cycle segment recorder every 30 seconds for live chunk sync
        segmentCycleTimerRef.current = setInterval(() => {
          cycleSegmentRecorder();
        }, 30000);

        // 3d. Device-Native Web Speech API (Local on-device transcription)
        try {
          const SpeechRec =
            (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
          if (SpeechRec) {
            const recognition = new SpeechRec();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = "en-US";

            recognition.onresult = (event: any) => {
              let interim = "";
              for (let i = event.resultIndex; i < event.results.length; ++i) {
                const transcriptPiece = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                  webSpeechTranscriptRef.current += (webSpeechTranscriptRef.current ? " " : "") + transcriptPiece.trim();
                  // Real-time live display
                  if (!whisperTranscriptRef.current || whisperTranscriptRef.current.length < webSpeechTranscriptRef.current.length) {
                    setLiveTranscript(webSpeechTranscriptRef.current);
                    setWordCount(webSpeechTranscriptRef.current.split(/\s+/).filter(Boolean).length);
                  }
                } else {
                  interim += transcriptPiece;
                }
              }
              setInterimSpeech(interim);
            };

            recognition.onerror = (e: any) => {
              console.warn("Web Speech notice:", e.error);
            };

            recognition.onend = () => {
              // Graceful delayed restart to prevent Chrome crash-loop
              if (!isStoppingRef.current && !isPausedRef.current) {
                setTimeout(() => {
                  if (!isStoppingRef.current && !isPausedRef.current) {
                    try {
                      recognition.start();
                    } catch {}
                  }
                }, 350);
              }
            };

            recognition.start();
            speechRecognitionRef.current = recognition;
            setHasWebSpeech(true);
          }
        } catch (speechErr) {
          console.warn("Web Speech API unavailable:", speechErr);
        }

        // Save session in local IndexedDB vault
        saveVaultSession({
          id: activeSessionId,
          eventName: eventNameRef.current,
          eventType: eventTypeRef.current,
          startTime: Date.now(),
          durationSeconds: 0,
          whisperTranscript: "",
          webSpeechTranscript: "",
          chunkCount: 0,
        });
      } catch (err) {
        console.error("Microphone access error:", err);
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
      if (segmentCycleTimerRef.current) clearInterval(segmentCycleTimerRef.current);
      if (activeSegmentRecorderRef.current && activeSegmentRecorderRef.current.state !== "inactive") {
        try {
          activeSegmentRecorderRef.current.stop();
        } catch {}
      }
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch {}
      }
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []); // RUN ONCE ON MOUNT

  function handleTogglePause() {
    if (isPaused) {
      // Resume
      isPausedRef.current = false;
      setIsPaused(false);
      if (activeSegmentRecorderRef.current && activeSegmentRecorderRef.current.state === "paused") {
        activeSegmentRecorderRef.current.resume();
      }
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.start();
        } catch {}
      }
    } else {
      // Pause
      isPausedRef.current = true;
      setIsPaused(true);
      if (activeSegmentRecorderRef.current && activeSegmentRecorderRef.current.state === "recording") {
        activeSegmentRecorderRef.current.pause();
      }
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch {}
      }
    }
  }

  // Direct Audio Download (Allows immediate local export of full raw conference recording)
  function handleDownloadMasterAudio() {
    if (masterRecordingChunksRef.current.length === 0) {
      alert("No audio captured yet.");
      return;
    }
    const mimeType = detectedMimeTypeRef.current || "audio/webm";
    const blob = new Blob(masterRecordingChunksRef.current, { type: mimeType });
    const ext = mimeType.includes("mp4") ? "mp4" : "webm";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(eventNameRef.current || "intelexa_capture").replace(/\s+/g, "_")}_${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Final Stop & Analyse Handler (THE ULTIMATE FAIL-SAFE)
  async function handleStop() {
    setStopping(true);
    isStoppingRef.current = true;

    if (timerRef.current) clearInterval(timerRef.current);
    if (segmentCycleTimerRef.current) clearInterval(segmentCycleTimerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    // Stop Web Speech
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch {}
    }

    // Stop active segment recorder
    if (activeSegmentRecorderRef.current && activeSegmentRecorderRef.current.state !== "inactive") {
      try {
        activeSegmentRecorderRef.current.stop();
      } catch {}
    }

    setStoppingStatus("Flushing final audio segments...");

    // Wait for in-flight transcription promises (capped at 3s)
    await new Promise((resolve) => setTimeout(resolve, 400));
    const inFlightWait = Promise.allSettled(inFlightPromisesRef.current);
    const timeoutWait = new Promise((resolve) => setTimeout(resolve, 3000));
    await Promise.race([inFlightWait, timeoutWait]);

    // Build Master Audio Blob from all recorded chunks
    const mimeType = detectedMimeTypeRef.current || "audio/webm";
    const masterBlob =
      masterRecordingChunksRef.current.length > 0
        ? new Blob(masterRecordingChunksRef.current, { type: mimeType })
        : undefined;

    let whisperText = whisperTranscriptRef.current.trim();
    const webSpeechText = webSpeechTranscriptRef.current.trim();

    // FAIL-SAFE MASTER AUDIT:
    // If Whisper intermediate chunks failed or produced less than 10 words, BUT we have master audio,
    // transcribe the FULL master audio blob in one unified pass!
    const whisperWordCount = whisperText ? whisperText.split(/\s+/).filter(Boolean).length : 0;
    if (whisperWordCount < 10 && masterBlob && masterBlob.size > 3000) {
      setStoppingStatus("Transcribing full master capture via Whisper AI...");
      try {
        const fullMasterText = await transcribeAudioBlob(masterBlob, 0, 9999, true);
        if (fullMasterText && fullMasterText.trim().length > 0) {
          whisperText = fullMasterText.trim();
        }
      } catch (masterErr) {
        console.warn("Master audio transcription fallback notice:", masterErr);
      }
    }

    // Combine transcripts with fail-safe fusion:
    let fullText = whisperText;
    if (!fullText || (webSpeechText.length > fullText.length * 1.5 && webSpeechText.length > 30)) {
      fullText = webSpeechText;
    } else if (webSpeechText && !whisperText.includes(webSpeechText.slice(-30))) {
      fullText = whisperText + (whisperText ? " " : "") + webSpeechText;
    }

    if (!fullText) {
      fullText = liveTranscript.trim() || "Audio session completed.";
    }

    // Persist final session state to IndexedDB vault
    saveVaultSession({
      id: activeSessionId,
      durationSeconds: secondsRef.current,
      whisperTranscript: whisperText,
      webSpeechTranscript: webSpeechText,
      finalTranscript: fullText,
    });

    onStopAndAnalyse({
      transcriptText: fullText,
      segments:
        segments.length > 0
          ? segments
          : [{ start: "00:00:00", end: formatTime(secondsRef.current), text: fullText }],
      durationSeconds: secondsRef.current,
      audioBlob: masterBlob,
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
              ? stoppingStatus.toUpperCase()
              : isPaused
              ? "INTELEXA IS PAUSED"
              : "INTELEXA IS CAPTURING & TRANSCRIBING"}
          </h2>
        </div>

        {/* Elapsed Timer Display */}
        <div className="text-4xl sm:text-5xl font-mono font-bold text-ink tracking-tight mt-2">
          {formatTime(seconds)}
        </div>

        {/* Live Audio Level & Sync Status */}
        <div className="mt-3 flex items-center justify-center gap-2 text-xs flex-wrap">
          {/* Live Mic Level */}
          <div className="flex items-center gap-1.5 px-3 py-1 bg-surface border border-border rounded-full shadow-soft">
            <span className="text-ink-muted text-[11px]">Mic Live:</span>
            <div className="w-20 h-2.5 bg-page rounded-full overflow-hidden border border-border">
              <div
                style={{ width: `${Math.max(5, audioLevel)}%` }}
                className={`h-full transition-all duration-75 ${
                  audioLevel > 20
                    ? "bg-good"
                    : audioLevel > 5
                    ? "bg-brand"
                    : "bg-ink-muted/40"
                }`}
              />
            </div>
            <span className="text-[10px] font-mono font-semibold text-ink">{audioLevel}%</span>
          </div>

          {/* Continuous Whisper Status */}
          <div className="flex items-center gap-1.5 px-3 py-1 bg-brand-wash border border-brand/20 text-brand rounded-full font-semibold text-[11px]">
            <span className={`w-1.5 h-1.5 rounded-full ${syncingChunk ? "bg-warning animate-ping" : "bg-good"}`} />
            <span>
              {syncingChunk
                ? "Syncing audio segment..."
                : `Whisper Active • ${chunksSynced} synced (${wordCount} words)`}
            </span>
          </div>

          {/* Local Web Speech Status */}
          {hasWebSpeech && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 rounded-full font-semibold text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Real-Time Device Speech Active</span>
            </div>
          )}
        </div>

        {/* Low Audio Warning Banner */}
        {lowAudioWarning && !isPaused && !stopping && (
          <div className="mt-3 p-2 px-3 bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-xs rounded-xl flex items-center gap-2 animate-fadeIn max-w-md">
            <span>⚠️</span>
            <span>Microphone input is quiet. Please speak closer to your microphone or check microphone volume in system settings.</span>
          </div>
        )}

        <p className="text-xs text-ink-muted mt-2 max-w-md">
          {isPaused
            ? "Capture paused. Click Resume when ready."
            : "Screen kept awake. Continuous master capture is active with instant on-device speech transcription."}
        </p>

        {micError && (
          <div className="mt-4 p-3 bg-critical/10 border border-critical/30 text-critical text-xs rounded-xl max-w-md">
            {micError}
          </div>
        )}
      </div>

      {/* Control Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-md">
        <button
          type="button"
          onClick={handleTogglePause}
          disabled={stopping}
          className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-2xl border border-border bg-surface text-ink text-xs font-bold hover:bg-page transition shadow-soft disabled:opacity-50"
        >
          <Icon name={isPaused ? "play" : "pause"} className="w-4 h-4" />
          {isPaused ? "Resume" : "Pause"}
        </button>

        <button
          type="button"
          onClick={handleDownloadMasterAudio}
          className="w-full sm:w-auto flex items-center justify-center gap-1.5 py-3 px-4 rounded-2xl border border-border bg-surface text-ink text-xs font-semibold hover:bg-page transition shadow-soft"
          title="Save complete raw audio capture to your device files"
        >
          <span>💾</span>
          <span>Audio Backup</span>
        </button>

        <button
          type="button"
          onClick={handleStop}
          disabled={stopping}
          className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 py-3 px-5 rounded-2xl bg-critical text-white text-xs font-bold hover:bg-critical/90 transition shadow-soft disabled:opacity-50"
        >
          <Icon name="stop" className="w-4 h-4" />
          {stopping ? "Finalizing..." : "Stop & Audit"}
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
              <span>🎙️ Live Transcript Stream</span>
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
                  Transcribing...
                </span>
              )}
            </div>
          </div>

          <VScroller className="max-h-48 rounded-xl bg-page/60 border border-border font-mono text-[11.5px]" trackClassName="p-3 leading-relaxed space-y-1 text-ink-2">
            {liveTranscript ? (
              <>
                <div>{liveTranscript}</div>
                {interimSpeech && (
                  <div className="text-brand/80 italic animate-pulse">{interimSpeech}</div>
                )}
              </>
            ) : interimSpeech ? (
              <div className="text-brand/80 italic animate-pulse">{interimSpeech}</div>
            ) : (
              <span className="text-ink-muted italic">
                Listening to audio... Words appear in real-time as you speak.
              </span>
            )}
          </VScroller>
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
                No high-priority signals detected yet. Speaking content is analyzed continuously.
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
