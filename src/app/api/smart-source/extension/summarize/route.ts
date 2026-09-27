import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";
import { summarizeCandidateProfile } from "@/lib/smartSourceSummary";

const FEATURE_KEY = "Smart Source.ai";

// Stateless variant of the profile-summary endpoint for the Chrome
// extension: called while looking at a LinkedIn profile, before the
// candidate has necessarily been added anywhere (so there's no candidate
// row / id yet to read from or write to). Takes the scraped profile
// fields directly and returns the 5 lines without touching the database
// -- if the recruiter then clicks Add, the extension includes the summary
// text in that payload and it's saved the normal way, same as any other
// field on the form.
export async function POST(request: Request) {
  try {
    await requireFeatureAccess(FEATURE_KEY);
  } catch (res) {
    return res as Response;
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { name, designation, company, location, experience_years, qualification, raw_text } = body as Record<string, unknown>;

  let lines: string[];
  let structured: Awaited<ReturnType<typeof summarizeCandidateProfile>>["structured"] = null;
  try {
    ({ lines, structured } = await summarizeCandidateProfile({
      name: typeof name === "string" ? name : null,
      designation: typeof designation === "string" ? designation : null,
      company: typeof company === "string" ? company : null,
      location: typeof location === "string" ? location : null,
      experience_years: typeof experience_years === "number" ? experience_years : null,
      qualification: typeof qualification === "string" ? qualification : null,
      raw_text: typeof raw_text === "string" ? raw_text : null,
    }));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't generate a summary." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, lines, structured });
}
