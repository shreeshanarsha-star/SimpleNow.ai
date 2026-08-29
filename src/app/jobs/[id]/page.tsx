import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import Icon from "@/components/Icon";
import Logo from "@/components/Logo";
import { buildJobPostingSchema } from "@/lib/jobPostings/schema";

export const dynamic = "force-dynamic";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: job } = await supabase
    .from("job_postings")
    .select(
      "id, title, company, company_url, location, employment_type, description, ai_polished_description, must_have_skills, good_to_have_skills, qualification, min_years_experience, industry, ctc_budget, created_at, expires_at, status"
    )
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();

  if (!job) notFound();

  const displayDescription = job.ai_polished_description || job.description;

  const schema = buildJobPostingSchema({
    title: job.title,
    company: job.company,
    location: job.location,
    description: displayDescription,
    created_at: job.created_at,
    expires_at: job.expires_at,
    employment_type: job.employment_type,
  });

  return (
    <div className="min-h-screen bg-page">
      {/* Google-for-Jobs structured data */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />

      <header className="border-b border-border bg-surface">
        <div className="max-w-[800px] mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/jobs" className="flex flex-col items-start gap-0.5">
            <Logo height={26} />
            <small className="block font-medium text-[10.5px] text-ink-muted tracking-wide">
              JOB BOARD
            </small>
          </Link>
          <Link
            href="/jobs"
            className="text-[12px] font-bold text-ink-muted flex items-center gap-1"
          >
            <Icon name="chevronLeft" className="w-3.5 h-3.5" /> All roles
          </Link>
        </div>
      </header>

      <main className="max-w-[800px] mx-auto px-6 py-10">
        <h1 className="text-[24px] font-bold m-0">{job.title}</h1>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[13px] text-ink-muted">
          {job.company && <span>{job.company}</span>}
          {job.location && <span>· {job.location}</span>}
          {job.employment_type && <span>· {job.employment_type}</span>}
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          {job.industry && <Tag>{job.industry}</Tag>}
          {job.min_years_experience != null && (
            <Tag>{job.min_years_experience}+ yrs experience</Tag>
          )}
          {job.qualification && <Tag>{job.qualification}</Tag>}
          {job.ctc_budget && <Tag>{job.ctc_budget}</Tag>}
        </div>

        {(job.must_have_skills?.length > 0 || job.good_to_have_skills?.length > 0) && (
          <div className="grid grid-cols-2 gap-4 mt-6">
            {job.must_have_skills?.length > 0 && (
              <SkillList label="Must-have skills" skills={job.must_have_skills} />
            )}
            {job.good_to_have_skills?.length > 0 && (
              <SkillList label="Good to have" skills={job.good_to_have_skills} />
            )}
          </div>
        )}

        <div className="mt-8">
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-2">
            About this role
          </div>
          <p className="text-[13.5px] text-ink-2 whitespace-pre-wrap leading-relaxed">
            {displayDescription}
          </p>
        </div>

        <div className="mt-8">
          <Link
            href={`/apply?job=${job.id}`}
            className="bg-brand text-white text-[13.5px] font-bold px-5 py-3 rounded-sm shadow-soft-sm inline-block"
          >
            Apply now
          </Link>
        </div>
      </main>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-page text-ink-muted border border-border">
      {children}
    </span>
  );
}

function SkillList({ label, skills }: { label: string; skills: string[] }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1.5">
        {label}
      </div>
      <ul className="text-[13px] text-ink-2 list-disc pl-4 space-y-0.5">
        {skills.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </div>
  );
}
