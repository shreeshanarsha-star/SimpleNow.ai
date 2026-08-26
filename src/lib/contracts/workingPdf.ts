// Builds the PDF the signer actually reviews and signs ("the working
// document"). If the original upload is already a PDF, it's used as-is
// (never mutated -- the original stays untouched in storage; this
// operates on a fresh in-memory copy). If it's a DOC/DOCX, there's no
// lightweight pure-JS Office->PDF converter available in this stack, so
// the extracted text is rendered into a clean generated PDF -- an
// explicit, documented simplification, not a silent one.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const PAGE_WIDTH = 612; // US Letter, points
const PAGE_HEIGHT = 792;
const MARGIN = 56;

// pdf-lib's standard fonts (Helvetica etc.) use WinAnsi (cp1252) encoding,
// which only covers a specific character set. Real-world DOCX/DOC text
// routinely contains characters outside it -- Word bullet lists exported
// via Symbol/Wingdings fonts land as Private Use Area glyphs like U+F0B7,
// plus smart quotes, en/em dashes, ellipses, etc. Left unsanitized, any of
// these crashes drawText with "WinAnsi cannot encode ...". This maps the
// common cases to a safe equivalent and falls back to "?" for anything
// else outside WinAnsi's range, so a single odd character never fails an
// entire document.
const WINANSI_SUBSTITUTIONS: Record<string, string> = {
  "\u2018": "'", "\u2019": "'", "\u201A": ",", "\u201B": "'",
  "\u201C": '"', "\u201D": '"', "\u201E": '"',
  "\u2013": "-", "\u2014": "-", "\u2212": "-",
  "\u2026": "...", "\u00A0": " ",
  "\u2022": "-", "\u25CF": "-", "\u25AA": "-", "\u25E6": "-",
  "\uF0B7": "-", "\uF0A7": "-", "\uF0D8": "-", "\uF0FC": "v",
  "\uF0E0": "->", "\uF0AE": "->",
};

export function sanitizeForPdfText(text: string): string {
  let out = "";
  for (const ch of text) {
    const mapped = WINANSI_SUBSTITUTIONS[ch];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    // WinAnsi reliably covers ASCII 0x20-0x7E and Latin-1 0xA0-0xFF; the
    // 0x80-0x9F block (smart punctuation etc.) is handled by the map above.
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || ch === "\n" || ch === "\t") {
      out += ch;
    } else {
      out += "?";
    }
  }
  return out;
}

// One entry per non-blank source paragraph in a generated (DOCX/DOC)
// working PDF: exactly where that paragraph landed once wrapped and
// paginated. This is what lets field detection point at the real
// generated page/position for a DOCX signature block, instead of only
// ever being able to do that for a genuine source PDF.
export interface ParagraphLocation {
  offset: number; // character offset of this paragraph's start in fullText
  page: number; // 0-indexed
  yFraction: number; // 0..1 from the top of the page, where this paragraph starts
  text: string; // short excerpt, for the AI page-classifier fallback
}

export async function loadOrBuildWorkingPdf(params: {
  originalBytes: Buffer;
  sourceKind: "pdf" | "docx" | "doc" | "unknown";
  fullText: string;
  documentName: string;
}): Promise<{ pdfDoc: PDFDocument; generatedFromText: boolean; paragraphMap: ParagraphLocation[] }> {
  if (params.sourceKind === "pdf") {
    const pdfDoc = await PDFDocument.load(params.originalBytes);
    return { pdfDoc, generatedFromText: false, paragraphMap: [] };
  }

  // docx / doc / unknown -- render the extracted text into a new PDF.
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontSize = 10.5;
  const lineHeight = 14;
  const maxLineWidth = PAGE_WIDTH - MARGIN * 2;

  const text = sanitizeForPdfText(params.fullText || "(No readable text was found in the uploaded file.)");
  const paragraphs = text.split(/\r?\n/);
  const paragraphMap: ParagraphLocation[] = [];
  let runningOffset = 0;

  const safeDocumentName = sanitizeForPdfText(params.documentName);
  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawHeader(page, boldFont, safeDocumentName);
  let cursorY = PAGE_HEIGHT - MARGIN - 30;

  for (const paragraph of paragraphs) {
    const isBlank = paragraph.trim() === "";
    const lines = isBlank ? [""] : wrapLine(paragraph, font, fontSize, maxLineWidth);
    let firstLineOfParagraph = true;

    for (const line of lines) {
      if (cursorY < MARGIN) {
        page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        drawHeader(page, boldFont, safeDocumentName);
        cursorY = PAGE_HEIGHT - MARGIN - 30;
      }
      if (firstLineOfParagraph && !isBlank) {
        paragraphMap.push({
          offset: runningOffset,
          page: pdfDoc.getPageCount() - 1,
          yFraction: (PAGE_HEIGHT - cursorY) / PAGE_HEIGHT,
          text: paragraph.slice(0, 200),
        });
        firstLineOfParagraph = false;
      }
      if (line) page.drawText(line, { x: MARGIN, y: cursorY, size: fontSize, font, color: rgb(0.1, 0.1, 0.12) });
      cursorY -= lineHeight;
    }
    runningOffset += paragraph.length + 1; // +1 for the split-out \n
  }

  return { pdfDoc, generatedFromText: true, paragraphMap };
}

function drawHeader(page: PDFPage, boldFont: PDFFont, documentName: string) {
  page.drawText(documentName, {
    x: MARGIN,
    y: PAGE_HEIGHT - MARGIN,
    size: 12,
    font: boldFont,
    color: rgb(0.05, 0.05, 0.08),
  });
}

function wrapLine(paragraph: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = [];
  const words = paragraph.split(/\s+/).filter(Boolean);
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, fontSize) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function pageDimensions(pdfDoc: PDFDocument, pageIndex: number): { width: number; height: number } {
  const page = pdfDoc.getPage(pageIndex);
  const { width, height } = page.getSize();
  return { width, height };
}
