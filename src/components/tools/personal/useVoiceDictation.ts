"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Web Speech API interface definitions for TypeScript
interface ISpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface ISpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((this: ISpeechRecognition, ev: Event) => void) | null;
  onend: ((this: ISpeechRecognition, ev: Event) => void) | null;
  onerror: ((this: ISpeechRecognition, ev: ISpeechRecognitionErrorEvent) => void) | null;
  onresult: ((this: ISpeechRecognition, ev: ISpeechRecognitionEvent) => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: {
      new (): ISpeechRecognition;
    };
    webkitSpeechRecognition?: {
      new (): ISpeechRecognition;
    };
  }
}

export type VoiceDictationState = {
  isSupported: boolean;
  isRecording: boolean;
  isPaused: boolean;
  durationSec: number;
  transcript: string;
  interimTranscript: string;
  error: string | null;
};

export function useVoiceDictation() {
  const [isSupported, setIsSupported] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const manualStopRef = useRef(false);
  const transcriptRef = useRef("");

  // Keep transcriptRef in sync so callbacks see the latest text without re-attaching listeners
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const hasSupport = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
      setIsSupported(hasSupport);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const startRecording = useCallback(() => {
    if (typeof window === "undefined") return;
    const SpeechConstructor = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechConstructor) {
      setError("Speech recognition is not supported in this browser. Please use Google Chrome, Edge, or Safari.");
      return;
    }

    setError(null);
    setTranscript("");
    setInterimTranscript("");
    setDurationSec(0);
    manualStopRef.current = false;

    try {
      const recognition = new SpeechConstructor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = navigator.language || "en-US";

      recognition.onstart = () => {
        setIsRecording(true);
        setIsPaused(false);
        // Start duration timer
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
          setDurationSec((prev) => prev + 1);
        }, 1000);
      };

      recognition.onresult = (event: ISpeechRecognitionEvent) => {
        let finalChunk = "";
        let interimChunk = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const result = event.results[i];
          if (result.isFinal) {
            finalChunk += result[0].transcript + " ";
          } else {
            interimChunk += result[0].transcript;
          }
        }

        if (finalChunk) {
          setTranscript((prev) => (prev ? prev.trim() + " " + finalChunk.trim() : finalChunk.trim()));
        }
        setInterimTranscript(interimChunk);
      };

      recognition.onerror = (event: ISpeechRecognitionErrorEvent) => {
        if (event.error === "no-speech") {
          // Normal silence, don't show an intrusive error
          return;
        }
        if (event.error === "not-allowed") {
          setError("Microphone permission was denied. Please allow microphone access in your browser settings.");
        } else if (event.error === "network") {
          setError("Speech recognition network error. Please check your internet connection.");
        } else {
          setError(`Audio error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        // If the browser terminated unexpectedly (e.g. timeout on silence) and the user didn't stop it:
        if (!manualStopRef.current && recognitionRef.current) {
          try {
            recognitionRef.current.start();
            return;
          } catch {
            // failed to restart, finalize
          }
        }
        setIsRecording(false);
        setIsPaused(false);
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start microphone.");
      setIsRecording(false);
    }
  }, []);

  const stopRecording = useCallback((): string => {
    manualStopRef.current = true;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    setIsRecording(false);
    setIsPaused(false);

    // Combine any pending interim transcript with final transcript
    const fullText = (transcriptRef.current + " " + interimTranscript).trim();
    setInterimTranscript("");
    return fullText;
  }, [interimTranscript]);

  const pauseRecording = useCallback(() => {
    if (!isRecording || isPaused) return;
    if (timerRef.current) clearInterval(timerRef.current);
    if (recognitionRef.current) {
      manualStopRef.current = true;
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
    setIsPaused(true);
  }, [isRecording, isPaused]);

  const resumeRecording = useCallback(() => {
    if (!isRecording || !isPaused) return;
    manualStopRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
        setIsPaused(false);
        timerRef.current = setInterval(() => {
          setDurationSec((prev) => prev + 1);
        }, 1000);
      } catch {
        // restart fresh if needed
        startRecording();
      }
    }
  }, [isRecording, isPaused, startRecording]);

  const reset = useCallback(() => {
    manualStopRef.current = true;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    setIsRecording(false);
    setIsPaused(false);
    setDurationSec(0);
    setTranscript("");
    setInterimTranscript("");
    setError(null);
  }, []);

  return {
    isSupported,
    isRecording,
    isPaused,
    durationSec,
    transcript,
    interimTranscript,
    fullTranscript: (transcript + (interimTranscript ? " " + interimTranscript : "")).trim(),
    error,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    reset,
  };
}
