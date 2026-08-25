import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";

const FEATURE_KEY = "Smart Source.ai";
const MAX_BYTES = 8 * 1024 * 1024; // 8MB

// Drag-and-drop JD upload for Smart Source.ai: turns a PDF/DOCX/TXT file
// into plain text, same extraction approach as Talent.ai's requisition JD
// upload (parse-jd route). Deliberately stops at raw text -- Smart
// Source.ai's own extractSearchCriteria() already turns JD text into
// search criteria, so no separate AI parsing step is needed here.
export async function POST(request: Request) {
  try {
    await requireFeatureAccess(FEATURE_KEY);
  } catch (res) {
    return res as Response;
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file") as File | null;
  if (!file || file.size === 0) {
    return NextResponse.json({ error: "Attach a JD file." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That file is too large (max 8MB)." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  let text = "";

  try {
    if (name.endsWith(".pdf") || file.type === "application/pdf") {
      const pdfParse = (await import("pdf-parse")).default;
      const parsed = await pdfParse(buffer);
      text = parsed.text;
    } else if (name.endsWith(".docx")) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else {
      text = buffer.toString("utf-8");
    }
  } catch {
    return NextResponse.json(
      { error: "Couldn't read that file. Try a .pdf, .docx, or .txt, or paste the JD text instead." },
      { status: 400 }
    );
  }

  text = text.trim();
  if (!text) {
    return NextResponse.json(
      { error: "Couldn't find any text in that file. Try pasting the JD text instead." },
      { status: 400 }
    );
  }
  if (text.length > 40_000) text = text.slice(0, 40_000);

  return NextResponse.json({ text, fileName: file.name });
}
