import { NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";

const JOBPOSTINGS_FROM_ADDRESS =
  process.env.JOBPOSTINGS_EMAIL_FROM || "Askshree Job Postings <onboarding@resend.dev>";

// POST { email, jobPostingIds: string[] } — emails the poster a link to
// confirm their address. Confirming attaches poster_email/email_verified
// (and a domain_match flag) to each posting; admins can use that signal
// during review. Ported from the old askshree-app repo's
// send-verification/route.js (site-key check dropped — this whole flow is
// intentionally public now).
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const jobPostingIds = Array.isArray(body?.jobPostingIds) ? body.jobPostingIds : [];

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }
  if (jobPostingIds.length === 0) {
    return NextResponse.json({ error: "No postings to verify." }, { status: 400 });
  }

  const token = crypto.randomBytes(24).toString("hex");
  const admin = createAdminClient();
  const { error } = await admin.from("job_posting_email_verifications").insert({
    token,
    email,
    job_posting_ids: jobPostingIds,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const origin = request.headers.get("origin") || "https://askshree.com";
  const verifyLink = `${origin}/api/public/job-postings/verify-email?token=${token}`;

  const result = await sendEmail({
    to: email,
    from: JOBPOSTINGS_FROM_ADDRESS,
    subject: "Confirm your job posting — Askshree",
    html: `<p>Click the link below to confirm your email and verify your job posting${
      jobPostingIds.length > 1 ? "s" : ""
    }:</p>
           <p><a href="${verifyLink}">${verifyLink}</a></p>
           <p>This link expires in 2 days.</p>`,
  });

  return NextResponse.json({
    ok: true,
    emailSent: result.ok,
    verifyLink: result.ok ? undefined : verifyLink,
  });
}
