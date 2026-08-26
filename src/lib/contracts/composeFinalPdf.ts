// Overlays every recipient's completed field values onto the working PDF
// to produce the final signed document. Runs once, after the last
// required signer completes. The working PDF (and, separately, the
// original upload) are never mutated -- this always operates on a fresh
// copy and writes out a new final.pdf.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { sanitizeForPdfText } from "./workingPdf";
import type { FieldPosition } from "./types";

export interface ComposableField {
  page: number; // 1-indexed
  position: FieldPosition;
  field_type: "signature" | "date" | "name" | "location";
  value: string | null;
  signature_type: "typed" | "drawn" | "uploaded" | null;
}

export async function composeFinalPdf(params: {
  workingBytes: Buffer;
  fields: ComposableField[];
  loadSignatureImage: (storagePath: string) => Promise<Buffer | null>;
}): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(params.workingBytes);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const scriptFont = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);

  for (const field of params.fields) {
    if (!field.value) continue;
    const pageIndex = field.page - 1;
    if (pageIndex < 0 || pageIndex >= pdfDoc.getPageCount()) continue;
    const page = pdfDoc.getPage(pageIndex);
    const { width, height } = page.getSize();

    const boxX = field.position.x * width;
    const boxTopY = height - field.position.y * height;
    const boxW = field.position.w * width;
    const boxH = field.position.h * height;
    const boxBottomY = boxTopY - boxH;

    if (field.field_type === "signature" && field.signature_type !== "typed") {
      // Drawn (canvas PNG) or uploaded (image) signature -- image bytes
      // live in storage; the caller resolves the path to bytes.
      const bytes = await params.loadSignatureImage(field.value);
      if (bytes) {
        try {
          const png = await pdfDoc.embedPng(bytes);
          const scale = Math.min(boxW / png.width, boxH / png.height, 1);
          const drawW = png.width * scale;
          const drawH = png.height * scale;
          page.drawImage(png, {
            x: boxX + (boxW - drawW) / 2,
            y: boxBottomY + (boxH - drawH) / 2,
            width: drawW,
            height: drawH,
          });
        } catch {
          // Fall through to a text render of nothing rather than fail the
          // whole document -- an unreadable image should never abort
          // completion for every other signer's work.
        }
      }
      continue;
    }

    // Typed signature, or a plain text field (date/name/location).
    const font = field.field_type === "signature" ? scriptFont : regularFont;
    const fontSize = Math.min(boxH * 0.55, 16);
    const safeValue = sanitizeForPdfText(field.value);
    const text = safeValue.length > 60 ? safeValue.slice(0, 57) + "..." : safeValue;
    page.drawText(text, {
      x: boxX + 4,
      y: boxBottomY + Math.max((boxH - fontSize) / 2, 2),
      size: fontSize,
      font,
      color: rgb(0.08, 0.08, 0.1),
    });
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
