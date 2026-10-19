// SimVieo -- server-only cost controls. No login is required for SimVieo, so
// limits are keyed on a salted hash of the caller's IP (never the raw IP),
// plus the Supabase user id when one exists. A global daily budget is the
// hard stop: past it, planning silently falls back to the free template
// planner and voiceover is refused, so OpenAI spend can never run away.
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export type UsageKind = "plan" | "scene" | "voice";

const LIMITS: Record<UsageKind, number> = {
  plan: Number(process.env.SIMVIEO_PLANS_PER_DAY || 20),
  scene: Number(process.env.SIMVIEO_SCENES_PER_DAY || 40),
  voice: Number(process.env.SIMVIEO_VOICES_PER_DAY || 15),
};
export const DAILY_BUDGET_INR = Number(process.env.SIMVIEO_DAILY_BUDGET_INR || 300);

// Fallback limiter for when the DB is unreachable (e.g. preview deploys
// without the service-role key). Per-instance only -- deliberately strict.
const mem = new Map<string, number[]>();

export function callerKey(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
  const salt = process.env.SUPABASE_JWT_SECRET || process.env.OPENAI_API_KEY?.slice(-12) || "simvieo";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

export interface UsageCheck {
  allowed: boolean;
  overBudget: boolean;
  reason?: string;
}

export async function checkUsage(ipHash: string, kind: UsageKind): Promise<UsageCheck> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  try {
    const admin = createAdminClient();
    const [{ count, error: e1 }, { data: spend, error: e2 }] = await Promise.all([
      admin
        .from("simvieo_usage")
        .select("id", { count: "exact", head: true })
        .eq("ip_hash", ipHash)
        .eq("kind", kind)
        .gte("created_at", since),
      admin.rpc("simvieo_spend_today"),
    ]);
    if (e1 || e2) throw e1 || e2;
    const overBudget = Number(spend || 0) >= DAILY_BUDGET_INR;
    if ((count || 0) >= LIMITS[kind]) {
      return { allowed: false, overBudget, reason: "daily_limit" };
    }
    return { allowed: true, overBudget };
  } catch {
    const k = `${ipHash}:${kind}`;
    const now = Date.now();
    const hits = (mem.get(k) || []).filter((t) => now - t < 24 * 3600 * 1000);
    mem.set(k, hits);
    if (hits.length >= Math.ceil(LIMITS[kind] / 2)) return { allowed: false, overBudget: false, reason: "daily_limit" };
    return { allowed: true, overBudget: false };
  }
}

export async function recordUsage(
  ipHash: string,
  userId: string | null,
  kind: UsageKind,
  costInr: number,
  source: string
) {
  const k = `${ipHash}:${kind}`;
  mem.set(k, [...(mem.get(k) || []), Date.now()]);
  try {
    const admin = createAdminClient();
    await admin.from("simvieo_usage").insert({
      ip_hash: ipHash,
      user_id: userId,
      kind,
      cost_inr: Math.round(costInr * 10000) / 10000,
      source,
    });
  } catch {
    // Best-effort: never fail a user's request because logging failed.
  }
}

export function limitMessage(kind: UsageKind) {
  return kind === "voice"
    ? "You've reached today's free voiceover limit. Your video still works with captions and music -- try voiceover again tomorrow."
    : "You've reached today's free limit for AI planning. You can still edit and download your current video, or try again tomorrow.";
}
