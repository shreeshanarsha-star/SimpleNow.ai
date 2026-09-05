import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { toolPauseKey, GUEST_TRIAL_ENABLED_KEY, getAllSettings, setBooleanSetting } from "@/lib/platformSettings";
import { logAdminActivity } from "@/lib/adminActivityLog";
import { DEPARTMENTS } from "@/lib/departments";

// Owner-only kill switches: pause any live tool site-wide, or pause new
// guest-trial sign-ups, without a redeploy. GET returns the current state
// of every switch; PATCH flips one.

// Tools gated by requireFeatureAccess() plus JD Studio.ai (gated inline,
// see its own routes) -- these are the ones a pause toggle actually does
// something for. Free/bundled tools (Team Chat, Personal Tools, etc.)
// aren't listed since pausing them wouldn't be wired to anything.
const PAUSABLE_TOOLS = DEPARTMENTS.flatMap((d) => d.tools)
  .filter((t) => t.s === "live" && !t.bundled)
  .map((t) => t.n)
  .filter((n) => n !== "Job Board (public)"); // public listing page, not itself a gated action

export async function GET() {
  try {
    await requireAdminUser();
  } catch (res) {
    return res as Response;
  }
  const admin = createAdminClient();
  const settings = await getAllSettings(admin);

  const tools = PAUSABLE_TOOLS.map((name) => ({
    name,
    paused: settings[toolPauseKey(name)] === true,
  }));

  const guestTrialEnabled = settings[GUEST_TRIAL_ENABLED_KEY] !== false;

  return NextResponse.json({ tools, guestTrialEnabled });
}

export async function PATCH(req: Request) {
  let user;
  try {
    ({ user } = await requireAdminUser());
  } catch (res) {
    return res as Response;
  }

  const body = await req.json().catch(() => null);
  const admin = createAdminClient();

  if (body?.action === "pause_tool" || body?.action === "unpause_tool") {
    const tool = typeof body.tool === "string" ? body.tool : "";
    if (!tool) return NextResponse.json({ error: "tool is required." }, { status: 400 });
    const paused = body.action === "pause_tool";
    await setBooleanSetting(admin, toolPauseKey(tool), paused, user.id);
    await logAdminActivity(admin, {
      actorId: user.id,
      actorEmail: user.email,
      action: paused ? "pause_tool" : "unpause_tool",
      targetType: "tool",
      targetId: tool,
      targetLabel: tool,
    });
    return NextResponse.json({ ok: true });
  }

  if (body?.action === "set_guest_trial_enabled") {
    const enabled = !!body.enabled;
    await setBooleanSetting(admin, GUEST_TRIAL_ENABLED_KEY, enabled, user.id);
    await logAdminActivity(admin, {
      actorId: user.id,
      actorEmail: user.email,
      action: enabled ? "enable_guest_trial" : "disable_guest_trial",
      targetType: "platform",
      targetId: GUEST_TRIAL_ENABLED_KEY,
      targetLabel: "Guest trial (no-signup access)",
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
