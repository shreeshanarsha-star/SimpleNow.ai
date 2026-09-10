// Voice Math Parser & Natural Language Evaluator
// Translates spoken voice math, Indian & Western magnitude multipliers (lakh, crore, million, k),
// percentage & GST expressions, scientific operations, and voice commands into exact calculations.

export interface ParsedVoiceResult {
  type: "CALCULATION" | "COMMAND" | "ERROR";
  command?: "CLEAR" | "BACKSPACE" | "EVALUATE";
  spokenText: string;
  expression: string;
  displayExpression: string;
  result: number | null;
  formattedResult: string;
  wordsResult: {
    indian: string;
    western: string;
  };
  details?: {
    type: "BASIC" | "PERCENTAGE" | "GST" | "DISCOUNT" | "SCIENTIFIC";
    baseAmount?: number;
    rate?: number;
    taxOrDiscountAmount?: number;
    finalAmount?: number;
    summaryText?: string;
  };
  spokenFeedback: string;
}

const SMALL_NUMBERS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
};

const MAGNITUDES: Record<string, number> = {
  k: 1_000,
  thousand: 1_000,
  thousands: 1_000,
  lakh: 100_000,
  lakhs: 100_000,
  lac: 100_000,
  lacs: 100_000,
  million: 1_000_000,
  millions: 1_000_000,
  m: 1_000_000,
  crore: 10_000_000,
  crores: 10_000_000,
  cr: 10_000_000,
  billion: 1_000_000_000,
  billions: 1_000_000_000,
  b: 1_000_000_000,
};

/**
 * Converts English number phrases (e.g. "two lakh fifty thousand", "one point five million", "twenty five")
 * into numeric strings.
 */
export function normalizeSpokenNumbers(text: string): string {
  let s = text.toLowerCase().trim();

  // Normalize punctuation and colloquial filler
  s = s.replace(/,/g, "");
  s = s.replace(/\bwhat\s+is\b/g, "");
  s = s.replace(/\bcalculate\b/g, "");
  s = s.replace(/\bhow\s+much\s+is\b/g, "");
  s = s.replace(/\bcan\s+you\b/g, "");
  s = s.replace(/\bplease\b/g, "");

  // Convert fractional words
  s = s.replace(/\bhalf\b/g, "0.5");
  s = s.replace(/\ba\s+quarter\b/g, "0.25");
  s = s.replace(/\bquarter\b/g, "0.25");
  s = s.replace(/\bthree\s+quarters\b/g, "0.75");

  // Replace "point" with decimal dot
  s = s.replace(/\s+point\s+/g, ".");
  s = s.replace(/\bpoint\s+(\d+)/g, ".$1");

  // Replace numbers like "2.5 lakh" or "10 crore" or "50 thousand"
  s = s.replace(/(\d+(\.\d+)?)\s*(lakhs?|lacs?)/gi, (_, num) => String(parseFloat(num) * 100_000));
  s = s.replace(/(\d+(\.\d+)?)\s*(crores?|cr)/gi, (_, num) => String(parseFloat(num) * 10_000_000));
  s = s.replace(/(\d+(\.\d+)?)\s*(millions?|m\b)/gi, (_, num) => String(parseFloat(num) * 1_000_000));
  s = s.replace(/(\d+(\.\d+)?)\s*(billions?|b\b)/gi, (_, num) => String(parseFloat(num) * 1_000_000_000));
  s = s.replace(/(\d+(\.\d+)?)\s*(thousands?|k\b)/gi, (_, num) => String(parseFloat(num) * 1_000));

  // Tokenize and resolve standard words like "one hundred fifty"
  const words = s.split(/\s+/);
  const resultTokens: string[] = [];
  let currentAccumulator = 0;
  let hasNumberInProgress = false;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];

    if (SMALL_NUMBERS[w] !== undefined) {
      const val = SMALL_NUMBERS[w];
      if (val === 100) {
        currentAccumulator = (currentAccumulator || 1) * 100;
      } else {
        currentAccumulator += val;
      }
      hasNumberInProgress = true;
    } else if (MAGNITUDES[w] !== undefined) {
      const mult = MAGNITUDES[w];
      currentAccumulator = (currentAccumulator || 1) * mult;
      hasNumberInProgress = true;
    } else {
      if (hasNumberInProgress) {
        resultTokens.push(String(currentAccumulator));
        currentAccumulator = 0;
        hasNumberInProgress = false;
      }
      resultTokens.push(w);
    }
  }

  if (hasNumberInProgress) {
    resultTokens.push(String(currentAccumulator));
  }

  return resultTokens.join(" ");
}

/**
 * Translates verbal math operations into formal algebraic expressions
 */
export function normalizeSpokenOperations(text: string): string {
  let s = normalizeSpokenNumbers(text);

  // Spoken brackets
  s = s.replace(/\b(open\s+bracket|bracket\s+open|open\s+parenthesis|parenthesis\s+open)\b/gi, "(");
  s = s.replace(/\b(close\s+bracket|bracket\s+close|close\s+parenthesis|parenthesis\s+close)\b/gi, ")");

  // Powers and roots
  s = s.replace(/\bsquare\s+root\s+of\s+(\d+(\.\d+)?)/gi, "sqrt($1)");
  s = s.replace(/\broot\s+(\d+(\.\d+)?)/gi, "sqrt($1)");
  s = s.replace(/\bsqrt\s+(\d+(\.\d+)?)/gi, "sqrt($1)");
  s = s.replace(/(\d+(\.\d+)?)\s+squared\b/gi, "($1^2)");
  s = s.replace(/(\d+(\.\d+)?)\s+cubed\b/gi, "($1^3)");
  s = s.replace(/(\d+(\.\d+)?)\s+(to\s+the\s+power\s+of|power\s+to|raised\s+to|power)\s+(\d+(\.\d+)?)/gi, "($1^$3)");

  // Standard Arithmetic
  s = s.replace(/\b(plus|add|added\s+to|and)\b/gi, "+");
  s = s.replace(/\b(minus|subtract|subtracted\s+from|less|deduct|take\s+away)\b/gi, "-");
  s = s.replace(/\b(multiplied\s+by|multiply\s+by|times|into|product\s+of)\b/gi, "*");
  s = s.replace(/\b(divided\s+by|divide\s+by|over)\b/gi, "/");
  s = s.replace(/\bmodulo\b|\bmod\b/gi, "%");

  // Percentage symbols
  s = s.replace(/\bpercent\b|\bpercentage\b|\bpct\b/gi, "%");

  return s;
}

/**
 * Evaluates a clean mathematical string safely
 */
export function evaluateMathExpression(expr: string): number {
  let sanitized = expr
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/\^/g, "**")
    .trim();

  // Replace sqrt(x) with Math.sqrt(x)
  sanitized = sanitized.replace(/sqrt\(([^)]+)\)/g, "Math.sqrt($1)");

  // Validate allowed characters only
  if (!/^[0-9+\-*/.() %*Math.sqrt]+$/.test(sanitized)) {
    throw new Error("Invalid mathematical expression.");
  }

  // Handle percentages like 50 + 10% or 100 * 20%
  // Replace standalone "X%" with "(X / 100)"
  sanitized = sanitized.replace(/(\d+(\.\d+)?)\s*%/g, "($1 / 100)");

  // eslint-disable-next-line no-new-func
  const val = Function(`"use strict"; return (${sanitized});`)();
  if (!isFinite(val)) throw new Error("Result is undefined or infinity.");
  return Math.round(val * 1e10) / 1e10;
}

/**
 * Master parser for spoken sentences
 */
export function parseSpokenMath(rawText: string, currentDisplay = "0"): ParsedVoiceResult {
  const text = rawText.trim().toLowerCase();

  // 1. Voice Commands
  if (/^(clear|all\s+clear|reset|wipe|clean)$/i.test(text)) {
    return {
      type: "COMMAND",
      command: "CLEAR",
      spokenText: rawText,
      expression: "",
      displayExpression: "0",
      result: 0,
      formattedResult: "0",
      wordsResult: { indian: "Zero", western: "Zero" },
      spokenFeedback: "Cleared.",
    };
  }

  if (/^(backspace|delete|remove\s+last|undo)$/i.test(text)) {
    return {
      type: "COMMAND",
      command: "BACKSPACE",
      spokenText: rawText,
      expression: "",
      displayExpression: "",
      result: null,
      formattedResult: "",
      wordsResult: { indian: "", western: "" },
      spokenFeedback: "Deleted.",
    };
  }

  if (/^(equals|calculate|solve|result|total)$/i.test(text)) {
    return {
      type: "COMMAND",
      command: "EVALUATE",
      spokenText: rawText,
      expression: currentDisplay,
      displayExpression: currentDisplay,
      result: null,
      formattedResult: "",
      wordsResult: { indian: "", western: "" },
      spokenFeedback: "Calculating.",
    };
  }

  const normalized = normalizeSpokenOperations(text);

  // 2. Specialized Pattern: "What is X percent of Y" or "X% of Y"
  const pctOfMatch = normalized.match(/(\d+(\.\d+)?)\s*%\s*(of)\s*(\d+(\.\d+)?)/i);
  if (pctOfMatch) {
    const rate = parseFloat(pctOfMatch[1]);
    const base = parseFloat(pctOfMatch[4]);
    const result = (base * rate) / 100;
    const rounded = Math.round(result * 1e10) / 1e10;
    const formatted = formatNumber(rounded);
    const words = numberToWords(rounded);

    return {
      type: "CALCULATION",
      spokenText: rawText,
      expression: `${base} * (${rate} / 100)`,
      displayExpression: `${rate}% of ${formatNumber(base)}`,
      result: rounded,
      formattedResult: formatted,
      wordsResult: words,
      details: {
        type: "PERCENTAGE",
        baseAmount: base,
        rate,
        finalAmount: rounded,
        summaryText: `${rate}% of ${formatNumber(base)} is ${formatted}`,
      },
      spokenFeedback: `${rate} percent of ${formatNumber(base)} is ${formatted}.`,
    };
  }

  // 3. Specialized Pattern: "Add X% GST/tax to Y" or "Y plus X% GST"
  const addGstMatch =
    normalized.match(/(\d+(\.\d+)?)\s*\+\s*(\d+(\.\d+)?)\s*%\s*(gst|tax)?/i) ||
    normalized.match(/(add|apply)\s*(\d+(\.\d+)?)\s*%\s*(gst|tax)?\s*(to|on)\s*(\d+(\.\d+)?)/i);

  if (addGstMatch) {
    let base: number;
    let rate: number;

    if (addGstMatch[1] && addGstMatch[3]) {
      base = parseFloat(addGstMatch[1]);
      rate = parseFloat(addGstMatch[3]);
    } else {
      rate = parseFloat(addGstMatch[2]);
      base = parseFloat(addGstMatch[6]);
    }

    const taxAmount = (base * rate) / 100;
    const total = base + taxAmount;
    const rounded = Math.round(total * 100) / 100;
    const formatted = formatNumber(rounded);
    const words = numberToWords(rounded);

    return {
      type: "CALCULATION",
      spokenText: rawText,
      expression: `${base} + (${base} * ${rate} / 100)`,
      displayExpression: `${formatNumber(base)} + ${rate}% GST`,
      result: rounded,
      formattedResult: formatted,
      wordsResult: words,
      details: {
        type: "GST",
        baseAmount: base,
        rate,
        taxOrDiscountAmount: taxAmount,
        finalAmount: rounded,
        summaryText: `Base: ${formatNumber(base)} + GST (${rate}%): ${formatNumber(taxAmount)} = Total: ${formatted}`,
      },
      spokenFeedback: `Total with ${rate} percent GST is ${formatted}.`,
    };
  }

  // 4. Specialized Pattern: "Discount X% on Y" or "Y minus X%"
  const discountMatch =
    normalized.match(/(\d+(\.\d+)?)\s*-\s*(\d+(\.\d+)?)\s*%/i) ||
    normalized.match(/(discount|off|less)\s*(\d+(\.\d+)?)\s*%\s*(from|on)?\s*(\d+(\.\d+)?)/i);

  if (discountMatch) {
    let base: number;
    let rate: number;

    if (discountMatch[1] && discountMatch[3]) {
      base = parseFloat(discountMatch[1]);
      rate = parseFloat(discountMatch[3]);
    } else {
      rate = parseFloat(discountMatch[2]);
      base = parseFloat(discountMatch[5]);
    }

    const discountAmount = (base * rate) / 100;
    const total = base - discountAmount;
    const rounded = Math.round(total * 100) / 100;
    const formatted = formatNumber(rounded);
    const words = numberToWords(rounded);

    return {
      type: "CALCULATION",
      spokenText: rawText,
      expression: `${base} - (${base} * ${rate} / 100)`,
      displayExpression: `${formatNumber(base)} - ${rate}% discount`,
      result: rounded,
      formattedResult: formatted,
      wordsResult: words,
      details: {
        type: "DISCOUNT",
        baseAmount: base,
        rate,
        taxOrDiscountAmount: discountAmount,
        finalAmount: rounded,
        summaryText: `Original: ${formatNumber(base)} - Discount (${rate}%): ${formatNumber(discountAmount)} = Final: ${formatted}`,
      },
      spokenFeedback: `Final amount after ${rate} percent discount is ${formatted}.`,
    };
  }

  // 5. General Arithmetic or Scientific Math
  try {
    // Filter down to allowable math tokens
    let cleaned = normalized
      .replace(/[^0-9+\-*/.() %*sqrt^Math]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleaned) throw new Error("No mathematical expression found.");

    const result = evaluateMathExpression(cleaned);
    const rounded = Math.round(result * 1e10) / 1e10;
    const formatted = formatNumber(rounded);
    const words = numberToWords(rounded);

    return {
      type: "CALCULATION",
      spokenText: rawText,
      expression: cleaned,
      displayExpression: cleaned.replace(/\*/g, " × ").replace(/\//g, " ÷ "),
      result: rounded,
      formattedResult: formatted,
      wordsResult: words,
      details: {
        type: "BASIC",
        finalAmount: rounded,
      },
      spokenFeedback: `The result is ${formatted}.`,
    };
  } catch (err) {
    return {
      type: "ERROR",
      spokenText: rawText,
      expression: rawText,
      displayExpression: rawText,
      result: null,
      formattedResult: "Error",
      wordsResult: { indian: "", western: "" },
      spokenFeedback: "Sorry, I could not calculate that. Try saying 150 plus 45 or 18 percent of 50,000.",
    };
  }
}

/**
 * Format numbers with comma grouping (supports Indian Lakhs/Crores convention)
 */
export function formatNumber(num: number, useIndianFormat = true): string {
  if (isNaN(num)) return "0";
  const parts = num.toString().split(".");
  let intPart = parts[0];
  const decPart = parts[1] ? "." + parts[1].slice(0, 4) : "";

  if (useIndianFormat) {
    const isNegative = intPart.startsWith("-");
    if (isNegative) intPart = intPart.slice(1);

    const lastThree = intPart.slice(-3);
    const otherNumbers = intPart.slice(0, -3);
    const formatted =
      otherNumbers !== ""
        ? otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + lastThree
        : lastThree;

    return (isNegative ? "-" : "") + formatted + decPart;
  }

  return Number(num).toLocaleString("en-US", { maximumFractionDigits: 4 });
}

/**
 * Converts a numeric value to words in Indian (Lakhs, Crores) and Western (Millions, Billions) formats.
 */
export function numberToWords(num: number): { indian: string; western: string } {
  if (isNaN(num) || num === 0) return { indian: "Zero", western: "Zero" };

  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];

  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];

  function convertTwoDigits(n: number): string {
    if (n === 0) return "";
    if (n < 20) return ones[n];
    const t = tens[Math.floor(n / 10)];
    const o = ones[n % 10];
    return o ? `${t} ${o}` : t;
  }

  function convertThreeDigits(n: number): string {
    const hundred = Math.floor(n / 100);
    const rest = n % 100;
    let res = "";
    if (hundred > 0) res += `${ones[hundred]} Hundred`;
    if (rest > 0) res += (res ? " " : "") + convertTwoDigits(rest);
    return res;
  }

  const absNum = Math.floor(Math.abs(num));

  // 1. Indian numbering system
  function toIndianWords(n: number): string {
    if (n === 0) return "Zero";
    const crore = Math.floor(n / 10_000_000);
    let remainder = n % 10_000_000;
    const lakh = Math.floor(remainder / 100_000);
    remainder %= 100_000;
    const thousand = Math.floor(remainder / 1_000);
    remainder %= 1_000;
    const hundreds = remainder;

    const parts: string[] = [];
    if (crore > 0) parts.push(`${toIndianWords(crore)} Crore`);
    if (lakh > 0) parts.push(`${convertTwoDigits(lakh)} Lakh`);
    if (thousand > 0) parts.push(`${convertTwoDigits(thousand)} Thousand`);
    if (hundreds > 0) parts.push(convertThreeDigits(hundreds));

    return parts.join(" ");
  }

  // 2. Western numbering system
  function toWesternWords(n: number): string {
    if (n === 0) return "Zero";
    const billion = Math.floor(n / 1_000_000_000);
    let rem = n % 1_000_000_000;
    const million = Math.floor(rem / 1_000_000);
    rem %= 1_000_000;
    const thousand = Math.floor(rem / 1_000);
    rem %= 1_000;
    const hundreds = rem;

    const parts: string[] = [];
    if (billion > 0) parts.push(`${convertThreeDigits(billion)} Billion`);
    if (million > 0) parts.push(`${convertThreeDigits(million)} Million`);
    if (thousand > 0) parts.push(`${convertThreeDigits(thousand)} Thousand`);
    if (hundreds > 0) parts.push(convertThreeDigits(hundreds));

    return parts.join(" ");
  }

  const prefix = num < 0 ? "Minus " : "";
  return {
    indian: prefix + (toIndianWords(absNum) || "Zero"),
    western: prefix + (toWesternWords(absNum) || "Zero"),
  };
}

/**
 * Loan EMI calculation helper
 */
export function calculateLoanEmi(principal: number, annualRatePct: number, tenureMonths: number) {
  if (!principal || !annualRatePct || !tenureMonths) {
    return { emi: 0, totalInterest: 0, totalPayment: 0 };
  }
  const monthlyRate = annualRatePct / 12 / 100;
  const emi =
    (principal * monthlyRate * Math.pow(1 + monthlyRate, tenureMonths)) /
    (Math.pow(1 + monthlyRate, tenureMonths) - 1);
  const totalPayment = emi * tenureMonths;
  const totalInterest = totalPayment - principal;

  return {
    emi: Math.round(emi * 100) / 100,
    totalInterest: Math.round(totalInterest * 100) / 100,
    totalPayment: Math.round(totalPayment * 100) / 100,
  };
}
