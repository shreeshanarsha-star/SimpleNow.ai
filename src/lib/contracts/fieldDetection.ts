// AI-assisted signing-field detection. Text-only extraction (pdf-parse /
// mammoth) doesn't give real (x, y) coordinates, so this makes an honest,
// documented choice rather than pretending to pixel-perfect detection:
//
//  1. Scan each page's text for an existing signature block ("Signature:",
//     "Signed by", "Authorized Signatory", ...). If found, that's a real,
//     evidence-based page -- fields are placed in a computed lower-page
//     band there, confidence = "high".
//  2. If no such block exists anywhere in the document, a "Signature
//     Page" is generated and appended to the working PDF with a real
//     drawn block per signer -- confidence = "low" / needs_review, so the
//     owner can see this was a fallback, not a detected requirement.
//  3. A short AI call (best-effort, degrades to a safe default) decides
//     only whether Name/Location fields are actually warranted, given
//     the document text -- never invents extra field types, and never
//     blocks the pipeline if the AI call fails or no key is configured.
//
// Positions are always {x,y,w,h} fractions computed from page geometry
// and signer count -- never a hardcoded constant shared across documents.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { callTextModel, hasAiKey } from "@/lib/aiClient";
import type { FieldPosition, FieldType } from "./types";

const SIGNATURE_KEYWORD = /(signature|sign\s*here|signed\s*by|authorized\s*signatory)/i;

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

async function decideOptionalFields(documentText: string): Promise<{ includeName: boolean; includeLocation: boolean; ok: boolean }> {
  // Safe default: every signer always gets Signature + Date. Name is
  // included unless the AI call actively says otherwise (it's rarely
  // wrong to ask for it); Location defaults to off since most documents
  // don't need it.
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

function findSignatureKeywordPage(pages: string[]): number | null {
  for (let i = 0; i < pages.length; i++) {
    if (SIGNATURE_KEYWORD.test(pages[i])) return i; // 0-indexed
  }
  return null;
}

// Places one row per signer in the bottom band of an existing page that
// already contains signature language. Row count/height is computed from
// how many signers must fit -- not a fixed pixel layout.
function layoutOnExistingPage(
  signers: SignerInput[],
  includeName: boolean,
  includeLocation: boolean
): DetectedField[] {
  const fields: DetectedField[] = [];
  const bandTop = 0.72; // bottom ~28% of the page, a reasonable zone for a trailing signature block
  const bandHeight = 0.24;
  const rowHeight = bandHeight / Math.max(signers.length, 1);

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
        page: 0, // filled by caller (1-indexed, same page for all)
        position: { x: rf.x, y: rowY, w: rf.w, h: Math.max(rowHeight * 0.6, 0.035) },
        confidence: "high",
      });
    }
  });
  return fields;
}

// Draws a real, self-contained signature block per signer on a freshly
// appended page, and returns the exact fractional positions used --
// position data always matches what's visually on the page.
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
    page.drawText(`Signer ${signer.signingOrder}: ${signer.name}`, {
      x: margin,
      y: cursorY,
      size: 11,
      font: boldFont,
      color: rgb(0.1, 0.1, 0.12),
    });

    const lineY = cursorY - 26;
    const boxW = 220;
    const boxH = 28;

    // Signature box
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
  pages: string[]; // per-page text; meaningless (single blob) when generatedFromText is true
  fullText: string;
  generatedFromText: boolean;
  signers: SignerInput[];
}): Promise<FieldDetectionResult> {
  const { includeName, includeLocation, ok } = await decideOptionalFields(params.fullText);

  const keywordPageIndex = params.generatedFromText ? null : findSignatureKeywordPage(params.pages);

  if (keywordPageIndex !== null) {
    const fields = layoutOnExistingPage(params.signers, includeName, includeLocation).map((f) => ({
      ...f,
      page: keywordPageIndex + 1,
    }));
    return { fields, appendedSignaturePage: false, overallConfidence: ok ? "ok" : "needs_review" };
  }

  const { fields, pageIndex } = await appendGeneratedSignaturePage(params.pdfDoc, params.signers, includeName, includeLocation);
  return {
    fields: fields.map((f) => ({ ...f, page: pageIndex + 1 })),
    appendedSignaturePage: true,
    overallConfidence: "needs_review",
  };
}
