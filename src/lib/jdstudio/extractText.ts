// Turns an uploaded file into plain text (for AI classification) plus, for
// spreadsheet-like files, a row-oriented table (for direct extraction
// without round-tripping through prose). Extends the pdf/docx approach in
// src/lib/contracts/textExtract.ts with xlsx/csv/txt support.

export interface ExtractedFile {
  fullText: string;
  table: Record<string, string>[] | null; // rows with header-derived keys, spreadsheets only
  sourceKind: "pdf" | "docx" | "doc" | "xlsx" | "csv" | "txt" | "unknown";
}

export async function extractFileText(buffer: Buffer, fileName: string, mimeType: string): Promise<ExtractedFile> {
  const lowerName = fileName.toLowerCase();

  if (mimeType === "application/pdf" || lowerName.endsWith(".pdf")) {
    const pdfParse = (await import("pdf-parse")).default;
    const result = await pdfParse(buffer);
    return { fullText: result.text.trim(), table: null, sourceKind: "pdf" };
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return { fullText: result.value.trim(), table: null, sourceKind: "docx" };
  }

  if (
    mimeType === "application/vnd.ms-excel" ||
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    lowerName.endsWith(".xlsx") ||
    lowerName.endsWith(".xls")
  ) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, unknown>[];
    const table = rows.map((r) => {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(r)) out[k] = String(v ?? "").trim();
      return out;
    });
    const fullText = table
      .slice(0, 200)
      .map((r) => Object.entries(r).map(([k, v]) => `${k}: ${v}`).join(", "))
      .join("\n");
    return { fullText, table, sourceKind: "xlsx" };
  }

  if (mimeType === "text/csv" || lowerName.endsWith(".csv")) {
    const XLSX = await import("xlsx");
    const text = buffer.toString("utf-8");
    const wb = XLSX.read(text, { type: "string" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, unknown>[];
    const table = rows.map((r) => {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(r)) out[k] = String(v ?? "").trim();
      return out;
    });
    const fullText = table
      .slice(0, 200)
      .map((r) => Object.entries(r).map(([k, v]) => `${k}: ${v}`).join(", "))
      .join("\n");
    return { fullText, table, sourceKind: "csv" };
  }

  if (mimeType === "text/plain" || lowerName.endsWith(".txt")) {
    return { fullText: buffer.toString("utf-8").trim(), table: null, sourceKind: "txt" };
  }

  return { fullText: "", table: null, sourceKind: "unknown" };
}
