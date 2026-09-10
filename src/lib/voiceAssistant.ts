// Voice Assistant Service: Speech Recognition & Text-to-Speech Synthesis
// Provides cross-browser Web Speech API abstraction with continuous listening,
// interim result callbacks, and natural voice readout.

export type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

export function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognition() !== null;
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * Text-to-Speech synthesizer
 */
export function speakText(
  text: string,
  options?: {
    enabled?: boolean;
    rate?: number;
    pitch?: number;
    voiceIndex?: number;
  }
) {
  if (options?.enabled === false) return;
  if (!isSpeechSynthesisSupported()) return;

  try {
    window.speechSynthesis.cancel(); // cancel any active utterance

    const cleanText = text
      .replace(/₹/g, "Rupees ")
      .replace(/\$/g, "Dollars ")
      .replace(/×/g, " times ")
      .replace(/÷/g, " divided by ")
      .replace(/%/g, " percent ");

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = options?.rate ?? 1.05;
    utterance.pitch = options?.pitch ?? 1.0;

    // Pick an English voice if available
    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length > 0) {
      const englishVoice =
        voices.find((v) => v.lang.startsWith("en-IN")) ||
        voices.find((v) => v.lang.startsWith("en-US")) ||
        voices.find((v) => v.lang.startsWith("en"));
      if (englishVoice) utterance.voice = englishVoice;
    }

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn("[VoiceAssistant] Speech synthesis failed:", err);
  }
}

export function stopSpeaking() {
  if (isSpeechSynthesisSupported()) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }
}
