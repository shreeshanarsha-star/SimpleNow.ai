import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// OAuth (Google) redirects here with a ?code= after the provider screen.
// Exchange it for a session, then send the person somewhere sensible:
// straight to Overview if they already belong to an organization, or to
// a one-field "create your organization" prompt if this is their first
// time (email/password signup collects the org name up front in the form
// itself; OAuth has no form step, so it's collected after the redirect
// instead).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Password-recovery links reuse this same exchange step, then need to
  // land on the "set a new password" screen instead of the normal
  // role-based routing below.
  const next = searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    const { error, data } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      if (next) return NextResponse.redirect(`${origin}${next}`);

      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin, org_id")
        .eq("id", data.user.id)
        .maybeSingle();

      if (profile?.is_admin) return NextResponse.redirect(`${origin}/admin`);
      if (!profile?.org_id) return NextResponse.redirect(`${origin}/onboarding/organization`);
      return NextResponse.redirect(`${origin}/`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
}
