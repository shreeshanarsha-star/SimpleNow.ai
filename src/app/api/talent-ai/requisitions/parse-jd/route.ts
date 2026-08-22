import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";
import { parseJDToRequisition } from "@/lib/talentAI";

const FEATURE_KEY = "Talent.ai";
const MAX_BYTES = 8 * 1024 * 1024; // 8MB

// Turns an uploaded JD file (or pasted JD text) into extracted text, then
// into structured requisition fields via AI. This is the "Browse and add
// JD" step on the New Requisition form -- one upload, everything else
// autopopulates and stays fully editable before the user submits.
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

  const pastedText = (form.get("text") as string | null)?.trim();
  const file = form.get("file") as File | null;

  let jdText = "";
  let fileName: string | null = null;

  if (file && file.size > 0) {
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "That file is too large (max 8MB)." }, { status: 400 });
    }
    fileName = file.name;
    const buffer = Buffer.from(await file.arrayBuffer());
    const name = file.name.toLowerCase();

    try {
      if (name.endsWith(".pdf") || file.type === "application/pdf") {
        const pdfParse = (await import("pdf-parse")).default;
        const parsed = await pdfParse(buffer);
        jdText = parsed.text;
      } else if (name.endsWith(".docx")) {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer });
        jdText = result.value;
      } else {
        // .txt or anything else plain-text-ish
        jdText = buffer.toString("utf-8");
      }
    } catch {
      return NextResponse.json(
        { error: "Couldn't read that file. Try a .pdf, .docx, or .txt, or paste the JD text instead." },
        { status: 400 }
      );
    }
  } else if (pastedText) {
    jdText = pastedText;
  } else {
    return NextResponse.json({ error: "Attach a JD file or paste the JD text." }, { status: 400 });
  }

  jdText = jdText.trim();
  if (!jdText) {
    return NextResponse.json(
      { error: "Couldn't find any text in that file. Try pasting the JD text instead." },
      { status: 400 }
    );
  }
  if (jdText.length > 40_000) jdText = jdText.slice(0, 40_000);

  try {
    const parsed = await parseJDToRequisition(jdText);
    return NextResponse.json({ parsed, sourceText: jdText, fileName });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI parsing failed." },
      { status: 500 }
    );
  }
}
