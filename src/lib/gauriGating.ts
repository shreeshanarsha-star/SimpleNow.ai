import { createAdminClient } from "@/lib/supabase/admin";

// Same 3-free-then-log-in pattern as other usage-gated tools on the site.
// Ported verbatim from askshree-app (v1)'s lib/gauriGating.js. Not
// currently wired to the farmer-facing avatar (that's fully public/free —
// gating farmers was never the point), but kept for parity since the
// ported /api/gauri/transcribe and any future recruiter-facing use may
// still need it.
const FREE_USES = 3;

export async function checkAndRecordGauriUsage(ip: string, userId: string | null = null) {
  if (userId) return { allowed: true, status: "authenticated" as const };
  const db = createAdminClient();
  const { data: row } = await db
    .from("gauri_usage")
    .select("*")
    .eq("ip_address", ip)
    .maybeSingle();

  if (!row) {
    await db.from("gauri_usage").insert({
      ip_address: ip,
      use_count: 1,
      status: "free",
      last_used_at: new Date().toISOString(),
    });
    return { allowed: true, status: "free" as const };
  }

  if (row.status === "whitelisted") return { allowed: true, status: "whitelisted" as const };

  if (row.status === "locked") {
    return {
      allowed: false,
      status: "locked" as const,
      message: "You’ve used your 3 free Gauri.ai requests. Log in to keep going.",
    };
  }

  const newCount = row.use_count + 1;
  const status = newCount >= FREE_USES ? "locked" : "free";
  await db
    .from("gauri_usage")
    .update({ use_count: newCount, status, last_used_at: new Date().toISOString() })
    .eq("ip_address", ip);

  return { allowed: true, status: status as "free" | "locked" };
}
