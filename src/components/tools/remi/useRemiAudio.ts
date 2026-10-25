"use client";

// Dr.Remi audio layer for the browser:
//  - microphone capture (pick any input, incl. Bluetooth headsets/speakerphones)
//  - tap-to-talk OR hands-free "conversation mode" with simple voice-activity
//    detection (auto-stops after a pause, pauses itself while Remi speaks)
//  - playback routed to a chosen output device (setSinkId) -> Bluetooth speakers
//  - browser speech-synthesis fallback when server TTS is unavailable
import { useCallback, useEffect, useRef, useState } from "react";

export type AudioDevice = { deviceId: string; label: string };

type SinkAudio = HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return "";
}

// 50ms of silence as a valid WAV data URI, used to unlock autoplay inside a gesture.
const SILENT_WAV = (() => {
  if (typeof btoa === "undefined") return "";
  const n = 400; // samples @ 8kHz
  const buf = new Uint8Array(44 + n);
  const dv = new DataView(buf.buffer);
  const w = (o: number, s: string) => [...s].forEach((c, i) => buf[o + i] = c.charCodeAt(0));
  w(0, "RIFF"); dv.setUint32(4, 36 + n, true); w(8, "WAVE"); w(12, "fmt ");
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true);
  w(36, "data"); dv.setUint32(40, n, true); buf.fill(128, 44);
  let s = ""; buf.forEach((b) => (s += String.fromCharCode(b)));
  return `data:audio/wav;base64,${btoa(s)}`;
})();

async function blobToBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

export function useRemiAudio(opts: {
  onUtterance: (audioBase64: string, mime: string) => void;
}) {
  const onUtteranceRef = useRef(opts.onUtterance);
  onUtteranceRef.current = opts.onUtterance;

  const [inputs, setInputs] = useState<AudioDevice[]>([]);
  const [outputs, setOutputs] = useState<AudioDevice[]>([]);
  const [inputId, setInputId] = useState<string>("default");
  const [outputId, setOutputId] = useState<string>("default");
  const [recording, setRecording] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [level, setLevel] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const sinkSupported = typeof window !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;

  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioRef = useRef<SinkAudio | null>(null);
  const speakingRef = useRef(false);
  const handsFreeRef = useRef(false);
  const busyRef = useRef(false); // set by the caller while a turn is in flight
  const vad = useRef({ voiced: false, lastVoice: 0, startedAt: 0 });

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const list = await navigator.mediaDevices.enumerateDevices();
    const fmt = (d: MediaDeviceInfo, i: number, kind: string) => ({
      deviceId: d.deviceId,
      label: d.label || `${kind} ${i + 1}`,
    });
    setInputs(list.filter((d) => d.kind === "audioinput").map((d, i) => fmt(d, i, "Microphone")));
    setOutputs(list.filter((d) => d.kind === "audiooutput").map((d, i) => fmt(d, i, "Speaker")));
  }, []);

  useEffect(() => {
    refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
  }, [refreshDevices]);

  const stopStream = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    analyserRef.current = null;
    setLevel(0);
  }, []);

  const ensureStream = useCallback(async () => {
    if (streamRef.current) return streamRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: inputId && inputId !== "default" ? { exact: inputId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      src.connect(an);
      ctxRef.current = ctx;
      analyserRef.current = an;
      setMicError(null);
      refreshDevices();
      return stream;
    } catch (e) {
      const msg =
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Microphone permission was blocked. Allow it in the browser's address bar."
          : "No microphone found. Connect a mic or Bluetooth headset/speakerphone.";
      setMicError(msg);
      throw e;
    }
  }, [inputId, refreshDevices]);

  const startRecorder = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || recRef.current) return;
    const mime = pickMime();
    const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    chunksRef.current = [];
    rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
    rec.onstop = async () => {
      const type = rec.mimeType || mime || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      recRef.current = null;
      setRecording(false);
      const dur = Date.now() - vad.current.startedAt;
      if (blob.size < 2500 || dur < 450) return; // too short to be speech
      onUtteranceRef.current(await blobToBase64(blob), type);
    };
    rec.start(250);
    recRef.current = rec;
    vad.current.startedAt = Date.now();
    setRecording(true);
  }, []);

  const stopRecorder = useCallback(() => {
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
  }, []);

  // Level meter + voice activity detection loop.
  const loop = useCallback(() => {
    const an = analyserRef.current;
    if (!an) return;
    const data = new Uint8Array(an.fftSize);
    an.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    setLevel(Math.min(1, rms * 6));
    const now = Date.now();
    if (handsFreeRef.current && !speakingRef.current && !busyRef.current) {
      const loud = rms > 0.035;
      if (loud) {
        vad.current.lastVoice = now;
        if (!recRef.current) {
          vad.current.voiced = true;
          startRecorder();
        }
      } else if (recRef.current && vad.current.voiced && now - vad.current.lastVoice > 1300) {
        vad.current.voiced = false;
        stopRecorder();
      }
      if (recRef.current && now - vad.current.startedAt > 45_000) stopRecorder();
    }
    rafRef.current = requestAnimationFrame(loop);
  }, [startRecorder, stopRecorder]);

  /** Tap-to-talk: first tap starts, second tap sends. */
  const toggleTalk = useCallback(async () => {
    if (recRef.current) {
      stopRecorder();
      return;
    }
    stopPlayback();
    await ensureStream();
    if (!rafRef.current) rafRef.current = requestAnimationFrame(loop);
    startRecorder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ensureStream, loop, startRecorder, stopRecorder]);

  const setConversationMode = useCallback(
    async (on: boolean) => {
      handsFreeRef.current = on;
      setHandsFree(on);
      if (on) {
        await ensureStream();
        if (!rafRef.current) rafRef.current = requestAnimationFrame(loop);
      } else {
        stopRecorder();
        stopStream();
      }
    },
    [ensureStream, loop, stopRecorder, stopStream]
  );

  const setBusy = useCallback((b: boolean) => {
    busyRef.current = b;
  }, []);

  // ------------------------------------------------------------ playback
  const getAudio = useCallback(() => {
    if (!audioRef.current) audioRef.current = new Audio() as SinkAudio;
    return audioRef.current;
  }, []);

  /** Call inside a user gesture once, so later auto-play is allowed (iOS/Chrome). */
  const unlock = useCallback(() => {
    const a = getAudio();
    a.muted = true;
    a.src = SILENT_WAV;
    a.play().then(() => a.pause()).catch(() => {}).finally(() => (a.muted = false));
    try {
      window.speechSynthesis?.getVoices();
    } catch {
      /* ignore */
    }
  }, [getAudio]);

  const stopPlayback = useCallback(() => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
    }
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
    speakingRef.current = false;
    setSpeaking(false);
  }, []);

  const playUrl = useCallback(
    async (url: string) => {
      const a = getAudio();
      if (sinkSupported && a.setSinkId) {
        try {
          await a.setSinkId(outputId === "default" ? "" : outputId);
        } catch {
          /* device vanished -> default */
        }
      }
      a.src = url;
      speakingRef.current = true;
      setSpeaking(true);
      // Drop anything recorded while Remi was talking (echo protection).
      if (recRef.current) {
        chunksRef.current = [];
        recRef.current.ondataavailable = null;
        recRef.current.onstop = () => {
          recRef.current = null;
          setRecording(false);
        };
        recRef.current.stop();
      }
      await new Promise<void>((resolve) => {
        const done = () => {
          a.onended = null;
          a.onerror = null;
          resolve();
        };
        a.onended = done;
        a.onerror = done;
        a.play().catch(done);
      });
      speakingRef.current = false;
      setSpeaking(false);
      vad.current.lastVoice = 0;
    },
    [getAudio, outputId, sinkSupported]
  );

  const speakBrowser = useCallback(async (text: string, bcp47: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = bcp47;
    const voices = synth.getVoices();
    const lang = bcp47.toLowerCase();
    u.voice =
      voices.find((v) => v.lang.toLowerCase() === lang) ||
      voices.find((v) => v.lang.toLowerCase().startsWith(lang.split("-")[0])) ||
      null;
    speakingRef.current = true;
    setSpeaking(true);
    await new Promise<void>((resolve) => {
      u.onend = () => resolve();
      u.onerror = () => resolve();
      synth.speak(u);
    });
    speakingRef.current = false;
    setSpeaking(false);
  }, []);

  useEffect(
    () => () => {
      stopRecorder();
      stopStream();
      stopPlayback();
    },
    [stopRecorder, stopStream, stopPlayback]
  );

  return {
    inputs,
    outputs,
    inputId,
    outputId,
    setInputId: (id: string) => {
      setInputId(id);
      stopStream();
    },
    setOutputId,
    sinkSupported,
    recording,
    handsFree,
    level,
    speaking,
    micError,
    toggleTalk,
    setConversationMode,
    setBusy,
    unlock,
    playUrl,
    speakBrowser,
    stopPlayback,
    refreshDevices,
  };
}
