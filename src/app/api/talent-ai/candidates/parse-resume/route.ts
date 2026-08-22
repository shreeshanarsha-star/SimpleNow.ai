import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";

const FEATURE_KEY = "Talent.ai";
const MAX_BYTES = 8 * 1024 * 1024; // 8MB

// Same pattern as requisitions/parse-jd: drag/drop or browse a resume file
// (.pdf, .docx, .txt), extract its text server-side, hand the text back to
// the client. The client then feeds that text into the existing
// resumeText + autoParse path on POST /api/talent-ai/candidates, which
// already does the AI extraction into name/email/phone/fit note -- this
// route only replaces "paste the text yourself" with a real upload.
export async function POST(req: Request) {
  try {
    await requireFeatureAccess(FEATURE_KEY);
  } catch (res) {
    return res as Response;
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const file = form.get("file") as File | null;
  if (!file || file.size === 0) {
    return NextResponse.json({ error: "Attach a resume file." }, { status: 400 });
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
      { error: "Couldn't read that file. Try a .pdf, .docx, or .txt, or paste the resume text instead." },
      { status: 400 }
    );
  }

  text = text.trim();
  if (!text) {
    return NextResponse.json(
      { error: "Couldn't find any text in that file. Try pasting the resume text instead." },
      { status: 400 }
    );
  }
  if (text.length > 40_000) text = text.slice(0, 40_000);

  return NextResponse.json({ text, fileName: file.name });
}
