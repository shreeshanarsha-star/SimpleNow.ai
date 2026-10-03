import Anthropic from "@anthropic-ai/sdk";
import { callTextModel, getModel, hasAiKey } from "@/lib/aiClient";
import { toMinor } from "../money";
import type { BillingBasis } from "./calc";
import { EXPENSE_CATEGORIES, type ContractExtraction, type ExtractedField } from "./types";

// AI extraction of billing terms from a consultant contract PDF.
//
// Preferred: Claude with the PDF as a document block (reads layout, tables
// and scanned pages). Fallback: the platform's shared text model
// (lib/aiClient) over text pulled with pdf-parse. Either way the model only
// PROPOSES terms; HR reviews and verifies before anything is used to invoice.

const AI_TIMEOUT_MS = 90_000;
const BASES: readonly BillingBasis[] = ["monthly_retainer", "pro_rata_working_days", "day_rate"];

export function contractModel(): string {
  return process.env.NRS_CONTRACT_MODEL || process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
}

export function hasContractAi(): boolean {
  return !!process.env.ANTHROPIC_API_KEY || hasAiKey();
}

const PROMPT = `You extract billing terms from a consultant / contractor agreement for an invoicing system.
Return ONLY a JSON object, no prose, no code fences, with exactly these keys:

{
  "basis":                    {"value": "monthly_retainer" | "pro_rata_working_days" | "day_rate" | null, ...meta},
  "fee_amount":               {"value": "8500.00" (decimal string: the monthly fee, or the day rate for day_rate) | null, ...meta},
  "currency":                 {"value": "USD" (ISO 4217) | null, ...meta},
  "paid_leave_days_per_year": {"value": "12" (decimal string; "0" if the contract says leave is unpaid) | null, ...meta},
  "reimbursables":            {"value": array of any of ${JSON.stringify(EXPENSE_CATEGORIES)} or ["all"] | null, ...meta},
  "tax":                      {"value": object e.g. {"withholding_pct":"10","vat_pct":"0","tax_id_required":true,"notes":"..."} | null, ...meta},
  "notice_days":              {"value": integer | null, ...meta},
  "effective_from":           {"value": "yyyy-mm-dd" | null, ...meta},
  "effective_to":             {"value": "yyyy-mm-dd" | null, ...meta},
  "notes": "anything HR should double-check, or null"
}

where ...meta is: "confidence": number 0..1, "evidence": short verbatim quote from the contract (max 300 chars) or null, "clause": clause/section number like "5.1" or null.

Rules:
- basis: "monthly_retainer" = fixed monthly fee regardless of days; "pro_rata_working_days" = monthly fee pro-rated by working days; "day_rate" = paid per day worked.
- Never guess. If a term is absent, value = null and confidence = 0.
- Quote evidence exactly as written in the contract.`;

function stripFences(s: string): string {
  const t = s.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(t);
  if (fenced) return fenced[1];
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  return first >= 0 && last > first ? t.slice(first, last + 1) : t;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function meta(raw: unknown): Omit<ExtractedField<never>, "value"> {
  const r = asRecord(raw);
  const c = typeof r.confidence === "number" ? r.confidence : Number(r.confidence);
  return {
    confidence: Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0,
    evidence: typeof r.evidence === "string" && r.evidence.trim() ? r.evidence.trim().slice(0, 400) : null,
    clause: typeof r.clause === "string" && r.clause.trim() ? r.clause.trim().slice(0, 40) : typeof r.clause === "number" ? String(r.clause) : null,
  };
}

function field<T>(raw: unknown, coerce: (v: unknown) => T | null): ExtractedField<T> {
  const r = asRecord(raw);
  const value = r.value === undefined || r.value === null ? null : coerce(r.value);
  const m = meta(raw);
  return { value, ...m, confidence: value === null ? Math.min(m.confidence, 0.2) : m.confidence };
}

const decimalStr = (v: unknown): string | null => {
  const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.replace(/[,\s]/g, "") : "";
  return /^\d+(\.\d+)?$/.test(s) ? s : null;
};
const dateStr = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** Validate + coerce a model's JSON into a ContractExtraction. */
export function parseExtraction(text: string, provider: "anthropic" | "openai", model: string): ContractExtraction {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(text));
  } catch {
    throw new Error("The AI response was not valid JSON. Try extracting again.");
  }
  const j = asRecord(parsed);
  const currency = field(j.currency, (v) => (typeof v === "string" && /^[A-Za-z]{3}$/.test(v.trim()) ? v.trim().toUpperCase() : null));
  const feeAmount = field(j.fee_amount ?? j.fee, decimalStr);
  let feeMinor: number | null = null;
  if (feeAmount.value && currency.value) {
    try {
      feeMinor = toMinor(feeAmount.value, currency.value);
    } catch {
      feeMinor = null;
    }
  }
  return {
    basis: field(j.basis, (v) => (typeof v === "string" && (BASES as readonly string[]).includes(v) ? (v as BillingBasis) : null)),
    fee_amount: feeAmount,
    fee_minor: { ...feeAmount, value: feeMinor },
    currency,
    paid_leave_days_per_year: field(j.paid_leave_days_per_year, decimalStr),
    reimbursables: field(j.reimbursables, (v) =>
      Array.isArray(v)
        ? v.filter((x): x is string => typeof x === "string" && (x === "all" || (EXPENSE_CATEGORIES as readonly string[]).includes(x)))
        : null
    ),
    tax: field(j.tax, (v) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null)),
    notice_days: field(j.notice_days, (v) => {
      const n = typeof v === "number" ? v : Number(v);
      return Number.isInteger(n) && n >= 0 && n < 3650 ? n : null;
    }),
    effective_from: field(j.effective_from, dateStr),
    effective_to: field(j.effective_to, dateStr),
    notes: typeof j.notes === "string" && j.notes.trim() ? j.notes.trim().slice(0, 1000) : null,
    model,
    provider,
    extracted_at: new Date().toISOString(),
  };
}

async function extractWithClaude(pdf: Uint8Array): Promise<ContractExtraction> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: AI_TIMEOUT_MS, maxRetries: 1 });
  const model = contractModel();
  const msg = await client.messages.create({
    model,
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(pdf).toString("base64") } },
          { type: "text", text: PROMPT },
        ],
      },
    ],
  });
  const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return parseExtraction(text, "anthropic", model);
}

async function extractWithTextModel(pdf: Uint8Array): Promise<ContractExtraction> {
  const pdfParse = (await import("pdf-parse")).default;
  const { text } = await pdfParse(Buffer.from(pdf));
  const body = text.replace(/\s+\n/g, "\n").trim();
  if (body.length < 200) throw new Error("Couldn't read text from this PDF (is it a scan?). Enter the terms manually.");
  const out = await callTextModel(`${PROMPT}\n\nCONTRACT TEXT:\n"""\n${body.slice(0, 60_000)}\n"""`, 2000, AI_TIMEOUT_MS);
  return parseExtraction(out, "openai", getModel());
}

export async function extractContractTerms(pdf: Uint8Array): Promise<ContractExtraction> {
  if (process.env.ANTHROPIC_API_KEY) return extractWithClaude(pdf);
  if (hasAiKey()) return extractWithTextModel(pdf);
  throw new Error("No AI key is configured on the server. Enter the terms manually.");
}
