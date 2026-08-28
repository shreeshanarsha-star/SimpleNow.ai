"use client";
import { useEffect, useRef, useState } from "react";
import GauriFace3D from "@/components/gauri/GauriFace3D";
import GauriThemeBackground from "@/components/gauri/GauriThemeBackground";
import { DEFAULT_THEME, getThemeAccentStyle } from "@/components/gauri/gauriThemes";

// The Gauri.ai expressive avatar — farmer intake, a hands-free conversation.
// Greets automatically, guesses the farmer's language from their location,
// listens without needing a tap, and adapts language turn by turn based on
// what the farmer actually says. Only on explicit "yes" does a case get
// created — the conversation itself never claims to be a diagnosis, and the
// vet still reviews and can correct everything before any product ships.
//
// Ported verbatim (behavior unchanged) from askshree-app (v1)'s
// app/gauri/page.js. One deliberate simplification: v1 let the site admin
// pick a different background mood via a whole separate theme-switcher
// system (useTheme()/`/api/site-theme`) that v2 doesn't have; this fixes
// Gauri.ai to that system's actual default, 'stellar-network', which is
// exactly what farmers saw unless an admin had changed it.
const LANGUAGES = [
  { code: "English", speechLang: "en-IN", label: "English" },
  { code: "Hindi", speechLang: "hi-IN", label: "हिंदी" },
  { code: "Kannada", speechLang: "kn-IN", label: "ಕನ್ನಡ" },
  { code: "Tamil", speechLang: "ta-IN", label: "தமிழ்" },
  { code: "Telugu", speechLang: "te-IN", label: "తెలుగు" },
  { code: "Marathi", speechLang: "mr-IN", label: "मराठी" },
  { code: "Bengali", speechLang: "bn-IN", label: "বাংলা" },
  { code: "Gujarati", speechLang: "gu-IN", label: "ગુજરાતી" },
  { code: "Punjabi", speechLang: "pa-IN", label: "ਪੰਜਾਬੀ" },
  { code: "Malayalam", speechLang: "ml-IN", label: "മലയാളം" },
];
const GREETING: Record<string, string> = {
  English: "Namaste. I am Gauri. Please tell me what's happening with your cow — I'm listening.",
  Hindi: "नमस्ते। मैं गौरी हूँ। कृपया बताइए आपकी गाय को क्या हुआ है — मैं सुन रही हूँ।",
  Kannada: "ನಮಸ್ತೆ. ನಾನು ಗೌರಿ. ದಯವಿಟ್ಟು ನಿಮ್ಮ ಹಸುವಿಗೆ ಏನಾಗಿದೆ ಎಂದು ಹೇಳಿ — ನಾನು ಕೇಳುತ್ತಿದ್ದೇನೆ.",
  Tamil: "வணக்கம். நான் கௌரி. உங்கள் பசுவுக்கு என்ன ஆனது என்று சொல்லுங்கள் — நான் கேட்டுக்கொண்டிருக்கிறேன்.",
  Telugu: "నమస్తే. నేను గౌరి. మీ ఆవుకు ఏమైందో దయచేసి చెప్పండి — నేను వింటున్నాను.",
  Marathi: "नमस्कार. मी गौरी आहे. कृपया सांगा तुमच्या गायीला काय झाले आहे — मी ऐकत आहे.",
  Bengali: "নমস্কার। আমি গৌরী। দয়া করে বলুন আপনার গরুর কী হয়েছে — আমি শুনছি।",
  Gujarati: "નમસ્તે. હું ગૌરી છું. કૃપા કરી કહો તમારી ગાયને શું થયું છે — હું સાંભળી રહી છું.",
  Punjabi: "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ। ਮੈਂ ਗੌਰੀ ਹਾਂ। ਕਿਰਪਾ ਕਰਕੇ ਦੱਸੋ ਤੁਹਾਡੀ ਗਾਂ ਨੂੰ ਕੀ ਹੋਇਆ ਹੈ — ਮੈਂ ਸੁਣ ਰਹੀ ਹਾਂ।",
  Malayalam: "നമസ്തേ. ഞാൻ ഗൗരി. നിങ്ങളുടെ പശുവിന് എന്ത് സംഭവിച്ചു എന്ന് ദയവായി പറയൂ — ഞാൻ കേൾക്കുന്നു.",
};
const STATE_LANGUAGE: Record<string, string> = {
  Karnataka: "Kannada",
  "Tamil Nadu": "Tamil",
  "Andhra Pradesh": "Telugu",
  Telangana: "Telugu",
  Maharashtra: "Marathi",
  "West Bengal": "Bengali",
  Gujarat: "Gujarati",
  Punjab: "Punjabi",
  Kerala: "Malayalam",
};

interface Message { role: "farmer" | "gauri"; text: string; }
interface ConfirmData {
  surfaceDiagnosis?: string | null;
  suggestedProductName?: string | null;
  suggestedProductId?: string | null;
  urgency?: string | null;
}

// Minimal shape of the browser's (non-standard, vendor-prefixed) Web Speech
// API SpeechRecognition object -- there's no official TS lib type for it.
interface SpeechRecognitionResultEventLike {
  resultIndex: number;
  results: { [i: number]: { [j: number]: { transcript: string }; isFinal: boolean }; length: number };
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onstart: (() => void) | null;
  onresult: ((e: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
}

export default function GauriAvatarPage() {
  const [language, setLanguage] = useState("Hindi");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"" | "listening" | "thinking" | "speaking">("");
  const [busy, setBusy] = useState(false);
  const [confirmData, setConfirmData] = useState<ConfirmData | null>(null);
  const [showConfirmForm, setShowConfirmForm] = useState(false);
  const [farmerName, setFarmerName] = useState("");
  const [farmerPhone, setFarmerPhone] = useState("");
  const [farmerAddress, setFarmerAddress] = useState("");
  const [cowDetails, setCowDetails] = useState("");
  const [note, setNote] = useState("");
  const [caseCreated, setCaseCreated] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [micBlocked, setMicBlocked] = useState(false);
  const [viseme, setViseme] = useState("closed");

  const visemeTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const boundaryFired = useRef(false);
  const wordIndex = useRef(0);
  const chatRef = useRef<HTMLDivElement | null>(null);
  const languageRef = useRef(language);
  const showConfirmFormRef = useRef(false);
  const caseCreatedRef = useRef<string | null>(null);
  const micBlockedRef = useRef(false);
  const startedOnceRef = useRef(false);

  useEffect(() => { languageRef.current = language; }, [language]);
  useEffect(() => { showConfirmFormRef.current = showConfirmForm; }, [showConfirmForm]);
  useEffect(() => { caseCreatedRef.current = caseCreated; }, [caseCreated]);
  useEffect(() => { micBlockedRef.current = micBlocked; }, [micBlocked]);

  useEffect(() => () => stopVisemeFallback(), []);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (startedOnceRef.current) return;
    startedOnceRef.current = true;
    let settled = false;
    const fallback = setTimeout(() => {
      if (!settled) { settled = true; beginConversation("Hindi"); }
    }, 3500);

    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (settled) return;
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
          );
          const geo = await res.json();
          let guess = "English";
          if ((geo.countryCode || "").toUpperCase() === "IN") {
            guess = STATE_LANGUAGE[geo.principalSubdivision] || "Hindi";
          }
          if (!settled) { settled = true; clearTimeout(fallback); beginConversation(guess); }
        } catch {
          if (!settled) { settled = true; clearTimeout(fallback); beginConversation("Hindi"); }
        }
      },
      () => { if (!settled) { settled = true; clearTimeout(fallback); beginConversation("Hindi"); } },
      { timeout: 3000, maximumAge: 600000 }
    );
    return () => clearTimeout(fallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickViseme(word: string, index: number) {
    const w = (word || "").toLowerCase();
    if (/[oôöòóõu]/.test(w)) return "round";
    if (/[aáàâäeéèêë]/.test(w)) return "wide";
    if (/[a-z]/.test(w)) return "narrow";
    const cycle = ["narrow", "wide", "round", "wide"];
    return cycle[(index + w.length) % cycle.length];
  }

  function stopVisemeFallback() {
    if (visemeTimer.current) { clearInterval(visemeTimer.current); visemeTimer.current = null; }
  }

  function speak(text: string, onDone?: () => void) {
    stopVisemeFallback();
    if (!window.speechSynthesis) { setMode(""); onDone?.(); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const langInfo = LANGUAGES.find((l) => l.code === languageRef.current) || LANGUAGES[0];
    const vs = window.speechSynthesis.getVoices();
    const langPrefix = langInfo.speechLang.split("-")[0];
    u.voice =
      vs.find((v) => v.lang?.toLowerCase().startsWith(langPrefix)) ||
      vs.find((v) => /female|samantha|zira/i.test(v.name)) ||
      vs[0];
    u.lang = langInfo.speechLang;
    u.rate = 0.88;
    u.pitch = 0.98;
    u.volume = 1;
    let started = false;
    boundaryFired.current = false;
    wordIndex.current = 0;
    u.onboundary = (e) => {
      boundaryFired.current = true;
      const word = text.substr(e.charIndex, e.charLength || 6);
      setViseme(pickViseme(word, wordIndex.current++));
    };
    u.onstart = () => {
      started = true;
      setNeedsTap(false);
      setMode("speaking");
      setTimeout(() => {
        if (!boundaryFired.current && window.speechSynthesis.speaking) {
          const options = ["narrow", "wide", "round"];
          visemeTimer.current = setInterval(() => {
            setViseme((prev) => {
              const pick = options[Math.floor(Math.random() * options.length)];
              return pick === prev ? options[(options.indexOf(pick) + 1) % options.length] : pick;
            });
          }, 150);
        }
      }, 450);
    };
    u.onend = () => { stopVisemeFallback(); setViseme("closed"); setMode(""); onDone?.(); };
    u.onerror = () => { stopVisemeFallback(); setViseme("closed"); setMode(""); onDone?.(); };
    window.speechSynthesis.speak(u);
    setTimeout(() => { if (!started) setNeedsTap(true); }, 1200);
  }

  function tapToBegin() {
    setNeedsTap(false);
    const last = messages[messages.length - 1];
    if (last && last.role === "gauri") {
      speak(last.text, autoListenAfterSpeak);
    } else {
      beginConversation(languageRef.current);
    }
  }

  function autoListenAfterSpeak() {
    if (showConfirmFormRef.current || caseCreatedRef.current || micBlockedRef.current) return;
    startListening();
  }

  function startListening() {
    const SRCtor =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
    if (!SRCtor) { setNote("Voice isn't supported in this browser — please type instead."); return; }
    const langInfo = LANGUAGES.find((l) => l.code === languageRef.current) || LANGUAGES[0];
    const r = new SRCtor();
    r.lang = langInfo.speechLang;
    r.interimResults = true;
    r.continuous = false;
    let finalText = "";
    r.onstart = () => setMode("listening");
    r.onresult = (e: SpeechRecognitionResultEventLike) => {
      let s = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        s += e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText = s;
      }
      setInput(s);
    };
    r.onerror = (e: { error: string }) => {
      setMode("");
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setMicBlocked(true);
        setNote("Microphone access is blocked — please type your answer instead.");
      }
    };
    r.onend = () => {
      setMode("");
      const text = (finalText || "").trim();
      if (text) sendMessage(text);
    };
    try { r.start(); } catch { /* already running */ }
  }

  async function beginConversation(lang: string) {
    if (lang) setLanguage(lang);
    setStarted(true);
    const greetText = GREETING[lang] || GREETING.Hindi;
    const greetMsg: Message = { role: "gauri", text: greetText };
    setMessages([greetMsg]);
    speak(greetText, autoListenAfterSpeak);
  }

  async function sendMessage(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || busy) return;
    const newMessages: Message[] = [...messages, { role: "farmer", text }];
    setMessages(newMessages);
    setInput("");
    setBusy(true);
    setNote("");
    setMode("thinking");

    const res = await fetch("/api/gauri/converse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: newMessages, cowDetails, language: languageRef.current }),
    }).catch(() => null);

    setBusy(false);
    if (!res || !res.ok) {
      setMode("");
      setNote("Gauri couldn't respond just now — please try again.");
      return;
    }
    const data = await res.json();

    if (data.detectedLanguage && LANGUAGES.some((l) => l.code === data.detectedLanguage)) {
      setLanguage(data.detectedLanguage);
      languageRef.current = data.detectedLanguage;
    }

    const gauriMsg: Message = { role: "gauri", text: data.reply };
    setMessages((m) => [...m, gauriMsg]);

    if (data.ready) {
      setConfirmData({
        surfaceDiagnosis: data.surfaceDiagnosis,
        suggestedProductName: data.suggestedProductName,
        suggestedProductId: data.suggestedProductId,
        urgency: data.urgency,
      });
      setShowConfirmForm(true);
      speak(data.reply);
    } else {
      speak(data.reply, autoListenAfterSpeak);
    }
  }

  async function confirmYes() {
    if (!farmerPhone.trim()) { setNote("A phone number is needed so the vet can call you."); return; }
    setBusy(true);
    setNote("");
    const res = await fetch("/api/gauri/cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationTranscript: messages,
        farmerName, farmerPhone, farmerAddress, cowDetails,
        surfaceDiagnosis: confirmData?.surfaceDiagnosis,
        suggestedProductId: confirmData?.suggestedProductId,
        urgency: confirmData?.urgency,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.ok) {
      setCaseCreated(data.caseId);
      caseCreatedRef.current = data.caseId;
      const bye = `Thank you. A vet will call you at ${farmerPhone} shortly. You can also check this link anytime for updates.`;
      setMessages((m) => [...m, { role: "gauri", text: bye }]);
      speak(bye);
    } else {
      setNote(data.error || "Could not submit that. Try again.");
    }
  }

  function confirmNo() {
    setShowConfirmForm(false);
    setConfirmData(null);
    const bye = "No problem. Feel free to tell me more, or come back anytime.";
    setMessages((m) => [...m, { role: "gauri", text: bye }]);
    speak(bye, autoListenAfterSpeak);
  }

  const accentStyle = getThemeAccentStyle(DEFAULT_THEME);
  const expression: "neutral" | "happy" | "concerned" =
    micBlocked || note ? "concerned" : showConfirmForm ? "happy" : "neutral";

  if (caseCreated) {
    return (
      <div style={{ position: "relative", minHeight: "100vh", ...accentStyle }}>
        <GauriThemeBackground themeId={DEFAULT_THEME} />
        <div style={{ position: "relative", zIndex: 1, padding: "44px 24px 80px", maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
          <div className="eyebrow">Gauri.ai</div>
          <h1 className="serif" style={{ fontSize: 24, color: "var(--cream)", margin: "8px 0 12px" }}>A vet will call you shortly</h1>
          <p style={{ color: "var(--slate)", fontSize: 14, lineHeight: 1.7, marginTop: 12 }}>
            Save this link to check status and see what&rsquo;s happening with your delivery:
          </p>
          <div className="file-hint" style={{ marginTop: 16, wordBreak: "break-all" }}>
            <a href={`/gauri/status/${caseCreated}`} style={{ color: "var(--amber)" }}>askshree.com/gauri/status/{caseCreated}</a>
          </div>
          <button className="primary-btn" style={{ marginTop: 24 }} onClick={() => window.location.reload()}>
            Report another issue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", minHeight: "100vh", ...accentStyle }}>
      <GauriThemeBackground themeId={DEFAULT_THEME} />
      <div style={{ position: "relative", zIndex: 1, padding: "36px 24px 80px", maxWidth: 1080, margin: "0 auto" }}>
        <div className="eyebrow" style={{ textAlign: "center" }}>Gauri.ai</div>

        <div className="gav-shell">
          <div className="gav-shell-col">
            <div className="gav-shell-label">Face</div>
            <div
              className={`gav-stage ${mode === "speaking" ? "gav-speaking" : ""} ${mode === "listening" ? "gav-listening" : ""} ${mode === "thinking" ? "gav-thinking" : ""}`}
            >
              <GauriFace3D mode={mode} viseme={viseme} expression={expression} />
              <div className="gav-status">
                {mode === "speaking"
                  ? "Gauri is speaking…"
                  : mode === "listening"
                  ? "Gauri is listening…"
                  : mode === "thinking"
                  ? "Gauri is thinking…"
                  : started
                  ? "Ready"
                  : "Getting ready…"}
              </div>
              {needsTap && (
                <div className="gav-tap-overlay" onClick={tapToBegin}>
                  <div className="gav-tap-card">Tap to start</div>
                </div>
              )}
            </div>
          </div>

          <div className="gav-shell-col">
            <div className="gav-shell-label">Workspace</div>
            {started ? (
              <>
                <div className="gav-chat" ref={chatRef}>
                  {messages.map((m, i) => (
                    <div key={i} className={`gav-bubble ${m.role}`}>{m.text}</div>
                  ))}
                  {busy && <div className="gav-bubble gauri" style={{ opacity: 0.6 }}>…</div>}
                </div>

                {!showConfirmForm && (
                  <div className="gav-controls">
                    <input
                      className="free-text-input"
                      placeholder="Just speak — or type here…"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                    />
                    <button className="primary-btn" style={{ marginTop: 0 }} onClick={() => sendMessage()} disabled={busy}>Send</button>
                    <button
                      className="primary-btn"
                      style={{ marginTop: 0, background: "transparent", color: "var(--amber)" }}
                      onClick={startListening}
                      disabled={busy || micBlocked}
                    >
                      🎙
                    </button>
                  </div>
                )}

                {showConfirmForm && confirmData && (
                  <div className="gav-confirm">
                    <div style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 500, fontSize: 11, color: "var(--amber)", textTransform: "uppercase", marginBottom: 8 }}>
                      Confirm to get a vet callback
                    </div>
                    <div style={{ fontSize: 13, color: "var(--cream)", marginBottom: 4 }}>
                      <b>At a surface level:</b> {confirmData.surfaceDiagnosis}
                    </div>
                    {confirmData.suggestedProductName && (
                      <div style={{ fontSize: 13, color: "var(--cream)" }}><b>May help:</b> {confirmData.suggestedProductName}</div>
                    )}
                    <div className="row">
                      <input className="free-text-input" placeholder="Your name" value={farmerName} onChange={(e) => setFarmerName(e.target.value)} />
                      <input className="free-text-input" placeholder="Phone number (required)" value={farmerPhone} onChange={(e) => setFarmerPhone(e.target.value)} />
                    </div>
                    <div className="row">
                      <input className="free-text-input" placeholder="Village / address (for delivery)" value={farmerAddress} onChange={(e) => setFarmerAddress(e.target.value)} />
                      <input className="free-text-input" placeholder="Cow details — breed, age" value={cowDetails} onChange={(e) => setCowDetails(e.target.value)} />
                    </div>
                    <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                      <button className="primary-btn" style={{ marginTop: 0 }} onClick={confirmYes} disabled={busy}>Yes, have a vet call me</button>
                      <button
                        className="primary-btn"
                        style={{ marginTop: 0, background: "transparent", color: "var(--slate)", borderColor: "var(--line)" }}
                        onClick={confirmNo}
                        disabled={busy}
                      >
                        Not now
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="gav-shell-empty">Gauri will start the conversation as soon as she&rsquo;s ready — just a moment…</div>
            )}
          </div>
        </div>

        {note && <div className="file-hint" style={{ textAlign: "center", marginTop: 14 }}>{note}</div>}
      </div>
    </div>
  );
}
