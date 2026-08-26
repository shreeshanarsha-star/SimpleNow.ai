import { createAdminClient } from "@/lib/supabase/admin";

// Separate free-use counter for JOB POSTERS specifically (3 free postings
// per IP address). Ported from the old askshree-app repo's
// lib/jobPostingGating.js. Logged-in posters bypass this entirely.
const FREE_POSTINGS = 3;

// Reads the real client IP from Vercel's forwarded-for header. Never trust
// a client-supplied IP header for this — always the platform's.
export function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

export type PostingUsageResult = {
  allowed: boolean;
  status: "authenticated" | "whitelisted" | "free" | "locked";
  message?: string;
};

export async function checkAndRecordPostingUsage(
  ip: string,
  userId: string | null = null
): Promise<PostingUsageResult> {
  if (userId) return { allowed: true, status: "authenticated" };

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("job_posting_usage")
    .select("*")
    .eq("ip_address", ip)
    .maybeSingle();

  if (!row) {
    await admin.from("job_posting_usage").insert({
      ip_address: ip,
      post_count: 1,
      status: "free",
      last_posted_at: new Date().toISOString(),
    });
    return { allowed: true, status: "free" };
  }

  if (row.status === "whitelisted") return { allowed: true, status: "whitelisted" };

  if (row.status === "locked") {
    return {
      allowed: false,
      status: "locked",
      message: "You've used your 3 free job postings. Sign in to keep posting.",
    };
  }

  const newCount = (row.post_count as number) + 1;
  const status = newCount >= FREE_POSTINGS ? "locked" : "free";
  await admin
    .from("job_posting_usage")
    .update({ post_count: newCount, status, last_posted_at: new Date().toISOString() })
    .eq("ip_address", ip);

  return { allowed: true, status };
}

// Generic per-IP free-use gate for the public Apply.ai flow. Ported from
// the old askshree-app repo's lib/gating.js (shared site-wide there;
// scoped to Apply.ai here). 4 free uses, then a 7-day grace window
// (still usable, just on notice), then locked until the candidate signs
// in. Deliberately separate from checkAndRecordPostingUsage above --
// posting and applying are different actions with different limits.
const FREE_USES = 4;
const GRACE_DAYS = 7;

export type ApplyUsageResult = {
  allowed: boolean;
  status: "authenticated" | "whitelisted" | "free" | "grace" | "locked";
  message?: string;
  graceEndsAt?: string;
};

export async function checkAndRecordApplyUsage(
  ip: string,
  userId: string | null = null
): Promise<ApplyUsageResult> {
  if (userId) return { allowed: true, status: "authenticated" };

  const admin = createAdminClient();
  const { data: row } = await admin.from("apply_usage").select("*").eq("ip_address", ip).maybeSingle();
  const now = new Date();

  if (!row) {
    await admin.from("apply_usage").insert({
      ip_address: ip,
      use_count: 1,
      status: "free",
      last_used_at: now.toISOString(),
    });
    return { allowed: true, status: "free" };
  }

  if (row.status === "whitelisted") return { allowed: true, status: "whitelisted" };

  if (row.status === "locked") {
    return {
      allowed: false,
      status: "locked",
      message: "Your free trial has ended. Sign in to keep using Apply.ai.",
    };
  }

  if (row.status === "grace") {
    const graceEnds = new Date(row.grace_started_at as string);
    graceEnds.setDate(graceEnds.getDate() + GRACE_DAYS);
    if (now > graceEnds) {
      await admin.from("apply_usage").update({ status: "locked" }).eq("ip_address", ip);
      return {
        allowed: false,
        status: "locked",
        message: "Your 7-day grace period has ended. Sign in to continue.",
      };
    }
    await admin
      .from("apply_usage")
      .update({ use_count: (row.use_count as number) + 1, last_used_at: now.toISOString() })
      .eq("ip_address", ip);
    return { allowed: true, status: "grace", graceEndsAt: graceEnds.toISOString() };
  }

  // status === "free"
  const newCount = (row.use_count as number) + 1;
  if (newCount >= FREE_USES) {
    await admin
      .from("apply_usage")
      .update({
        use_count: newCount,
        status: "grace",
        grace_started_at: now.toISOString(),
        last_used_at: now.toISOString(),
      })
      .eq("ip_address", ip);
    return { allowed: true, status: "grace" };
  }

  await admin
    .from("apply_usage")
    .update({ use_count: newCount, last_used_at: now.toISOString() })
    .eq("ip_address", ip);
  return { allowed: true, status: "free" };
}
