"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Icon from "@/components/Icon";
import {
  parseSpokenMath,
  formatNumber,
  numberToWords,
  calculateLoanEmi,
  ParsedVoiceResult,
} from "@/lib/voiceMathParser";
import {
  getSpeechRecognition,
  isSpeechRecognitionSupported,
  speakText,
  stopSpeaking,
} from "@/lib/voiceAssistant";

export interface HistoryItem {
  id: string;
  timestamp: string;
  expression: string;
  result: number;
  formattedResult: string;
  spokenText?: string;
  label?: string;
  type?: "VOICE" | "MANUAL" | "GST" | "MARGIN" | "EMI";
}

const STORAGE_KEY_HISTORY = "simplenow_calc_history_v2";
const STORAGE_KEY_VOICE_OUT = "simplenow_calc_voice_output";

export default function Calculator() {
  // Calculator Core State
  const [expression, setExpression] = useState("");
  const [display, setDisplay] = useState("0");
  const [memory, setMemory] = useState(0);
  const [justEvaluated, setJustEvaluated] = useState(false);
  const [numberFormatIndian, setNumberFormatIndian] = useState(true);

  // Voice Assistant State
  const [isListening, setIsListening] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(true);
  const [lastHeardSpeech, setLastHeardSpeech] = useState<string | null>(null);
  const [lastVoiceDetails, setLastVoiceDetails] = useState<ParsedVoiceResult["details"] | null>(null);
  const [speechSupported, setSpeechSupported] = useState(true);

  // Modes: standard | gst | margin | emi
  const [activeTab, setActiveTab] = useState<"standard" | "gst" | "margin" | "emi">("standard");

  // History / Audit Tape State
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [tempLabel, setTempLabel] = useState("");

  // Specialized Tool State - GST
  const [gstBaseAmount, setGstBaseAmount] = useState<string>("10000");
  const [gstRate, setGstRate] = useState<number>(18);
  const [gstMode, setGstMode] = useState<"add" | "remove">("add");

  // Specialized Tool State - Margin
  const [marginCost, setMarginCost] = useState<string>("500");
  const [marginSelling, setMarginSelling] = useState<string>("800");

  // Specialized Tool State - Loan EMI
  const [emiPrincipal, setEmiPrincipal] = useState<string>("500000");
  const [emiRate, setEmiRate] = useState<string>("8.5");
  const [emiTenureMonths, setEmiTenureMonths] = useState<string>("36");

  const recognitionRef = useRef<any>(null);
  const handsFreeRef = useRef(handsFree);
  handsFreeRef.current = handsFree;
  const voiceOutputRef = useRef(voiceOutputEnabled);
  voiceOutputRef.current = voiceOutputEnabled;

  // -------------------------------------------------------------
  // 1. Load Stored Settings & History on Mount
  // -------------------------------------------------------------
  useEffect(() => {
    setSpeechSupported(isSpeechRecognitionSupported());

    try {
      const savedHistory = localStorage.getItem(STORAGE_KEY_HISTORY);
      if (savedHistory) {
        setHistory(JSON.parse(savedHistory));
      }
      const savedVoiceOut = localStorage.getItem(STORAGE_KEY_VOICE_OUT);
      if (savedVoiceOut !== null) {
        setVoiceOutputEnabled(savedVoiceOut === "true");
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Save history to localStorage
  const saveHistoryToStorage = (updated: HistoryItem[]) => {
    setHistory(updated);
    try {
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(updated.slice(0, 100)));
    } catch {
      /* ignore */
    }
  };

  const addToHistory = useCallback(
    (item: Omit<HistoryItem, "id" | "timestamp">) => {
      const newItem: HistoryItem = {
        ...item,
        id: "item-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      };
      setHistory((prev) => {
        const updated = [newItem, ...prev].slice(0, 100);
        try {
          localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(updated));
        } catch {
          /* ignore */
        }
        return updated;
      });
    },
    []
  );

  // -------------------------------------------------------------
  // 2. Calculator Basic Operations
  // -------------------------------------------------------------
  function pressDigit(d: string) {
    if (justEvaluated) {
      setExpression(d === "." ? "0." : d);
      setJustEvaluated(false);
      setDisplay(d === "." ? "0." : d);
      setLastVoiceDetails(null);
      return;
    }
    const next = expression === "0" ? d : expression + d;
    setExpression(next);
    setDisplay(next);
  }

  function pressOp(op: string) {
    setJustEvaluated(false);
    if (!expression) {
      if (display !== "0") {
        setExpression(display + op);
        setDisplay(display + op);
      }
      return;
    }
    const last = expression.trim().slice(-1);
    if ("+-*/".includes(last)) {
      setExpression(expression.slice(0, -1) + op);
      setDisplay(expression.slice(0, -1) + op);
    } else {
      setExpression(expression + op);
      setDisplay(expression + op);
    }
  }

  function evaluateManual() {
    if (!expression) return;
    try {
      const sanitized = expression
        .replace(/×/g, "*")
        .replace(/÷/g, "/")
        .replace(/\^/g, "**");

      if (!/^[0-9+\-*/.() %*Math.sqrt]+$/.test(sanitized)) throw new Error("bad input");

      // eslint-disable-next-line no-new-func
      const result = Function(`"use strict"; return (${sanitized})`)();
      if (!isFinite(result)) throw new Error("bad result");
      const rounded = Math.round(result * 1e10) / 1e10;
      const formatted = formatNumber(rounded, numberFormatIndian);

      setDisplay(formatted);
      setExpression(String(rounded));
      setJustEvaluated(true);

      addToHistory({
        expression,
        result: rounded,
        formattedResult: formatted,
        type: "MANUAL",
      });

      if (voiceOutputRef.current) {
        speakText(`The result is ${formatted}`, { enabled: true });
      }
    } catch {
      setDisplay("Error");
      setExpression("");
      setJustEvaluated(true);
    }
  }

  function clearAll() {
    setExpression("");
    setDisplay("0");
    setJustEvaluated(false);
    setLastHeardSpeech(null);
    setLastVoiceDetails(null);
    stopSpeaking();
  }

  function backspace() {
    if (justEvaluated) return clearAll();
    const next = expression.slice(0, -1);
    setExpression(next);
    setDisplay(next || "0");
  }

  function percentManual() {
    if (!expression) return;
    try {
      // eslint-disable-next-line no-new-func
      const result = Function(`"use strict"; return (${expression})`)() / 100;
      const rounded = Math.round(result * 1e10) / 1e10;
      const formatted = formatNumber(rounded, numberFormatIndian);
      setDisplay(formatted);
      setExpression(String(rounded));
      setJustEvaluated(true);
      addToHistory({
        expression: `${expression}%`,
        result: rounded,
        formattedResult: formatted,
        type: "MANUAL",
      });
    } catch {
      /* ignore */
    }
  }

  function toggleSign() {
    if (!expression) return;
    if (expression.startsWith("-")) setExpression(expression.slice(1));
    else setExpression("-" + expression);
    setDisplay(expression.startsWith("-") ? expression.slice(1) : "-" + expression);
  }

  function scientific(fn: (n: number) => number, label: string) {
    try {
      const base = expression || display.replace(/,/g, "");
      // eslint-disable-next-line no-new-func
      const current = Function(`"use strict"; return (${base})`)();
      const result = fn(current);
      if (!isFinite(result)) throw new Error("bad result");
      const rounded = Math.round(result * 1e10) / 1e10;
      const formatted = formatNumber(rounded, numberFormatIndian);
      setDisplay(formatted);
      setExpression(String(rounded));
      setJustEvaluated(true);
      addToHistory({
        expression: `${label}(${base})`,
        result: rounded,
        formattedResult: formatted,
        type: "MANUAL",
      });
    } catch {
      setDisplay("Error");
      setJustEvaluated(true);
    }
  }

  // -------------------------------------------------------------
  // 3. Voice Processing Engine
  // -------------------------------------------------------------
  const handleVoiceInput = useCallback(
    (spokenSentence: string) => {
      setLastHeardSpeech(spokenSentence);

      const parsed = parseSpokenMath(spokenSentence, display.replace(/,/g, ""));

      if (parsed.type === "COMMAND") {
        if (parsed.command === "CLEAR") {
          clearAll();
        } else if (parsed.command === "BACKSPACE") {
          backspace();
        } else if (parsed.command === "EVALUATE") {
          evaluateManual();
        }
        if (voiceOutputRef.current && parsed.spokenFeedback) {
          speakText(parsed.spokenFeedback, { enabled: true });
        }
        return;
      }

      if (parsed.type === "CALCULATION" && parsed.result !== null) {
        setDisplay(parsed.formattedResult);
        setExpression(parsed.expression);
        setJustEvaluated(true);
        setLastVoiceDetails(parsed.details || null);

        addToHistory({
          expression: parsed.displayExpression,
          result: parsed.result,
          formattedResult: parsed.formattedResult,
          spokenText: spokenSentence,
          type: "VOICE",
        });

        if (voiceOutputRef.current) {
          speakText(parsed.spokenFeedback, { enabled: true });
        }
      } else if (parsed.type === "ERROR") {
        setDisplay("Error");
        if (voiceOutputRef.current) {
          speakText(parsed.spokenFeedback, { enabled: true });
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [display, expression, addToHistory]
  );

  function startVoiceListening() {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognitionCtor = getSpeechRecognition();
    if (!SpeechRecognitionCtor) {
      alert("Voice input is not supported in this browser. Please use Chrome, Edge, or Safari.");
      return;
    }

    try {
      const recognition = new SpeechRecognitionCtor();
      recognition.lang = "en-IN";
      recognition.interimResults = true;
      recognition.continuous = handsFreeRef.current;

      recognition.onresult = (e: any) => {
        let finalTranscript = "";
        let interimTranscript = "";

        for (let i = e.resultIndex; i < e.results.length; ++i) {
          if (e.results[i].isFinal) {
            finalTranscript += e.results[i][0].transcript;
          } else {
            interimTranscript += e.results[i][0].transcript;
          }
        }

        if (interimTranscript) {
          setLastHeardSpeech(interimTranscript);
        }

        if (finalTranscript.trim()) {
          handleVoiceInput(finalTranscript.trim());
          if (!handsFreeRef.current) {
            recognition.stop();
            setIsListening(false);
          }
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        if (handsFreeRef.current) {
          // Restart for continuous hands-free experience
          try {
            recognition.start();
            setIsListening(true);
          } catch {
            setIsListening(false);
          }
        } else {
          setIsListening(false);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
    } catch (err) {
      console.error("Speech recognition error:", err);
      setIsListening(false);
    }
  }

  function stopVoiceListening() {
    recognitionRef.current?.stop();
    setIsListening(false);
  }

  function toggleHandsFree() {
    const next = !handsFree;
    setHandsFree(next);
    handsFreeRef.current = next;
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    }
  }

  function toggleVoiceOutput() {
    const next = !voiceOutputEnabled;
    setVoiceOutputEnabled(next);
    voiceOutputRef.current = next;
    try {
      localStorage.setItem(STORAGE_KEY_VOICE_OUT, String(next));
    } catch {
      /* ignore */
    }
    if (!next) stopSpeaking();
  }

  // -------------------------------------------------------------
  // 4. Keyboard Shortcuts
  // -------------------------------------------------------------
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Don't intercept if user is typing in an input
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) return;

      if (/^[0-9.]$/.test(e.key)) pressDigit(e.key);
      else if (["+", "-", "*", "/"].includes(e.key)) pressOp(e.key);
      else if (e.key === "Enter" || e.key === "=") {
        e.preventDefault();
        evaluateManual();
      } else if (e.key === "Backspace") backspace();
      else if (e.key === "Escape") clearAll();
      else if (e.key === "%") percentManual();
      else if (e.key.toLowerCase() === "v" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        startVoiceListening();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expression, justEvaluated, display]);

  // -------------------------------------------------------------
  // 5. Number in Words calculation for current display
  // -------------------------------------------------------------
  const numericDisplay = parseFloat(display.replace(/,/g, ""));
  const wordsRepresentation = !isNaN(numericDisplay)
    ? numberToWords(numericDisplay)
    : { indian: "", western: "" };

  // -------------------------------------------------------------
  // 6. Specialized Calculations (GST, Margin, EMI)
  // -------------------------------------------------------------
  // GST Computation
  const parsedGstBase = parseFloat(gstBaseAmount) || 0;
  let gstCalculatedTax = 0;
  let gstCalculatedTotal = 0;
  let gstCalculatedNet = 0;

  if (gstMode === "add") {
    gstCalculatedNet = parsedGstBase;
    gstCalculatedTax = (parsedGstBase * gstRate) / 100;
    gstCalculatedTotal = parsedGstBase + gstCalculatedTax;
  } else {
    // Reverse GST (Inclusive)
    gstCalculatedTotal = parsedGstBase;
    gstCalculatedNet = parsedGstBase / (1 + gstRate / 100);
    gstCalculatedTax = gstCalculatedTotal - gstCalculatedNet;
  }

  // Margin Computation
  const cost = parseFloat(marginCost) || 0;
  const selling = parseFloat(marginSelling) || 0;
  const grossProfit = selling - cost;
  const grossMarginPct = selling > 0 ? (grossProfit / selling) * 100 : 0;
  const markupPct = cost > 0 ? (grossProfit / cost) * 100 : 0;

  // Loan EMI Computation
  const principal = parseFloat(emiPrincipal) || 0;
  const interestRate = parseFloat(emiRate) || 0;
  const months = parseFloat(emiTenureMonths) || 12;
  const emiResult = calculateLoanEmi(principal, interestRate, months);

  // -------------------------------------------------------------
  // 7. Audit Tape Actions
  // -------------------------------------------------------------
  function applyHistoryResult(val: number) {
    const formatted = formatNumber(val, numberFormatIndian);
    setDisplay(formatted);
    setExpression(String(val));
    setJustEvaluated(true);
    setShowHistory(false);
  }

  function exportHistoryCsv() {
    if (history.length === 0) return alert("History is empty.");
    const header = "Timestamp,Type,Expression,Result,Spoken Words,Label\n";
    const rows = history
      .map(
        (h) =>
          `"${h.timestamp}","${h.type || "CALC"}","${h.expression}","${h.result}","${h.spokenText || ""}","${
            h.label || ""
          }"`
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `calculator_audit_tape_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function copyDisplayToClipboard() {
    navigator.clipboard.writeText(display.replace(/,/g, ""));
    alert("Result copied to clipboard!");
  }

  // Running sum of all history items
  const historyRunningSum = history.reduce((acc, h) => acc + (Number(h.result) || 0), 0);

  // Button styles
  const digitBtn =
    "text-[16px] font-semibold rounded-xl py-3.5 bg-page hover:bg-brand-wash text-ink transition-colors active:scale-95 shadow-soft-sm";
  const opBtn =
    "text-[16px] font-bold rounded-xl py-3.5 bg-brand-wash text-brand hover:brightness-95 transition-colors active:scale-95 shadow-soft-sm";
  const fnBtn =
    "text-[12px] font-semibold rounded-xl py-2.5 border border-border text-ink-2 hover:border-brand hover:text-brand bg-surface transition-colors active:scale-95";

  return (
    <div className="flex flex-col xl:flex-row gap-6 max-w-5xl">
      {/* LEFT / MAIN: CALCULATOR CONTAINER */}
      <div className="flex-1 max-w-md w-full space-y-4">
        {/* HEADER: TITLE & VOICE CONTROLS */}
        <div className="flex items-center justify-between gap-2 p-3 bg-surface border border-border rounded-2xl shadow-soft">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-brand/10 text-brand flex items-center justify-center font-bold text-sm">
              ∑
            </div>
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-1.5">
                <span>Voice Calculator</span>
                <span className="px-1.5 py-0.5 rounded-md bg-good-wash text-good-text text-[9px] font-extrabold uppercase">
                  Live AI
                </span>
              </h2>
              <p className="text-[10px] text-ink-muted">Speak math or tap keys</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Hands-free mode toggle */}
            <button
              type="button"
              onClick={toggleHandsFree}
              className={`px-2 py-1.5 rounded-xl text-[11px] font-semibold transition border ${
                handsFree
                  ? "bg-brand text-white border-brand shadow-sm"
                  : "bg-page text-ink-muted border-border hover:text-ink"
              }`}
              title={handsFree ? "Hands-Free continuous listening ON" : "Hands-Free continuous listening OFF"}
            >
              🔄 Auto-Listen
            </button>

            {/* Voice Output (TTS) toggle */}
            <button
              type="button"
              onClick={toggleVoiceOutput}
              className={`p-2 rounded-xl text-xs transition border ${
                voiceOutputEnabled
                  ? "bg-brand/10 text-brand border-brand/30"
                  : "bg-page text-ink-muted border-border hover:text-ink"
              }`}
              title={voiceOutputEnabled ? "Spoken Results: ON" : "Spoken Results: MUTED"}
            >
              {voiceOutputEnabled ? "🔊" : "🔇"}
            </button>

            {/* Audit Tape Toggle */}
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition border flex items-center gap-1 ${
                showHistory
                  ? "bg-brand-wash text-brand border-brand/30"
                  : "bg-surface text-ink-2 border-border hover:bg-page"
              }`}
              title="Toggle Audit Tape & Calculation History"
            >
              <span>📜</span>
              <span>Tape ({history.length})</span>
            </button>
          </div>
        </div>

        {/* PRIMARY VOICE MIC BANNER */}
        <div
          className={`p-3 rounded-2xl border transition-all ${
            isListening
              ? "bg-gradient-to-r from-brand/10 via-brand-wash to-good-wash/30 border-brand shadow-md"
              : "bg-surface border-border hover:border-brand/40"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={isListening ? stopVoiceListening : startVoiceListening}
                className={`relative w-11 h-11 rounded-2xl flex items-center justify-center transition-all ${
                  isListening
                    ? "bg-critical text-white shadow-lg animate-pulse"
                    : "bg-brand text-white hover:bg-brand/90 shadow-button"
                }`}
                title="Press or press 'V' on keyboard to speak math"
              >
                <Icon name="mic" className="w-5 h-5" />
                {isListening && (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-critical opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-critical"></span>
                  </span>
                )}
              </button>

              <div>
                <div className="text-xs font-bold text-ink flex items-center gap-1.5">
                  <span>{isListening ? "Listening... Speak your calculation" : "Push to Speak Math"}</span>
                  <kbd className="hidden sm:inline-block px-1 py-0.5 text-[9px] bg-page border border-border rounded text-ink-muted">
                    V
                  </kbd>
                </div>
                <div className="text-[11px] text-ink-muted">
                  {isListening ? (
                    <span className="text-brand font-medium animate-pulse">
                      E.g. &ldquo;150 plus 45&rdquo; &bull; &ldquo;18% of 50,000&rdquo; &bull; &ldquo;5 lakh plus 2.5
                      lakh&rdquo;
                    </span>
                  ) : (
                    <span>Tap mic or press &lsquo;V&rsquo; to compute hands-free</span>
                  )}
                </div>
              </div>
            </div>

            {isListening && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-surface border border-border">
                <div className="w-1 h-3 bg-brand animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-1 h-5 bg-brand animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-1 h-2 bg-brand animate-bounce" style={{ animationDelay: "300ms" }} />
                <div className="w-1 h-4 bg-brand animate-bounce" style={{ animationDelay: "450ms" }} />
              </div>
            )}
          </div>

          {/* Real-time Heard Speech Bubble */}
          {lastHeardSpeech && (
            <div className="mt-2.5 p-2 rounded-xl bg-page border border-border text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 truncate">
                <span className="text-brand font-bold text-[11px]">🎙️ Heard:</span>
                <span className="italic text-ink font-medium truncate">&ldquo;{lastHeardSpeech}&rdquo;</span>
              </div>
              <button
                type="button"
                onClick={() => setLastHeardSpeech(null)}
                className="text-[10px] text-ink-muted hover:text-ink flex-shrink-0"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* MAIN DISPLAY SCREEN */}
        <div className="border border-border rounded-2xl bg-surface shadow-soft p-4 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-ink-muted">
            <span className="font-medium truncate max-w-[200px]">
              {expression ? expression.replace(/\*/g, " × ").replace(/\//g, " ÷ ") : "Ready"}
            </span>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => setNumberFormatIndian(!numberFormatIndian)}
                className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-page border border-border text-ink hover:text-brand"
                title="Toggle between Indian Lakhs format and Western Millions format"
              >
                {numberFormatIndian ? "🇮🇳 Lakhs" : "🌐 Millions"}
              </button>
              <button
                type="button"
                onClick={copyDisplayToClipboard}
                className="hover:text-brand transition text-[10px] font-medium"
                title="Copy result"
              >
                📋 Copy
              </button>
            </div>
          </div>

          {/* Main Giant Result */}
          <div className="flex items-baseline justify-end gap-1.5 overflow-hidden">
            <div className="text-[34px] sm:text-[38px] font-extrabold text-ink text-right truncate tabular-nums tracking-tight">
              {display}
            </div>
          </div>

          {/* Specialized Spoken Breakdown Detail if any */}
          {lastVoiceDetails?.summaryText && (
            <div className="p-2 rounded-xl bg-brand-wash/50 border border-brand/20 text-[11px] text-ink leading-snug">
              <span className="font-bold text-brand mr-1">Detail:</span>
              {lastVoiceDetails.summaryText}
            </div>
          )}

          {/* Number in Words (Indian & International) */}
          {wordsRepresentation.indian && (
            <div className="pt-2 border-t border-border flex items-start justify-between gap-2 text-[11px] text-ink-muted">
              <div className="space-y-0.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">In Words</div>
                <div className="font-medium text-ink italic leading-tight">
                  {numberFormatIndian ? wordsRepresentation.indian : wordsRepresentation.western}
                </div>
              </div>

              {voiceOutputEnabled && (
                <button
                  type="button"
                  onClick={() => speakText(`The result is ${display}`, { enabled: true })}
                  className="p-1 rounded-lg hover:bg-page text-ink-muted hover:text-brand flex-shrink-0"
                  title="Speak this result aloud"
                >
                  🔊
                </button>
              )}
            </div>
          )}
        </div>

        {/* MODE TABS SWITCHER */}
        <div className="grid grid-cols-4 gap-1 p-1 bg-page rounded-xl border border-border text-xs font-semibold text-center">
          <button
            type="button"
            onClick={() => setActiveTab("standard")}
            className={`py-1.5 rounded-lg transition ${
              activeTab === "standard" ? "bg-surface text-brand shadow-sm font-bold" : "text-ink-muted hover:text-ink"
            }`}
          >
            🔢 Standard
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("gst")}
            className={`py-1.5 rounded-lg transition ${
              activeTab === "gst" ? "bg-surface text-brand shadow-sm font-bold" : "text-ink-muted hover:text-ink"
            }`}
          >
            🧾 GST Tax
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("margin")}
            className={`py-1.5 rounded-lg transition ${
              activeTab === "margin" ? "bg-surface text-brand shadow-sm font-bold" : "text-ink-muted hover:text-ink"
            }`}
          >
            📈 Margin
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("emi")}
            className={`py-1.5 rounded-lg transition ${
              activeTab === "emi" ? "bg-surface text-brand shadow-sm font-bold" : "text-ink-muted hover:text-ink"
            }`}
          >
            🏦 EMI
          </button>
        </div>

        {/* TAB 1: STANDARD & SCIENTIFIC KEYPAD */}
        {activeTab === "standard" && (
          <div className="space-y-2">
            {/* Quick 1-Tap GST & Percentage Shortcuts */}
            <div className="grid grid-cols-5 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (display !== "0") {
                    const base = parseFloat(display.replace(/,/g, "")) || 0;
                    const res = base + (base * 18) / 100;
                    setDisplay(formatNumber(res, numberFormatIndian));
                    setExpression(`${base} + 18% GST`);
                    setJustEvaluated(true);
                    addToHistory({
                      expression: `${base} + 18% GST`,
                      result: res,
                      formattedResult: formatNumber(res, numberFormatIndian),
                      type: "GST",
                    });
                  }
                }}
                className="py-1.5 text-[11px] font-bold rounded-lg border border-brand/30 bg-brand-wash text-brand hover:brightness-95 transition"
                title="Add 18% GST immediately"
              >
                +18% GST
              </button>
              <button
                type="button"
                onClick={() => {
                  if (display !== "0") {
                    const base = parseFloat(display.replace(/,/g, "")) || 0;
                    const res = base + (base * 12) / 100;
                    setDisplay(formatNumber(res, numberFormatIndian));
                    setExpression(`${base} + 12% GST`);
                    setJustEvaluated(true);
                    addToHistory({
                      expression: `${base} + 12% GST`,
                      result: res,
                      formattedResult: formatNumber(res, numberFormatIndian),
                      type: "GST",
                    });
                  }
                }}
                className="py-1.5 text-[11px] font-bold rounded-lg border border-border bg-surface text-ink-2 hover:text-brand transition"
              >
                +12%
              </button>
              <button
                type="button"
                onClick={() => {
                  if (display !== "0") {
                    const base = parseFloat(display.replace(/,/g, "")) || 0;
                    const res = base + (base * 5) / 100;
                    setDisplay(formatNumber(res, numberFormatIndian));
                    setExpression(`${base} + 5% GST`);
                    setJustEvaluated(true);
                    addToHistory({
                      expression: `${base} + 5% GST`,
                      result: res,
                      formattedResult: formatNumber(res, numberFormatIndian),
                      type: "GST",
                    });
                  }
                }}
                className="py-1.5 text-[11px] font-bold rounded-lg border border-border bg-surface text-ink-2 hover:text-brand transition"
              >
                +5%
              </button>
              <button
                type="button"
                onClick={() => {
                  if (display !== "0") {
                    const base = parseFloat(display.replace(/,/g, "")) || 0;
                    const res = base - (base * 10) / 100;
                    setDisplay(formatNumber(res, numberFormatIndian));
                    setExpression(`${base} - 10% disc`);
                    setJustEvaluated(true);
                    addToHistory({
                      expression: `${base} - 10% disc`,
                      result: res,
                      formattedResult: formatNumber(res, numberFormatIndian),
                      type: "MANUAL",
                    });
                  }
                }}
                className="py-1.5 text-[11px] font-bold rounded-lg border border-border bg-surface text-ink-2 hover:text-brand transition"
              >
                -10%
              </button>
              <button
                type="button"
                onClick={() => {
                  if (display !== "0") {
                    const base = parseFloat(display.replace(/,/g, "")) || 0;
                    const res = base - (base * 20) / 100;
                    setDisplay(formatNumber(res, numberFormatIndian));
                    setExpression(`${base} - 20% disc`);
                    setJustEvaluated(true);
                    addToHistory({
                      expression: `${base} - 20% disc`,
                      result: res,
                      formattedResult: formatNumber(res, numberFormatIndian),
                      type: "MANUAL",
                    });
                  }
                }}
                className="py-1.5 text-[11px] font-bold rounded-lg border border-border bg-surface text-ink-2 hover:text-brand transition"
              >
                -20%
              </button>
            </div>

            {/* Scientific Function Row */}
            <div className="grid grid-cols-4 gap-2">
              <button className={fnBtn} onClick={() => scientific((n) => Math.sqrt(n), "√")}>
                √x
              </button>
              <button className={fnBtn} onClick={() => scientific((n) => n * n, "sqr")}>
                x²
              </button>
              <button className={fnBtn} onClick={() => setMemory(memory + (Number(display.replace(/,/g, "")) || 0))}>
                M+
              </button>
              <button
                className={fnBtn}
                onClick={() => {
                  setExpression(String(memory));
                  setDisplay(formatNumber(memory, numberFormatIndian));
                  setJustEvaluated(true);
                }}
              >
                MR ({memory})
              </button>
            </div>

            {/* Primary Keypad */}
            <div className="grid grid-cols-4 gap-2">
              <button className={opBtn} onClick={clearAll}>
                AC
              </button>
              <button className={opBtn} onClick={toggleSign}>
                ±
              </button>
              <button className={opBtn} onClick={percentManual}>
                %
              </button>
              <button className={opBtn} onClick={() => pressOp("/")}>
                ÷
              </button>

              <button className={digitBtn} onClick={() => pressDigit("7")}>
                7
              </button>
              <button className={digitBtn} onClick={() => pressDigit("8")}>
                8
              </button>
              <button className={digitBtn} onClick={() => pressDigit("9")}>
                9
              </button>
              <button className={opBtn} onClick={() => pressOp("*")}>
                ×
              </button>

              <button className={digitBtn} onClick={() => pressDigit("4")}>
                4
              </button>
              <button className={digitBtn} onClick={() => pressDigit("5")}>
                5
              </button>
              <button className={digitBtn} onClick={() => pressDigit("6")}>
                6
              </button>
              <button className={opBtn} onClick={() => pressOp("-")}>
                −
              </button>

              <button className={digitBtn} onClick={() => pressDigit("1")}>
                1
              </button>
              <button className={digitBtn} onClick={() => pressDigit("2")}>
                2
              </button>
              <button className={digitBtn} onClick={() => pressDigit("3")}>
                3
              </button>
              <button className={opBtn} onClick={() => pressOp("+")}>
                +
              </button>

              <button className={`${digitBtn} col-span-2`} onClick={() => pressDigit("0")}>
                0
              </button>
              <button className={digitBtn} onClick={() => pressDigit(".")}>
                .
              </button>
              <button
                className="text-[18px] font-extrabold rounded-xl py-3.5 bg-brand text-white hover:brightness-110 active:scale-95 transition shadow-button"
                onClick={evaluateManual}
              >
                =
              </button>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-ink-muted">Press Enter to evaluate &bull; Esc to clear</span>
              <button
                type="button"
                onClick={backspace}
                className="text-[11.5px] font-semibold text-ink-muted hover:text-brand transition flex items-center gap-1"
              >
                ⌫ Backspace
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: GST & TAX HUB */}
        {activeTab === "gst" && (
          <div className="p-4 rounded-2xl bg-surface border border-border shadow-soft space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink">GST & Tax Calculator</h3>
              <div className="flex items-center gap-1 p-1 bg-page rounded-xl border border-border text-[11px]">
                <button
                  type="button"
                  onClick={() => setGstMode("add")}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                    gstMode === "add" ? "bg-surface text-brand shadow-sm" : "text-ink-muted"
                  }`}
                >
                  + Add GST
                </button>
                <button
                  type="button"
                  onClick={() => setGstMode("remove")}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                    gstMode === "remove" ? "bg-surface text-brand shadow-sm" : "text-ink-muted"
                  }`}
                >
                  − Remove from MRP
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-ink-muted">
                {gstMode === "add" ? "Base / Net Amount" : "Gross MRP Amount"}
              </label>
              <input
                type="number"
                value={gstBaseAmount}
                onChange={(e) => setGstBaseAmount(e.target.value)}
                className="w-full px-3.5 py-2.5 text-base font-bold text-ink rounded-xl border border-border bg-page focus:outline-none focus:border-brand"
                placeholder="Enter amount"
              />
            </div>

            {/* GST Slab Rates */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-ink-muted">GST Slab Rate</div>
              <div className="grid grid-cols-4 gap-2">
                {[5, 12, 18, 28].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => setGstRate(rate)}
                    className={`py-2 rounded-xl text-xs font-bold transition border ${
                      gstRate === rate
                        ? "bg-brand text-white border-brand shadow-button"
                        : "bg-page text-ink-2 border-border hover:border-brand"
                    }`}
                  >
                    {rate}%
                  </button>
                ))}
              </div>
            </div>

            {/* GST Tax Breakdown Card */}
            <div className="p-3.5 rounded-xl bg-page border border-border space-y-2 text-xs">
              <div className="flex justify-between text-ink-muted">
                <span>Net Amount:</span>
                <span className="font-semibold text-ink">₹ {formatNumber(Math.round(gstCalculatedNet * 100) / 100)}</span>
              </div>
              <div className="flex justify-between text-ink-muted">
                <span>CGST ({gstRate / 2}%):</span>
                <span className="font-semibold text-ink">
                  ₹ {formatNumber(Math.round((gstCalculatedTax / 2) * 100) / 100)}
                </span>
              </div>
              <div className="flex justify-between text-ink-muted">
                <span>SGST ({gstRate / 2}%):</span>
                <span className="font-semibold text-ink">
                  ₹ {formatNumber(Math.round((gstCalculatedTax / 2) * 100) / 100)}
                </span>
              </div>
              <div className="pt-2 border-t border-border flex justify-between text-sm font-bold text-brand">
                <span>Total Payable:</span>
                <span>₹ {formatNumber(Math.round(gstCalculatedTotal * 100) / 100)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                const finalVal = Math.round(gstCalculatedTotal * 100) / 100;
                setDisplay(formatNumber(finalVal, numberFormatIndian));
                setExpression(String(finalVal));
                setActiveTab("standard");
                addToHistory({
                  expression: `GST ${gstRate}% on ${gstBaseAmount}`,
                  result: finalVal,
                  formattedResult: formatNumber(finalVal, numberFormatIndian),
                  type: "GST",
                });
              }}
              className="w-full py-2.5 rounded-xl bg-brand text-white text-xs font-bold hover:bg-brand/90 transition shadow-button"
            >
              Use in Main Calculator
            </button>
          </div>
        )}

        {/* TAB 3: MARGIN & PROFIT HUB */}
        {activeTab === "margin" && (
          <div className="p-4 rounded-2xl bg-surface border border-border shadow-soft space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink">Profit Margin & Markup</h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-ink-muted">Cost Price (CP)</label>
                <input
                  type="number"
                  value={marginCost}
                  onChange={(e) => setMarginCost(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-bold text-ink rounded-xl border border-border bg-page focus:outline-none focus:border-brand"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-ink-muted">Selling Price (SP)</label>
                <input
                  type="number"
                  value={marginSelling}
                  onChange={(e) => setMarginSelling(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-bold text-ink rounded-xl border border-border bg-page focus:outline-none focus:border-brand"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 p-3 bg-page rounded-xl border border-border text-center">
              <div>
                <div className="text-[10px] text-ink-muted font-medium uppercase">Gross Profit</div>
                <div
                  className={`text-sm font-extrabold mt-0.5 ${
                    grossProfit >= 0 ? "text-good-text" : "text-critical"
                  }`}
                >
                  ₹ {formatNumber(Math.round(grossProfit * 100) / 100)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-ink-muted font-medium uppercase">Gross Margin</div>
                <div className="text-sm font-extrabold text-brand mt-0.5">
                  {Math.round(grossMarginPct * 10) / 10}%
                </div>
              </div>
              <div>
                <div className="text-[10px] text-ink-muted font-medium uppercase">Markup</div>
                <div className="text-sm font-extrabold text-ink mt-0.5">
                  {Math.round(markupPct * 10) / 10}%
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: LOAN EMI ESTIMATOR */}
        {activeTab === "emi" && (
          <div className="p-4 rounded-2xl bg-surface border border-border shadow-soft space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink">Loan & EMI Estimator</h3>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-ink-muted">Principal</label>
                <input
                  type="number"
                  value={emiPrincipal}
                  onChange={(e) => setEmiPrincipal(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs font-bold text-ink rounded-xl border border-border bg-page"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-ink-muted">Interest Rate %</label>
                <input
                  type="number"
                  step="0.1"
                  value={emiRate}
                  onChange={(e) => setEmiRate(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs font-bold text-ink rounded-xl border border-border bg-page"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-ink-muted">Tenure (Months)</label>
                <input
                  type="number"
                  value={emiTenureMonths}
                  onChange={(e) => setEmiTenureMonths(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs font-bold text-ink rounded-xl border border-border bg-page"
                />
              </div>
            </div>

            <div className="p-3 bg-page rounded-xl border border-border space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-ink-muted">Monthly EMI:</span>
                <span className="text-base font-extrabold text-brand">₹ {formatNumber(emiResult.emi)}</span>
              </div>
              <div className="flex justify-between text-ink-muted">
                <span>Total Interest:</span>
                <span className="font-semibold text-ink">₹ {formatNumber(emiResult.totalInterest)}</span>
              </div>
              <div className="flex justify-between text-ink-muted">
                <span>Total Payment:</span>
                <span className="font-semibold text-ink">₹ {formatNumber(emiResult.totalPayment)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* RIGHT: AUDIT TAPE & CALCULATION HISTORY */}
      <div
        className={`w-full xl:w-80 flex-shrink-0 transition-all ${
          showHistory ? "block" : "hidden xl:block"
        }`}
      >
        <div className="p-4 bg-surface border border-border rounded-2xl shadow-soft space-y-4 sticky top-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm">📜</span>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink">Audit Tape</h3>
                <p className="text-[10px] text-ink-muted">Running calculation log</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={exportHistoryCsv}
                className="p-1.5 rounded-lg border border-border bg-page text-ink text-[10px] font-semibold hover:bg-surface transition"
                title="Export tape as CSV"
              >
                CSV
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm("Clear all calculation history?")) {
                    saveHistoryToStorage([]);
                  }
                }}
                className="p-1.5 rounded-lg border border-border bg-page text-critical text-[10px] font-semibold hover:bg-critical/10 transition"
                title="Clear tape"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Running Sum Banner */}
          {history.length > 0 && (
            <div className="p-2.5 rounded-xl bg-page border border-border flex items-center justify-between text-xs">
              <span className="text-ink-muted font-medium">Running Total:</span>
              <span className="font-extrabold text-ink tabular-nums">
                ₹ {formatNumber(Math.round(historyRunningSum * 100) / 100, numberFormatIndian)}
              </span>
            </div>
          )}

          {/* History Item List */}
          <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
            {history.length === 0 ? (
              <div className="py-8 text-center text-xs text-ink-muted italic">
                No calculations recorded yet.
                <br />
                Speak math or tap keys to build your tape.
              </div>
            ) : (
              history.map((item) => (
                <div
                  key={item.id}
                  className="p-2.5 rounded-xl bg-page/70 border border-border hover:border-brand/40 transition text-xs space-y-1 group"
                >
                  <div className="flex items-center justify-between text-[10px] text-ink-muted">
                    <span className="flex items-center gap-1 font-mono">
                      {item.type === "VOICE" && <span title="Computed via Voice">🎙️</span>}
                      {item.type === "GST" && <span title="GST calculation">🧾</span>}
                      {item.timestamp}
                    </span>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button
                        type="button"
                        onClick={() => applyHistoryResult(item.result)}
                        className="text-brand font-bold hover:underline"
                        title="Use this result in calculator"
                      >
                        Use
                      </button>
                      <span>&bull;</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(String(item.result));
                          alert("Copied!");
                        }}
                        className="text-ink-2 hover:text-ink"
                        title="Copy result"
                      >
                        Copy
                      </button>
                    </div>
                  </div>

                  <div className="text-[11px] text-ink-muted truncate">{item.expression}</div>

                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-bold text-ink tabular-nums">
                      = {item.formattedResult}
                    </span>

                    {item.label ? (
                      <span className="px-1.5 py-0.5 rounded bg-surface border border-border text-[9px] text-ink-muted">
                        {item.label}
                      </span>
                    ) : (
                      editingLabelId !== item.id && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingLabelId(item.id);
                            setTempLabel("");
                          }}
                          className="text-[10px] text-ink-muted hover:text-brand opacity-0 group-hover:opacity-100 transition"
                        >
                          + Tag
                        </button>
                      )
                    )}
                  </div>

                  {editingLabelId === item.id && (
                    <div className="flex items-center gap-1 pt-1">
                      <input
                        type="text"
                        value={tempLabel}
                        onChange={(e) => setTempLabel(e.target.value)}
                        placeholder="Tag (e.g. Invoice, Rent)"
                        className="flex-1 px-1.5 py-0.5 text-[10px] rounded border border-border bg-surface"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const updated = history.map((h) =>
                            h.id === item.id ? { ...h, label: tempLabel.trim() } : h
                          );
                          saveHistoryToStorage(updated);
                          setEditingLabelId(null);
                        }}
                        className="text-[10px] font-bold text-brand"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingLabelId(null)}
                        className="text-[10px] text-ink-muted"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
