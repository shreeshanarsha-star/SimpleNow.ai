import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { fromMinor } from "../money";
import { SIG_HEIGHT, SIG_WIDTH } from "./signature";

// Server-side invoice PDF (A4) with pdf-lib standard fonts. Standard fonts
// only cover WinAnsi, so every string goes through safeText().

export interface InvoicePdfInput {
  brandName: string;
  number: string;
  issuedOn: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  status: string;
  from: { name: string; email: string; country: string; designation: string | null };
  billTo: { name: string };
  lines: { description: string; quantity: string; unit_minor: number; amount_minor: number; kind: string }[];
  subtotalMinor: number;
  expensesMinor: number;
  totalMinor: number;
  signaturePath: string | null;
  signedAt: string | null;
}

const TRANSLIT: Record<string, string> = { "\u0141": "L", "\u0142": "l", "\u0131": "i", "\u0110": "D", "\u0111": "d", "\u20b9": "INR " };

export function safeText(font: PDFFont, s: string): string {
  const stripped = s
    .replace(/[\u0141\u0142\u0131\u0110\u0111\u20b9]/g, (c) => TRANSLIT[c] ?? c)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  let out = "";
  for (const ch of stripped) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

export function pdfMoney(minor: number, currency: string): string {
  const [whole, frac] = fromMinor(minor, currency).split(".");
  const neg = whole.startsWith("-");
  const digits = neg ? whole.slice(1) : whole;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${grouped}${frac ? `.${frac}` : ""}`;
}

export function fit(font: PDFFont, text: string, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > maxWidth) t = t.slice(0, -1);
  return `${t}...`;
}

export async function renderInvoicePdf(inv: InvoicePdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Invoice ${inv.number}`);
  doc.setProducer(inv.brandName);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.13, 0.12, 0.1);
  const muted = rgb(0.45, 0.43, 0.38);
  const brand = rgb(0.13, 0.42, 0.27);
  const W = 595.28;
  const H = 841.89;
  const M = 48;

  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;

  const text = (s: string, x: number, yy: number, size = 10, f: PDFFont = font, color = ink) =>
    page.drawText(safeText(f, s), { x, y: yy, size, font: f, color });
  const right = (s: string, xr: number, yy: number, size = 10, f: PDFFont = font, color = ink) => {
    const t = safeText(f, s);
    page.drawText(t, { x: xr - f.widthOfTextAtSize(t, size), y: yy, size, font: f, color });
  };

  text(inv.brandName, M, y, 11, bold, brand);
  right("INVOICE", W - M, y - 4, 20, bold);
  y -= 26;
  right(inv.number, W - M, y, 11, bold);
  y -= 15;
  right(`Issued ${inv.issuedOn}`, W - M, y, 9, font, muted);
  y -= 13;
  right(`Period ${inv.periodStart} to ${inv.periodEnd}`, W - M, y, 9, font, muted);
  if (inv.status === "draft") {
    y -= 13;
    right("DRAFT - not submitted", W - M, y, 9, bold, rgb(0.7, 0.35, 0.1));
  }

  let ly = H - M - 40;
  text("From", M, ly, 8, bold, muted);
  ly -= 14;
  text(inv.from.name, M, ly, 11, bold);
  ly -= 13;
  if (inv.from.designation) {
    text(inv.from.designation, M, ly, 9, font, muted);
    ly -= 12;
  }
  text(inv.from.email, M, ly, 9, font, muted);
  ly -= 12;
  text(`Country: ${inv.from.country}`, M, ly, 9, font, muted);
  ly -= 22;
  text("Bill to", M, ly, 8, bold, muted);
  ly -= 14;
  text(inv.billTo.name, M, ly, 11, bold);

  y = Math.min(y, ly) - 32;

  // Right edges of the numeric columns.
  const cols = { desc: M, qty: 350, unit: 450, amt: W - M };
  const header = () => {
    page.drawRectangle({ x: M - 6, y: y - 6, width: W - 2 * M + 12, height: 20, color: rgb(0.94, 0.96, 0.94) });
    text("Description", cols.desc, y, 8.5, bold, muted);
    right("Qty", cols.qty, y, 8.5, bold, muted);
    right("Unit", cols.unit, y, 8.5, bold, muted);
    right(`Amount (${inv.currency})`, cols.amt, y, 8.5, bold, muted);
    y -= 22;
  };
  header();

  for (const l of inv.lines) {
    if (y < M + 160) {
      page = doc.addPage([W, H]);
      y = H - M;
      header();
    }
    text(fit(font, safeText(font, l.description), 9.5, cols.qty - cols.desc - 50), cols.desc, y, 9.5);
    right(l.quantity, cols.qty, y, 9.5);
    right(pdfMoney(l.unit_minor, inv.currency), cols.unit, y, 9.5);
    right(pdfMoney(l.amount_minor, inv.currency), cols.amt, y, 9.5, l.amount_minor < 0 ? bold : font);
    y -= 6;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.4, color: rgb(0.88, 0.88, 0.85) });
    y -= 13;
  }

  y -= 6;
  const totalRow = (label: string, minor: number, strong = false) => {
    right(label, cols.unit - 10, y, strong ? 11 : 9.5, strong ? bold : font, strong ? ink : muted);
    right(`${pdfMoney(minor, inv.currency)} ${inv.currency}`, cols.amt, y, strong ? 11 : 9.5, strong ? bold : font);
    y -= strong ? 18 : 15;
  };
  totalRow("Fees", inv.subtotalMinor);
  totalRow("Expenses", inv.expensesMinor);
  totalRow("Total due", inv.totalMinor, true);

  // Signature block.
  y -= 20;
  if (y < M + 100) {
    page = doc.addPage([W, H]);
    y = H - M - 20;
  }
  text("Signature", M, y, 8, bold, muted);
  const boxW = 200;
  const scale = boxW / SIG_WIDTH;
  const boxH = SIG_HEIGHT * scale;
  const top = y - 6;
  if (inv.signaturePath) {
    page.drawSvgPath(inv.signaturePath, { x: M, y: top, scale, borderColor: ink, borderWidth: 1.6 / scale });
  }
  page.drawLine({ start: { x: M, y: top - boxH - 2 }, end: { x: M + boxW, y: top - boxH - 2 }, thickness: 0.6, color: muted });
  text(inv.from.name, M, top - boxH - 14, 9);
  text(inv.signedAt ? `Signed ${inv.signedAt.slice(0, 10)}` : "Not signed yet", M, top - boxH - 26, 8, font, muted);

  return doc.save();
}
