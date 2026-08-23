"use client";

import { useEffect, useRef, useState } from "react";

function fmtMs(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const cs = Math.floor((ms % 1000) / 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}.${pad(cs)}`;
}

export default function TimerStopwatch() {
  const [mode, setMode] = useState<"timer" | "stopwatch">("stopwatch");

  // Stopwatch
  const [swElapsed, setSwElapsed] = useState(0);
  const [swRunning, setSwRunning] = useState(false);
  const swStart = useRef(0);
  const [laps, setLaps] = useState<number[]>([]);

  // Timer
  const [inputMin, setInputMin] = useState(5);
  const [inputSec, setInputSec] = useState(0);
  const [timerRemaining, setTimerRemaining] = useState<number | null>(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const timerEnd = useRef(0);
  const [timerDone, setTimerDone] = useState(false);

  useEffect(() => {
    if (!swRunning) return;
    const id = setInterval(() => setSwElapsed(Date.now() - swStart.current), 30);
    return () => clearInterval(id);
  }, [swRunning]);

  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => {
      const remaining = timerEnd.current - Date.now();
      if (remaining <= 0) {
        setTimerRemaining(0);
        setTimerRunning(false);
        setTimerDone(true);
        clearInterval(id);
      } else {
        setTimerRemaining(remaining);
      }
    }, 200);
    return () => clearInterval(id);
  }, [timerRunning]);

  function startStopwatch() {
    swStart.current = Date.now() - swElapsed;
    setSwRunning(true);
  }
  function pauseStopwatch() {
    setSwRunning(false);
  }
  function resetStopwatch() {
    setSwRunning(false);
    setSwElapsed(0);
    setLaps([]);
  }

  function startTimer() {
    const totalMs = (timerRemaining ?? (inputMin * 60 + inputSec) * 1000);
    if (totalMs <= 0) return;
    timerEnd.current = Date.now() + totalMs;
    setTimerRemaining(totalMs);
    setTimerRunning(true);
    setTimerDone(false);
  }
  function pauseTimer() {
    setTimerRunning(false);
  }
  function resetTimer() {
    setTimerRunning(false);
    setTimerRemaining(null);
    setTimerDone(false);
  }

  const timerDisplayMs = timerRemaining ?? (inputMin * 60 + inputSec) * 1000;

  return (
    <div className="flex flex-col gap-4 max-w-sm">
      <div className="flex gap-2 border border-border rounded-md p-1 bg-page w-fit">
        <button
          onClick={() => setMode("stopwatch")}
          className={`text-[12px] font-semibold px-3 py-1.5 rounded-sm ${mode === "stopwatch" ? "bg-surface shadow-soft-sm text-brand" : "text-ink-muted"}`}
        >
          Stopwatch
        </button>
        <button
          onClick={() => setMode("timer")}
          className={`text-[12px] font-semibold px-3 py-1.5 rounded-sm ${mode === "timer" ? "bg-surface shadow-soft-sm text-brand" : "text-ink-muted"}`}
        >
          Timer
        </button>
      </div>

      {mode === "stopwatch" ? (
        <>
          <div className="border border-border rounded-lg bg-surface shadow-soft-sm p-6 text-center">
            <div className="text-[38px] font-bold tabular-nums text-ink">{fmtMs(swElapsed)}</div>
          </div>
          <div className="flex gap-2">
            {!swRunning ? (
              <button onClick={startStopwatch} className="flex-1 text-[13px] font-bold text-white bg-brand rounded-md py-2.5">
                {swElapsed > 0 ? "Resume" : "Start"}
              </button>
            ) : (
              <button onClick={() => setLaps((l) => [swElapsed, ...l])} className="flex-1 text-[13px] font-bold text-brand border border-brand rounded-md py-2.5">
                Lap
              </button>
            )}
            {swRunning ? (
              <button onClick={pauseStopwatch} className="flex-1 text-[13px] font-bold text-ink border border-border rounded-md py-2.5">
                Pause
              </button>
            ) : (
              <button onClick={resetStopwatch} className="flex-1 text-[13px] font-bold text-ink-muted border border-border rounded-md py-2.5">
                Reset
              </button>
            )}
          </div>
          {laps.length > 0 && (
            <div className="border border-border rounded-lg bg-surface divide-y divide-border max-h-40 overflow-y-auto">
              {laps.map((l, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-1.5 text-[12px]">
                  <span className="text-ink-muted">Lap {laps.length - i}</span>
                  <span className="tabular-nums text-ink font-semibold">{fmtMs(l)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="border border-border rounded-lg bg-surface shadow-soft-sm p-6 text-center">
            <div className={`text-[38px] font-bold tabular-nums ${timerDone ? "text-critical" : "text-ink"}`}>{fmtMs(timerDisplayMs)}</div>
            {timerDone && <div className="text-[12px] text-critical font-semibold mt-1">Time&apos;s up</div>}
          </div>
          {!timerRunning && timerRemaining == null && (
            <div className="flex items-center gap-2 justify-center">
              <input
                type="number"
                min={0}
                value={inputMin}
                onChange={(e) => setInputMin(Math.max(0, Number(e.target.value)))}
                className="w-16 text-center border border-border rounded-md px-2 py-1.5 text-[13px] bg-surface outline-none focus:border-brand"
              />
              <span className="text-[12px] text-ink-muted">min</span>
              <input
                type="number"
                min={0}
                max={59}
                value={inputSec}
                onChange={(e) => setInputSec(Math.min(59, Math.max(0, Number(e.target.value))))}
                className="w-16 text-center border border-border rounded-md px-2 py-1.5 text-[13px] bg-surface outline-none focus:border-brand"
              />
              <span className="text-[12px] text-ink-muted">sec</span>
            </div>
          )}
          <div className="flex gap-2">
            {!timerRunning ? (
              <button onClick={startTimer} className="flex-1 text-[13px] font-bold text-white bg-brand rounded-md py-2.5">
                {timerRemaining != null ? "Resume" : "Start"}
              </button>
            ) : (
              <button onClick={pauseTimer} className="flex-1 text-[13px] font-bold text-ink border border-border rounded-md py-2.5">
                Pause
              </button>
            )}
            <button onClick={resetTimer} className="flex-1 text-[13px] font-bold text-ink-muted border border-border rounded-md py-2.5">
              Reset
            </button>
          </div>
        </>
      )}
    </div>
  );
}
