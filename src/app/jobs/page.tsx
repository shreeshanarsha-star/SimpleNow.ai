import { createClient } from "@/lib/supabase/server";
import Icon from "@/components/Icon";
import Link from "next/link";
import LogoMark from "@/components/LogoMark";

export const dynamic = "force-dynamic";

// Public, crawlable job board — the old askshree-app repo's /jobs index,
// recreated. Anyone can browse; postings are AI-structured JDs an admin
// has approved and published (from either the free public flow at
// /jobs/post or the internal org-gated tool at /tools/job-postings-ai —
// both land in the same job_postings table and this page doesn't care
// which one a given row came from).
export default async function JobsPage() {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const { data: jobs } = await supabase
    .from("job_postings")
    .select(
      "id, title, company, location, employment_type, ctc_budget, industry, created_at, expires_at"
    )
    .eq("status", "published")
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order("created_at", { ascending: false });

  const openRoles = jobs ?? [];

  return (
    <div className="min-h-screen bg-page">
      <header className="border-b border-border bg-surface">
        <div className="max-w-[1000px] mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <LogoMark size={30} />
            <div>
              <div className="font-bold text-[15.5px] leading-tight">Askshree</div>
              <small className="block font-medium text-[10.5px] text-ink-muted tracking-wide">
                JOB BOARD
              </small>
            </div>
          </Link>
          <Link
            href="/jobs/post"
            className="bg-brand text-white text-[12.5px] font-bold px-3.5 py-2 rounded-sm shadow-soft-sm"
          >
            Post a job — free
          </Link>
        </div>
      </header>

      <main className="max-w-[1000px] mx-auto px-6 py-10">
        <h1 className="text-[26px] font-bold m-0">Open roles</h1>
        <p className="text-[13.5px] text-ink-muted mt-1.5 max-w-xl">
          Browse current openings. Click a role for full details, or head to
          Apply.ai to submit your resume.
        </p>

        {openRoles.length === 0 ? (
          <div className="border border-dashed border-border rounded-md px-4 py-8 text-center text-[13px] text-ink-muted mt-8 max-w-xl">
            <Icon name="briefcase" className="w-6 h-6 mx-auto mb-2 text-ink-muted" />
            No open roles right now. Check back soon.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 mt-8">
            {openRoles.map((job) => (
              <Link
                key={job.id}
                href={`/jobs/${job.id}`}
                className="border border-border rounded-md bg-surface shadow-soft-sm px-4 py-3.5 flex items-center gap-3 hover:border-brand transition-colors"
              >
                <div className="flex-1">
                  <div className="text-[14px] font-bold">{job.title}</div>
                  {job.company && (
                    <div className="text-[12px] text-ink-muted mt-0.5">{job.company}</div>
                  )}
                </div>
                {job.location && (
                  <span className="text-[11.5px] text-ink-muted">{job.location}</span>
                )}
                {job.employment_type && (
                  <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-page text-ink-muted">
                    {job.employment_type}
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
