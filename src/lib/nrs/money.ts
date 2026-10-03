// NR Synergy money helpers.
//
// Storage rule: money is an integer count of the currency's minor unit
// (cents, fils, yen...) plus an ISO 4217 code. Never store floats.
//
// In TypeScript a minor amount is a `number` that must be a safe integer
// (|x| <= 2^53-1, i.e. ~90 trillion USD), which is what supabase-js returns
// for bigint columns and what JSON can carry. All arithmetic that could
// produce a fraction (parsing, FX conversion) is done in BigInt and rounded
// half-even (banker's rounding) before coming back to a number.

export type MinorUnits = number;

// ISO 4217 minor-unit exponents that differ from the default of 2.
const EXPONENTS: Record<string, number> = {
  // 0 decimals
  JPY: 0,
  KRW: 0,
  VND: 0,
  CLP: 0,
  ISK: 0,
  PYG: 0,
  UGX: 0,
  XAF: 0,
  XOF: 0,
  // 3 decimals
  BHD: 3,
  KWD: 3,
  OMR: 3,
  JOD: 3,
  TND: 3,
  LYD: 3,
  IQD: 3,
};

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const TEN = BigInt(10);

export function currencyExponent(currency: string): number {
  return EXPONENTS[currency.toUpperCase()] ?? 2;
}

function pow10(n: number): bigint {
  let r = ONE;
  for (let i = 0; i < n; i++) r *= TEN;
  return r;
}

function assertMinor(v: number, label = "amount"): void {
  if (!Number.isSafeInteger(v)) {
    throw new RangeError(`${label} must be a safe integer of minor units, got ${v}`);
  }
}

function toSafeNumber(v: bigint): MinorUnits {
  const n = Number(v);
  if (!Number.isSafeInteger(n)) throw new RangeError(`Money amount out of safe range: ${v.toString()}`);
  return n;
}

/** n / d rounded half-to-even. d must be > 0. */
export function divRoundHalfEven(n: bigint, d: bigint): bigint {
  if (d <= ZERO) throw new RangeError("divisor must be positive");
  const negative = n < ZERO;
  const a = negative ? -n : n;
  let q = a / d;
  const twiceR = (a % d) * TWO;
  if (twiceR > d || (twiceR === d && q % TWO === ONE)) q += ONE;
  return negative ? -q : q;
}

/** Parse a plain decimal string ("-12.345") into a scaled bigint: value = int / 10^scale. */
function parseDecimal(input: string): { int: bigint; scale: number } {
  const s = input.trim();
  const m = /^([+-])?(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (!m[2] && !m[3])) throw new RangeError(`Not a decimal number: "${input}"`);
  const sign = m[1] === "-" ? -ONE : ONE;
  const whole = m[2] || "0";
  const frac = m[3] ?? "";
  return { int: sign * BigInt(whole + frac), scale: frac.length };
}

/** Decimal-safe string for a JS number (avoids "1e-7" exponent notation). */
function numberToDecimalString(n: number): string {
  if (!Number.isFinite(n)) throw new RangeError(`Not a finite number: ${n}`);
  const s = String(n);
  return /e/i.test(s) ? n.toFixed(20).replace(/0+$/, "").replace(/\.$/, "") : s;
}

/**
 * "1234.5" + "USD" -> 123450. Accepts a decimal string (preferred) or a number.
 * Extra decimal places beyond the currency's exponent are rounded half-even.
 */
export function toMinor(amount: string | number, currency: string): MinorUnits {
  const str = typeof amount === "number" ? numberToDecimalString(amount) : amount.replace(/[,_\s]/g, "");
  const { int, scale } = parseDecimal(str);
  const exp = currencyExponent(currency);
  const scaled = scale <= exp ? int * pow10(exp - scale) : divRoundHalfEven(int, pow10(scale - exp));
  return toSafeNumber(scaled);
}

/** 123450 + "USD" -> "1234.50" (plain decimal string, no grouping). */
export function fromMinor(minor: MinorUnits, currency: string): string {
  assertMinor(minor);
  const exp = currencyExponent(currency);
  const negative = minor < 0;
  const digits = String(Math.abs(minor));
  if (exp === 0) return (negative ? "-" : "") + digits;
  const padded = digits.padStart(exp + 1, "0");
  const whole = padded.slice(0, padded.length - exp);
  const frac = padded.slice(padded.length - exp);
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

/** Localised display, e.g. formatMoney(123450, "EUR", "de") -> "1.234,50 €". */
export function formatMoney(minor: MinorUnits, currency: string, locale = "en"): string {
  assertMinor(minor);
  const exp = currencyExponent(currency);
  const value = Number(fromMinor(minor, currency));
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: exp,
      maximumFractionDigits: exp,
    }).format(value);
  } catch {
    return `${fromMinor(minor, currency)} ${currency.toUpperCase()}`;
  }
}

/** Integer addition of minor amounts (same currency is the caller's responsibility). */
export function addMinor(a: MinorUnits, b: MinorUnits): MinorUnits {
  assertMinor(a, "a");
  assertMinor(b, "b");
  return toSafeNumber(BigInt(a) + BigInt(b));
}

/** Sum of minor amounts; empty list -> 0. */
export function sumMinor(values: readonly MinorUnits[]): MinorUnits {
  let total = ZERO;
  for (const v of values) {
    assertMinor(v);
    total += BigInt(v);
  }
  return toSafeNumber(total);
}

/**
 * Convert a minor amount with an FX rate (units of target per 1 unit of
 * source, as stored in nrs_fx_rates.rate / fx_rate columns). Pass the rate
 * as the decimal string Postgres returns for numeric to keep it exact.
 * When the two currencies have different exponents (e.g. JPY -> USD), pass
 * both codes so the minor-unit scale is adjusted. Rounds half-even.
 */
export function convertMinor(
  minor: MinorUnits,
  rate: string | number,
  fromCurrency?: string,
  toCurrency?: string
): MinorUnits {
  assertMinor(minor);
  const r = parseDecimal(typeof rate === "number" ? numberToDecimalString(rate) : rate);
  if (r.int <= ZERO) throw new RangeError("FX rate must be positive");
  const expFrom = fromCurrency ? currencyExponent(fromCurrency) : 0;
  const expTo = toCurrency ? currencyExponent(toCurrency) : 0;
  const shift = fromCurrency && toCurrency ? expTo - expFrom : 0;
  let numerator = BigInt(minor) * r.int;
  let denominator = pow10(r.scale);
  if (shift > 0) numerator *= pow10(shift);
  if (shift < 0) denominator *= pow10(-shift);
  return toSafeNumber(divRoundHalfEven(numerator, denominator));
}
