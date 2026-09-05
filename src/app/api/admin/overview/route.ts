import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { GUEST_TRIAL_DAYS, GUEST_ACTIONS_PER_TOOL } from "@/lib/guestAccess";
import { getAllSettings, toolPauseKey, GUEST_TRIAL_ENABLED_KEY } from "@/lib/platformSettings";
import { DEPARTMENTS } from "@/lib/departments";

const PAUSABLE_TOOLS = DEPARTMENTS.flatMap((d) => d.tools)
  .filter((t) => t.s === "live" && !t.bundled)
  .map((t) => t.n)
  .filter((n) => n !== "Job Board (public)");

export async function GET() {
  try {
    await requireAdminUser();
  } catch (res) {
    return res as Response;
  }
  const admin = createAdminClient();

  const [
    { count: orgTotal },
    { count: orgPending },
    { count: orgApproved },
    { count: orgSuspended },
    { count: userTotal },
    { data: guestProfiles },
    { count: convertedTotal },
    { count: talentReqCount },
    { count: talentCandidateCount },
    { count: jdRequestCount },
    { count: offerCount },
    { count: screenBatchCount },
    { count: sourceSearchCount },
    { count: assessmentCount },
    { data: recentActivity },
    { data: recentEmailFailures },
    { count: emailFailures24h },
    settings,
  ] = await Promise.all([
    admin.from("organizations").select("id", { count: "exact", head: true }),
    admin.from("organizations").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("organizations").select("id", { count: "exact", head: true }).eq("status", "approved"),
    admin.from("organizations").select("id", { count: "exact", head: true }).eq("status", "suspended"),
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin.from("profiles").select("id, created_at, guest_tool_usage").eq("is_anonymous", true),
    admin.from("profiles").select("id", { count: "exact", head: true }).not("converted_at", "is", null),
    admin.from("talent_requisitions").select("id", { count: "exact", head: true }),
    admin.from("talent_candidates").select("id", { count: "exact", head: true }),
    admin.from("jdstudio_requests").select("id", { count: "exact", head: true }),
    admin.from("offers").select("id", { count: "exact", head: true }),
    admin.from("smart_screen_batches").select("id", { count: "exact", head: true }),
    admin.from("smart_source_searches").select("id", { count: "exact", head: true }),
    admin.from("assessment_assignments").select("id", { count: "exact", head: true }),
    admin
      .from("admin_activity_log")
      .select("id, actor_email, action, target_type, target_label, created_at")
      .order("created_at", { ascending: false })
      .limit(8),
    admin
      .from("email_failures")
      .select("id, tool, to_email, error, created_at")
      .order("created_at", { ascending: false })
      .limit(8),
    admin
      .from("email_failures")
      .select("id", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    getAllSettings(admin),
  ]);

  // Guest funnel: for each currently-anonymous profile, work out whether
  // they're still within their trial or have hit the window/cap -- reuses
  // the exact same constants checkGuestGate() uses, just summarized across
  // everyone instead of gating one request.
  let guestActive = 0;
  let guestAtLimit = 0;
  const now = Date.now();
  for (const p of guestProfiles || []) {
    const ageMs = now - new Date(p.created_at).getTime();
    const daysLeft = GUEST_TRIAL_DAYS - ageMs / (24 * 60 * 60 * 1000);
    const usage = (p.guest_tool_usage as Record<string, number> | null) || {};
    const capped = Object.values(usage).some((n) => n >= GUEST_ACTIONS_PER_TOOL);
    if (daysLeft <= 0 || capped) guestAtLimit += 1;
    else guestActive += 1;
  }
  const guestStarted = (guestProfiles || []).length + (convertedTotal || 0);
  const conversionRate = guestStarted > 0 ? Math.round(((convertedTotal || 0) / guestStarted) * 1000) / 10 : 0;

  // Pending-approval aging: anything sitting untouched more than 24h.
  const { data: pendingOrgs } = await admin
    .from("organizations")
    .select("id, name, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  const agingPending = (pendingOrgs || []).filter(
    (o) => now - new Date(o.created_at).getTime() > 24 * 60 * 60 * 1000
  );

  const tools = PAUSABLE_TOOLS.map((name) => ({
    name,
    paused: settings[toolPauseKey(name)] === true,
  }));
  const guestTrialEnabled = settings[GUEST_TRIAL_ENABLED_KEY] !== false;

  return NextResponse.json({
    orgs: { total: orgTotal || 0, pending: orgPending || 0, approved: orgApproved || 0, suspended: orgSuspended || 0 },
    users: { total: userTotal || 0 },
    guestFunnel: {
      started: guestStarted,
      active: guestActive,
      atLimit: guestAtLimit,
      converted: convertedTotal || 0,
      conversionRate,
    },
    toolUsage: {
      "Talent.ai": { requisitions: talentReqCount || 0, candidates: talentCandidateCount || 0 },
      "JD Studio.ai": { requests: jdRequestCount || 0 },
      "Offer.ai": { offers: offerCount || 0 },
      "Smart Screen.ai": { batches: screenBatchCount || 0 },
      "Smart Source.ai": { searches: sourceSearchCount || 0 },
      "Assessment.ai": { assignments: assessmentCount || 0 },
    },
    killSwitches: { tools, guestTrialEnabled },
    alerts: {
      agingPending: agingPending.map((o) => ({ id: o.id, name: o.name, created_at: o.created_at })),
      guestsAtLimit: guestAtLimit,
      emailFailures24h: emailFailures24h || 0,
    },
    recentActivity: recentActivity || [],
    recentEmailFailures: recentEmailFailures || [],
  });
}
