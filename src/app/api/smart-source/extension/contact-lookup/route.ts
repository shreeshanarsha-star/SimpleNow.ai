import { NextResponse } from "next/server";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";
import { findPublicContact } from "@/lib/publicContactLookup";

const FEATURE_KEY = "Smart Source.ai";
// Re-searching for the same profile within this window just re-spends
// SerpApi/model calls for the same answer -- reuse whatever we already
// found (or already confirmed we couldn't find) on the candidate record.
const CACHE_WINDOW_DAYS = 30;

// Called by the Smart Source Chrome extension popup right after a LinkedIn
// profile is detected, in parallel with the duplicate check -- looks for a
// publicly-visible email/phone for that person so the recruiter can see it
// before deciding whether to add them, and so it can be saved onto the
// candidate record when they do.
export async function GET(request: Request) {
  let supabase;
  try {
    ({ supabase } = await requireFeatureAccess(FEATURE_KEY));
  } catch (res) {
    return res as Response;
  }

  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name");
  const company = searchParams.get("company");
  const profileUrl = searchParams.get("profile_url");

  if (!name) {
    return NextResponse.json({ error: "name is required." }, { status: 400 });
  }

  // Reuse a recent lookup already stored against this exact profile, if any.
  if (profileUrl) {
    const since = new Date(Date.now() - CACHE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await supabase
      .from("smart_source_candidates")
      .select("public_email, public_phone, contact_source_url, contact_checked_at")
      .eq("profile_url", profileUrl)
      .not("contact_checked_at", "is", null)
      .gte("contact_checked_at", since)
      .order("contact_checked_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        ok: true,
        email: existing.public_email,
        phone: existing.public_phone,
        source_url: existing.contact_source_url,
        cached: true,
      });
    }
  }

  const result = await findPublicContact({ name, company, profileUrl });
  return NextResponse.json({ ok: true, ...result, cached: false });
}
