// Turns an uploaded PDF/DOC/DOCX into plain text -- same extraction
// approach as smart-source's extract-jd-text and talent-ai's parse-resume
// routes (pdf-parse / mammoth), reused rather than duplicated where
// possible. The one addition here is per-page text for PDFs, needed so
// field detection can point at a real page number instead of guessing.

export interface ExtractedDocument {
  fullText: string;
  pages: string[]; // one entry per PDF page; length 1 (whole doc) for docx/doc
  sourceKind: "pdf" | "docx" | "doc" | "unknown";
}

export async function extractDocumentText(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<ExtractedDocument> {
  const lowerName = fileName.toLowerCase();

  if (mimeType === "application/pdf" || lowerName.endsWith(".pdf")) {
    const pdfParse = (await import("pdf-parse")).default;
    const pages: string[] = [];
    // pdf-parse's pagerender hook fires once per page during parsing --
    // capturing each page's text here is the only way to get real page
    // numbers out of it (its default output is one flattened string).
    await pdfParse(buffer, {
      pagerender: async (pageData: {
        getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
      }) => {
        const content = await pageData.getTextContent();
        const text = content.items.map((item) => item.str || "").join(" ");
        pages.push(text);
        return text;
      },
    });
    return {
      fullText: pages.join("\n\n"),
      pages: pages.length ? pages : [""],
      sourceKind: "pdf",
    };
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return { fullText: result.value.trim(), pages: [result.value.trim()], sourceKind: "docx" };
  }

  if (mimeType === "application/msword" || lowerName.endsWith(".doc")) {
    // Legacy .doc (pre-2007 binary format) has no small pure-JS reader in
    // this stack. Best-effort: strip binary noise and keep readable ASCII
    // runs so the AI step still has *something* to work with; the
    // signature-page fallback in fieldDetection.ts covers the rest.
    const ascii = buffer
      .toString("latin1")
      .replace(/[^\x20-\x7E\n]/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    return { fullText: ascii, pages: [ascii], sourceKind: "doc" };
  }

  return { fullText: "", pages: [""], sourceKind: "unknown" };
}
