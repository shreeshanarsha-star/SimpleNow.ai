// AI-assisted signing-field detection. Text-only extraction (pdf-parse /
// mammoth) doesn't give real (x, y) coordinates, so this makes an honest,
// documented choice rather than pretending to pixel-perfect detection:
//
//  1. Scan the document for an existing signature/closing block (regex --
//     "Signature:", "Signed by", "IN WITNESS WHEREOF", a blank
//     underscore signing line, etc). If found, its exact character
//     offset is used to compute a real page + vertical position: the
//     offset's fraction through that page's text (for a genuine source
//     PDF) or the exact paragraph the generated working PDF placed it on
//     (for a DOCX/DOC source, via workingPdf.ts's paragraphMap). This is
//     evidence-based, not a fixed layout constant -- confidence = "high".
//  2. If no such block exists anywhere, a short AI call looks at the
//     LAST few pages/paragraphs (signature blocks are essentially always
//     near the end -- scanning the whole document for this is needless
//     cost) and identifies which one is or should be the signing
//     location. If it commits to one, that page is used -- confidence =
//     "high", since a real page was identified, not invented.
//  3. Only if neither (1) nor (2) finds anything (AI unavailable, AI
//     declines to guess, or the document is genuinely unclear) is a
//     "Signature Page" generated and appended -- confidence = "low" /
//     needs_review, the true last resort, never the default path.
//
// Known limitation, stated plainly rather than hidden: pdf-parse's
// per-page text generally follows reading order for simple single/two-
// column documents, but can be out of order on complex multi-column or
// heavily-tabled layouts -- the offset-based Y estimate inherits that
// limitation. This still lands the field on the CORRECT PAGE reliably;
// the within-page vertical placement is a reasonable estimate, not a
// guaranteed pixel-exact box.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { sanitizeForPdfText } from "./workingPdf";
import { callTextModel, hasAiKey } from "@/lib/aiClient";
import type { ParagraphLocation } from "./workingPdf";
import type { FieldPosition, FieldType } from "./types";

// Deliberately requires a field-LABEL shape (a colon, or a standalone
// closing-clause phrase) rather than the bare word "signature" -- an
// earlier version matched any occurrence of that word anywhere in the
// document, including incidental prose ("...effective as of the date of
// last signature"), which put fields in the middle of body text instead
// of the real signing block. Caught by testing against a real generated
// PDF, not assumed.
const SIGNATURE_KEYWORD =
  /(signature\s*:|sign\s*here|signed\s*by\s*:|authorized\s*signator\w*|in\s+witness\s+whereof|have\s+executed\s+this|executed\s+as\s+of\s+the|executed\s+the\s+day|acknowledged\s+and\s+agreed|print\s*name\s*:|x_{3,}|_{6,})/gi;

const MAX_AI_CLASSIFIER_CHUNKS = 8;

export interface SignerInput {
  recipientId: string;
  name: string;
  signingOrder: number;
}

export interface DetectedField {
  recipient_id: string;
  field_type: FieldType;
  page: number; // 1-indexed
  position: FieldPosition;
  confidence: "high" | "low";
}

export interface FieldDetectionResult {
  fields: DetectedField[];
  appendedSignaturePage: boolean;
  overallConfidence: "ok" | "needs_review";
}

interface ResolvedLocation {
  page: number; // 0-indexed
  yFraction: number; // 0..1 from top of that page
  method: "keyword" | "ai";
}

async function decideOptionalFields(documentText: string): Promise<{ includeName: boolean; includeLocation: boolean; ok: boolean }> {
  const fallback = { includeName: true, includeLocation: false, ok: false };
  if (!hasAiKey() || !documentText.trim()) return fallback;

  const prompt = `You are preparing an e-signature workflow for a document. Read the excerpt below and decide, for EACH signer, whether the signing block should also collect a typed Name and a Location (city/place of signing), beyond the Signature and Date fields every signer always gets.

Respond with ONLY a JSON object, no prose, no markdown fences:
{"includeName": boolean, "includeLocation": boolean}

Set includeLocation true only if the document text itself references a place of signing/execution (e.g. "executed at", "signed in the city of", a Jurisdiction/Venue clause). Otherwise false. includeName should be true unless the document is clearly informal and a full name field would be redundant.

Document excerpt:
"""
${documentText.slice(0, 6000)}
"""`;

  try {
    const raw = await callTextModel(prompt, 200, 20_000);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    const parsed = JSON.parse(match[0]);
    return {
      includeName: typeof parsed.includeName === "boolean" ? parsed.includeName : true,
      includeLocation: typeof parsed.includeLocation === "boolean" ? parsed.includeLocation : false,
      ok: true,
    };
  } catch {
    return fallback;
  }
}

// Step 1: regex scan, mapped to a real offset -> real page + fraction.
// Uses the LAST match, not the first: a signature/closing block is
// always at or near the end of a real document, and taking the first
// hit is exactly what produced the body-text false-positive above.
function findByKeyword(params: {
  generatedFromText: boolean;
  pages: string[];
  fullText: string;
  paragraphMap: ParagraphLocation[];
}): ResolvedLocation | null {
  if (!params.generatedFromText) {
    // Scan pages from the end backward -- the first page (from the end)
    // with any match at all is the one to use, and within it we take
    // that page's own last match.
    for (let i = params.pages.length - 1; i >= 0; i--) {
      const matches = [...params.pages[i].matchAll(SIGNATURE_KEYWORD)];
      if (matches.length > 0) {
        const last = matches[matches.length - 1];
        const fraction = clamp((last.index ?? 0) / Math.max(params.pages[i].length, 1), 0.1, 0.92);
        return { page: i, yFraction: fraction, method: "keyword" };
      }
    }
    return null;
  }

  // Generated-from-text (DOCX/DOC): search fullText for the LAST match,
  // then map its offset to the paragraph the working PDF actually placed
  // there.
  const matches = [...params.fullText.matchAll(SIGNATURE_KEYWORD)];
  if (matches.length === 0 || params.paragraphMap.length === 0) return null;
  const last = matches[matches.length - 1];
  const matchIndex = last.index ?? 0;

  let located: ParagraphLocation | null = null;
  for (const p of params.paragraphMap) {
    if (p.offset <= matchIndex) located = p;
    else break;
  }
  if (!located) located = params.paragraphMap[0];
  return { page: located.page, yFraction: clamp(located.yFraction, 0.05, 0.95), method: "keyword" };
}

// Step 2: AI fallback, scoped to the last few chunks only (signature
// blocks are essentially always near the end of a document -- bounding
// this keeps the call small and cheap rather than feeding the whole
// document through the model).
async function findByAiClassifier(params: {
  generatedFromText: boolean;
  pages: string[];
  paragraphMap: ParagraphLocation[];
}): Promise<ResolvedLocation | null> {
  if (!hasAiKey()) return null;

  type Chunk = { id: number; page: number; yFraction: number; text: string };
  let chunks: Chunk[];

  if (!params.generatedFromText) {
    const start = Math.max(0, params.pages.length - MAX_AI_CLASSIFIER_CHUNKS);
    chunks = params.pages.slice(start).map((text, i) => ({ id: start + i, page: start + i, yFraction: 0.75, text: text.slice(0, 1200) }));
  } else {
    const start = Math.max(0, params.paragraphMap.length - MAX_AI_CLASSIFIER_CHUNKS * 3);
    chunks = params.paragraphMap.slice(start).map((p, i) => ({ id: start + i, page: p.page, yFraction: p.yFraction, text: p.text }));
  }
  if (chunks.length === 0) return null;

  const prompt = `Below are the final sections of a document, in order, each labeled with a chunk id. Identify which chunk id contains (or should contain) the signature/closing block -- for example "IN WITNESS WHEREOF", a parties/dates block, or explicit signature lines. If none of these chunks is a plausible signing location, respond with null.

Respond with ONLY JSON, no prose: {"chunkId": number|null}

${chunks.map((c) => `Chunk ${c.id}:\n${c.text}`).join("\n\n")}`;

  try {
    const raw = await callTextModel(prompt, 60, 20_000);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (typeof parsed.chunkId !== "number") return null;
    const chunk = chunks.find((c) => c.id === parsed.chunkId);
    if (!chunk) return null;
    return { page: chunk.page, yFraction: chunk.yFraction, method: "ai" };
  } catch {
    return null;
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

// Places one row per signer at the resolved location, stacked downward
// if more than one signer shares the page -- computed from signer count
// and the resolved offset, never a fixed constant.
function layoutAtLocation(
  location: ResolvedLocation,
  signers: SignerInput[],
  includeName: boolean,
  includeLocation: boolean
): DetectedField[] {
  const fields: DetectedField[] = [];
  const rowHeight = Math.min(0.09, (1 - location.yFraction) / Math.max(signers.length, 1), 0.12);
  const bandTop = clamp(location.yFraction, 0.05, 1 - rowHeight * signers.length - 0.03);

  signers.forEach((signer, idx) => {
    const rowY = bandTop + idx * rowHeight;
    const rowFields: Array<{ type: FieldType; x: number; w: number }> = [
      { type: "signature", x: 0.06, w: 0.32 },
      { type: "date", x: 0.4, w: 0.16 },
    ];
    if (includeName) rowFields.push({ type: "name", x: 0.58, w: 0.18 });
    if (includeLocation) rowFields.push({ type: "location", x: 0.78, w: 0.16 });

    for (const rf of rowFields) {
      fields.push({
        recipient_id: signer.recipientId,
        field_type: rf.type,
        page: location.page + 1,
        position: { x: rf.x, y: rowY, w: rf.w, h: Math.max(rowHeight * 0.65, 0.032) },
        confidence: "high",
      });
    }
  });
  return fields;
}

// True last resort: draws a real, self-contained signature block per
// signer on a freshly appended page, and returns the exact fractional
// positions used -- position data always matches what's visually there.
async function appendGeneratedSignaturePage(
  pdfDoc: PDFDocument,
  signers: SignerInput[],
  includeName: boolean,
  includeLocation: boolean
): Promise<{ fields: DetectedField[]; pageIndex: number }> {
  const page = pdfDoc.addPage([612, 792]);
  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const margin = 56;

  page.drawText("Signature Page", { x: margin, y: height - margin, size: 15, font: boldFont, color: rgb(0.05, 0.05, 0.08) });
  page.drawText("Each signer below must complete their signature block.", {
    x: margin,
    y: height - margin - 20,
    size: 9.5,
    font,
    color: rgb(0.35, 0.35, 0.38),
  });

  const fields: DetectedField[] = [];
  const rowHeight = 88;
  let cursorY = height - margin - 56;

  for (const signer of signers) {
    page.drawText(`Signer ${signer.signingOrder}: ${sanitizeForPdfText(signer.name)}`, {
      x: margin,
      y: cursorY,
      size: 11,
      font: boldFont,
      color: rgb(0.1, 0.1, 0.12),
    });

    const lineY = cursorY - 26;
    const boxW = 220;
    const boxH = 28;

    page.drawRectangle({ x: margin, y: lineY - boxH, width: boxW, height: boxH, borderColor: rgb(0.7, 0.7, 0.73), borderWidth: 1 });
    page.drawText("Signature", { x: margin, y: lineY - boxH - 12, size: 8, font, color: rgb(0.45, 0.45, 0.48) });
    fields.push({
      recipient_id: signer.recipientId,
      field_type: "signature",
      page: 0,
      position: { x: margin / width, y: (height - lineY) / height, w: boxW / width, h: boxH / height },
      confidence: "low",
    });

    let nextX = margin + boxW + 20;
    const smallW = 100;

    page.drawRectangle({ x: nextX, y: lineY - boxH, width: smallW, height: boxH, borderColor: rgb(0.7, 0.7, 0.73), borderWidth: 1 });
    page.drawText("Date", { x: nextX, y: lineY - boxH - 12, size: 8, font, color: rgb(0.45, 0.45, 0.48) });
    fields.push({
      recipient_id: signer.recipientId,
      field_type: "date",
      page: 0,
      position: { x: nextX / width, y: (height - lineY) / height, w: smallW / width, h: boxH / height },
      confidence: "low",
    });
    nextX += smallW + 20;

    if (includeName) {
      page.drawRectangle({ x: nextX, y: lineY - boxH, width: smallW, height: boxH, borderColor: rgb(0.7, 0.7, 0.73), borderWidth: 1 });
      page.drawText("Print Name", { x: nextX, y: lineY - boxH - 12, size: 8, font, color: rgb(0.45, 0.45, 0.48) });
      fields.push({
        recipient_id: signer.recipientId,
        field_type: "name",
        page: 0,
        position: { x: nextX / width, y: (height - lineY) / height, w: smallW / width, h: boxH / height },
        confidence: "low",
      });
      nextX += smallW + 20;
    }

    if (includeLocation) {
      page.drawRectangle({ x: nextX, y: lineY - boxH, width: smallW, height: boxH, borderColor: rgb(0.7, 0.7, 0.73), borderWidth: 1 });
      page.drawText("Location", { x: nextX, y: lineY - boxH - 12, size: 8, font, color: rgb(0.45, 0.45, 0.48) });
      fields.push({
        recipient_id: signer.recipientId,
        field_type: "location",
        page: 0,
        position: { x: nextX / width, y: (height - lineY) / height, w: smallW / width, h: boxH / height },
        confidence: "low",
      });
    }

    cursorY -= rowHeight;
  }

  return { fields, pageIndex: pdfDoc.getPageCount() - 1 };
}

export async function detectSigningFields(params: {
  pdfDoc: PDFDocument;
  pages: string[]; // per-page text; only meaningful when generatedFromText is false
  fullText: string;
  generatedFromText: boolean;
  paragraphMap: ParagraphLocation[]; // only meaningful when generatedFromText is true
  signers: SignerInput[];
}): Promise<FieldDetectionResult> {
  const { includeName, includeLocation } = await decideOptionalFields(params.fullText);

  const keywordLocation = findByKeyword(params);
  const location = keywordLocation ?? (await findByAiClassifier(params));

  if (location) {
    const fields = layoutAtLocation(location, params.signers, includeName, includeLocation);
    // A real page was identified either by direct textual evidence or by
    // the AI's read of the closing section -- never a blind guess -- so
    // this is "ok" confidence regardless of which of the two found it.
    // The optional-fields AI call failing/being unavailable doesn't
    // downgrade this: Name/Location defaults are safe either way.
    return { fields, appendedSignaturePage: false, overallConfidence: "ok" };
  }

  const { fields, pageIndex } = await appendGeneratedSignaturePage(params.pdfDoc, params.signers, includeName, includeLocation);
  return {
    fields: fields.map((f) => ({ ...f, page: pageIndex + 1 })),
    appendedSignaturePage: true,
    overallConfidence: "needs_review",
  };
  // (`ok` from decideOptionalFields is intentionally not consulted for
  // overallConfidence -- it only ever softens Name/Location, never the
  // page/position judgment, which is what "needs_review" is about.)
}
