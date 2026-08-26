import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDomain } from "@/lib/jobPostings/domain";

// GET because this is what the link in the email actually opens. Ported
// from the old askshree-app repo's verify-email/route.js.
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/jobs/post?verify=missing_token", request.url));
  }

  const admin = createAdminClient();
  const { data: v } = await admin
    .from("job_posting_email_verifications")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (!v || v.verified || new Date(v.expires_at) < new Date()) {
    return NextResponse.redirect(new URL("/jobs/post?verify=invalid", request.url));
  }

  const posterDomain = getDomain(v.email);
  const ids: string[] = v.job_posting_ids || [];

  for (const id of ids) {
    const { data: job } = await admin
      .from("job_postings")
      .select("company_url")
      .eq("id", id)
      .maybeSingle();
    const domainMatch = !!job?.company_url && getDomain(job.company_url) === posterDomain;
    await admin
      .from("job_postings")
      .update({ poster_email: v.email, email_verified: true, domain_match: domainMatch })
      .eq("id", id);
  }

  await admin.from("job_posting_email_verifications").update({ verified: true }).eq("token", token);

  return NextResponse.redirect(new URL("/jobs/post?verify=success", request.url));
}
