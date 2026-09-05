import { SupabaseClient } from "@supabase/supabase-js";

// Guest trial + credits, shared across every tool that opts in (currently
// just JD Studio.ai -- see middleware.ts's GUEST_ACCESSIBLE_PATHS). A guest
// is a real Supabase anonymous-auth user (see middleware.ts), so this file
// only adds the usage-cap/credit rules on top of the existing owner_id/RLS
// plumbing -- nothing about storage paths or table access changes for them.
//
// Three tiers, in order of precedence:
//  1. Real org member (profile.org_id set) -- existing behavior, untouched.
//     No credit gating at all; this file is a no-op for them.
//  2. Anonymous guest (profile.is_anonymous) -- 3-day window OR a per-tool
//     action cap, whichever comes first.
//  3. Signed-up individual, no org yet (profile.org_id null, not
//     anonymous) -- this is who the signup bonus is actually for. Draws
//     down from profile.credits (granted once, on the anonymous->real
//     upgrade -- see the on_auth_user_upgraded DB trigger).

export const GUEST_TRIAL_DAYS = 3;
export const GUEST_ACTIONS_PER_TOOL = 5;
export const SIGNUP_BONUS_CREDITS = 22;

export type GuestGateResult =
  | { allowed: true; tier: "org_member" }
  | { allowed: true; tier: "guest"; actionsUsed: number; actionsRemaining: number; daysRemaining: number }
  | { allowed: true; tier: "credits"; creditsRemaining: number }
  | { allowed: false; reason: "guest_window_expired" | "guest_cap_reached"; daysRemaining: number }
  | { allowed: false; reason: "credits_exhausted" };

interface GateProfile {
  org_id: string | null;
  is_admin: boolean;
  is_anonymous: boolean;
  credits: number;
  guest_tool_usage: Record<string, number> | null;
  created_at: string;
}

function daysRemaining(createdAt: string): number {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const remainingMs = GUEST_TRIAL_DAYS * 24 * 60 * 60 * 1000 - ageMs;
  return Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
}

// Read-only check -- call before doing any real work, then call
// consumeGuestOrCredit() only once the action actually succeeds (so a
// failed upload/AI call doesn't burn part of someone's trial).
export function checkGuestGate(profile: GateProfile, toolKey: string): GuestGateResult {
  // Platform owner -- never subject to the guest trial or credits, same
  // as every other feature gate in the app. Without this, detaching an
  // owner from an org (see the Talent.ai owner/user-separation work)
  // would leave them looking exactly like a credits-tier individual with
  // a zero balance and no way to earn more.
  if (profile.is_admin) return { allowed: true, tier: "org_member" };
  if (profile.org_id) return { allowed: true, tier: "org_member" };

  if (profile.is_anonymous) {
    const remaining = daysRemaining(profile.created_at);
    const used = profile.guest_tool_usage?.[toolKey] ?? 0;
    if (remaining <= 0) return { allowed: false, reason: "guest_window_expired", daysRemaining: 0 };
    if (used >= GUEST_ACTIONS_PER_TOOL) return { allowed: false, reason: "guest_cap_reached", daysRemaining: remaining };
    return {
      allowed: true,
      tier: "guest",
      actionsUsed: used,
      actionsRemaining: GUEST_ACTIONS_PER_TOOL - used,
      daysRemaining: remaining,
    };
  }

  // Signed up, no org -- the credits tier.
  if (profile.credits <= 0) return { allowed: false, reason: "credits_exhausted" };
  return { allowed: true, tier: "credits", creditsRemaining: profile.credits };
}

// Call once the gated action has actually completed successfully. Uses the
// atomic DB functions from the guest-trial migration so concurrent
// requests can't double-spend a guest's last action or credit.
export async function consumeGuestOrCredit(
  admin: SupabaseClient,
  userId: string,
  gate: GuestGateResult,
  toolKey: string
): Promise<void> {
  if (!gate.allowed) return;
  if (gate.tier === "guest") {
    await admin.rpc("increment_guest_tool_usage", { p_user_id: userId, p_tool_key: toolKey });
  } else if (gate.tier === "credits") {
    await admin.rpc("consume_credit", { p_user_id: userId });
  }
}

export function guestGateErrorResponse(gate: Extract<GuestGateResult, { allowed: false }>) {
  const body =
    gate.reason === "credits_exhausted"
      ? {
          error: "You're out of free credits.",
          code: "credits_exhausted",
        }
      : gate.reason === "guest_cap_reached"
        ? {
            error: `You've used your ${GUEST_ACTIONS_PER_TOOL} free tries for this tool. Sign up free to keep going -- you'll get ${SIGNUP_BONUS_CREDITS} credits and your work so far is saved.`,
            code: "guest_cap_reached",
          }
        : {
            error: `Your ${GUEST_TRIAL_DAYS}-day free trial has ended. Sign up free to keep going -- you'll get ${SIGNUP_BONUS_CREDITS} credits and your work so far is saved.`,
            code: "guest_window_expired",
          };
  return new Response(JSON.stringify(body), { status: 402, headers: { "Content-Type": "application/json" } });
}
