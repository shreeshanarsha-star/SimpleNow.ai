"use client";

import { useEffect, useState } from "react";

// Standard 4-function + a handful of scientific operations. Pure client
// state -- no backend, no persistence, exactly what a calculator should be.
export default function Calculator() {
  const [expression, setExpression] = useState("");
  const [display, setDisplay] = useState("0");
  const [memory, setMemory] = useState(0);
  const [justEvaluated, setJustEvaluated] = useState(false);

  function pressDigit(d: string) {
    if (justEvaluated) {
      setExpression(d === "." ? "0." : d);
      setJustEvaluated(false);
      setDisplay(d === "." ? "0." : d);
      return;
    }
    const next = expression === "0" ? d : expression + d;
    setExpression(next);
    setDisplay(next);
  }

  function pressOp(op: string) {
    setJustEvaluated(false);
    if (!expression) return;
    const last = expression.trim().slice(-1);
    if ("+-*/".includes(last)) {
      setExpression(expression.slice(0, -1) + op);
    } else {
      setExpression(expression + op);
    }
    setDisplay(expression + op);
  }

  function evaluate() {
    if (!expression) return;
    try {
      // Digits, operators, decimal points, and parens only -- never eval
      // arbitrary input.
      if (!/^[0-9+\-*/.() ]+$/.test(expression)) throw new Error("bad input");
      // eslint-disable-next-line no-new-func
      const result = Function(`"use strict"; return (${expression})`)();
      if (!isFinite(result)) throw new Error("bad result");
      const rounded = Math.round(result * 1e10) / 1e10;
      setDisplay(String(rounded));
      setExpression(String(rounded));
      setJustEvaluated(true);
    } catch {
      setDisplay("Error");
      setExpression("");
      setJustEvaluated(true);
    }
  }

  function clear() {
    setExpression("");
    setDisplay("0");
    setJustEvaluated(false);
  }

  function backspace() {
    if (justEvaluated) return clear();
    const next = expression.slice(0, -1);
    setExpression(next);
    setDisplay(next || "0");
  }

  function percent() {
    if (!expression) return;
    try {
      // eslint-disable-next-line no-new-func
      const result = Function(`"use strict"; return (${expression})`)() / 100;
      setDisplay(String(result));
      setExpression(String(result));
      setJustEvaluated(true);
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

  function scientific(fn: (n: number) => number) {
    try {
      const base = expression || display;
      // eslint-disable-next-line no-new-func
      const current = Function(`"use strict"; return (${base})`)();
      const result = fn(current);
      if (!isFinite(result)) throw new Error("bad result");
      const rounded = Math.round(result * 1e10) / 1e10;
      setDisplay(String(rounded));
      setExpression(String(rounded));
      setJustEvaluated(true);
    } catch {
      setDisplay("Error");
      setJustEvaluated(true);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (/^[0-9.]$/.test(e.key)) pressDigit(e.key);
      else if (["+", "-", "*", "/"].includes(e.key)) pressOp(e.key);
      else if (e.key === "Enter" || e.key === "=") {
        e.preventDefault();
        evaluate();
      } else if (e.key === "Backspace") backspace();
      else if (e.key === "Escape") clear();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expression, justEvaluated]);

  const digitBtn = "text-[16px] font-semibold rounded-md py-3 bg-page hover:bg-brand-wash text-ink transition-colors";
  const opBtn = "text-[16px] font-bold rounded-md py-3 bg-brand-wash text-brand hover:brightness-95 transition-colors";
  const fnBtn = "text-[12.5px] font-semibold rounded-md py-2.5 border border-border text-ink-2 hover:border-brand hover:text-brand transition-colors";

  return (
    <div className="flex flex-col gap-4 max-w-sm">
      <div className="border border-border rounded-lg bg-surface shadow-soft-sm p-4">
        <div className="text-[11px] text-ink-muted h-4 truncate text-right">{expression || " "}</div>
        <div className="text-[32px] font-bold text-ink text-right truncate tabular-nums">{display}</div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <button className={fnBtn} onClick={() => scientific((n) => Math.sqrt(n))}>√</button>
        <button className={fnBtn} onClick={() => scientific((n) => n * n)}>x²</button>
        <button className={fnBtn} onClick={() => setMemory(memory + (Number(display) || 0))}>M+</button>
        <button className={fnBtn} onClick={() => { setExpression(String(memory)); setDisplay(String(memory)); setJustEvaluated(true); }}>MR</button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <button className={opBtn} onClick={clear}>AC</button>
        <button className={opBtn} onClick={toggleSign}>+/-</button>
        <button className={opBtn} onClick={percent}>%</button>
        <button className={opBtn} onClick={() => pressOp("/")}>÷</button>

        <button className={digitBtn} onClick={() => pressDigit("7")}>7</button>
        <button className={digitBtn} onClick={() => pressDigit("8")}>8</button>
        <button className={digitBtn} onClick={() => pressDigit("9")}>9</button>
        <button className={opBtn} onClick={() => pressOp("*")}>×</button>

        <button className={digitBtn} onClick={() => pressDigit("4")}>4</button>
        <button className={digitBtn} onClick={() => pressDigit("5")}>5</button>
        <button className={digitBtn} onClick={() => pressDigit("6")}>6</button>
        <button className={opBtn} onClick={() => pressOp("-")}>−</button>

        <button className={digitBtn} onClick={() => pressDigit("1")}>1</button>
        <button className={digitBtn} onClick={() => pressDigit("2")}>2</button>
        <button className={digitBtn} onClick={() => pressDigit("3")}>3</button>
        <button className={opBtn} onClick={() => pressOp("+")}>+</button>

        <button className={`${digitBtn} col-span-2`} onClick={() => pressDigit("0")}>0</button>
        <button className={digitBtn} onClick={() => pressDigit(".")}>.</button>
        <button className="text-[16px] font-bold rounded-md py-3 bg-brand text-white hover:brightness-110 transition-colors" onClick={evaluate}>=</button>
      </div>

      <button onClick={backspace} className="self-end text-[11.5px] font-semibold text-ink-muted hover:text-brand">
        ⌫ Backspace
      </button>
    </div>
  );
}
