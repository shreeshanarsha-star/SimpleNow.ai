import AppShell from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import JdStudioApp from "@/components/tools/JdStudioApp";
import { checkGuestGate, type GuestGateResult } from "@/lib/guestAccess";
import { isGuestTrialEnabled } from "@/lib/platformSettings";

const TOOL_KEY = "JD Studio.ai";

// JD Studio.ai -- a Personal Tool, same "requireUser() only, owner_id
// alone" rule as Jotz / Shortlist.ai / Contracts & eSign -- with one
// addition: it's also the pilot for the no-signup guest trial. Anyone
// hitting this route with no session gets signed in anonymously by
// middleware.ts before this ever runs, so `user` below is essentially
// always present now; the real gating (3-day window / 5-action cap /
// credits once signed up) happens per-action in the API routes, using
// checkGuestGate() from lib/guestAccess.ts. This page just resolves the
// guest's current standing once, up front, so the UI can show it.
export default async function JdStudioPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AppShell title="JD Studio.ai">
        <div className="border border-dashed border-border rounded-md px-4 py-6 text-center text-[13px] text-ink-muted">
          Sign in first.
        </div>
      </AppShell>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, is_admin, is_anonymous, credits, guest_tool_usage, created_at")
    .eq("id", user.id)
    .single();

  let guestStatus: GuestGateResult | null = null;
  if (profile) {
    const guestTrialEnabled = await isGuestTrialEnabled(supabase);
    guestStatus = checkGuestGate(
      {
        org_id: profile.org_id,
        is_admin: !!profile.is_admin,
        is_anonymous: profile.is_anonymous,
        credits: profile.credits,
        guest_tool_usage: profile.guest_tool_usage as Record<string, number> | null,
        created_at: profile.created_at,
      },
      TOOL_KEY,
      guestTrialEnabled
    );
  }

  return (
    <AppShell title="JD Studio.ai">
      <JdStudioApp guestStatus={guestStatus} />
    </AppShell>
  );
}
