import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";
import { extractDocumentText } from "@/lib/contracts/textExtract";
import { structureJD } from "@/lib/jobPostings/structure";

const FEATURE_KEY = "Job Postings.ai";
export const maxDuration = 60;

const MAX_FILES = 10;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

// Org-gated equivalent of the public /api/public/job-postings/analyze --
// same AI structuring, just behind sign-in + feature access instead of
// the IP-based free quota.
export async function POST(request: Request) {
  try {
    await requireFeatureAccess(FEATURE_KEY);
  } catch (res) {
    return res as Response;
  }

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: "Attach at least one job description." }, { status: 400 });
  if (files.length > MAX_FILES) return NextResponse.json({ error: `Up to ${MAX_FILES} files at a time.` }, { status: 400 });

  const drafts = [];
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      drafts.push({ fileName: file.name, error: "File is over 5MB." });
      continue;
    }
    if (!ALLOWED_TYPES.includes(file.type) && !/\.(pdf|doc|docx)$/i.test(file.name)) {
      drafts.push({ fileName: file.name, error: "Must be a PDF or Word document." });
      continue;
    }
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const { fullText } = await extractDocumentText(buffer, file.name, file.type);
      if (!fullText || fullText.trim().length < 30) {
        drafts.push({ fileName: file.name, error: "Couldn't read any text from this file." });
        continue;
      }
      const structured = await structureJD(fullText);
      drafts.push({ fileName: file.name, rawJdText: fullText, ...structured });
    } catch (err) {
      drafts.push({ fileName: file.name, error: err instanceof Error ? err.message : "Couldn't analyze this file." });
    }
  }

  return NextResponse.json({ drafts });
}
