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
