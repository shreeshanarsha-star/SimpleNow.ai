import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";
import { extractDocumentText } from "@/lib/contracts/textExtract";
import { parseJDToRequisition } from "@/lib/talentAI";
import { searchTalentCandidates } from "@/lib/talentCandidateSearch";

const FEATURE_KEY = "Talent.ai";
const MAX_BYTES = 8 * 1024 * 1024; // 8MB, same cap as the requisition JD upload

export const maxDuration = 30;

// Drop/upload a JD straight into the candidate database search: extract
// text, let AI pull out the role title + must-have skills (reusing the
// same parseJDToRequisition() call the requisition intake form uses),
// then run those as search keywords against talent_candidates. One
// upload, results back -- no manual query typing required. The manual
// search box alongside this stays wired to the plain /search route.
export async function POST(request: Request) {
  let supabase;
  try {
    ({ supabase } = await requireFeatureAccess(FEATURE_KEY));
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
  const { fullText } = await extractDocumentText(buffer, file.name, file.type);
  const jdText = fullText.trim();
  if (!jdText || jdText.length < 30) {
    return NextResponse.json(
      { error: "Couldn't read any text from that file. Try a .pdf, .docx, or .txt." },
      { status: 400 }
    );
  }

  let parsed;
  try {
    parsed = await parseJDToRequisition(jdText.length > 40_000 ? jdText.slice(0, 40_000) : jdText);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI keyword extraction failed." },
      { status: 500 }
    );
  }

  const keywords = Array.from(
    new Set(
      [parsed.title, parsed.location, ...(parsed.key_requirements || [])]
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
        .map((v) => v.trim())
    )
  ).slice(0, 12);

  if (keywords.length === 0) {
    return NextResponse.json(
      { error: "Couldn't extract any searchable keywords from that JD." },
      { status: 400 }
    );
  }

  try {
    const candidates = await searchTalentCandidates(supabase, keywords);
    return NextResponse.json({ candidates, keywords, title: parsed.title, fileName: file.name });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Search failed." }, { status: 500 });
  }
}
