import { createClient } from "@/lib/supabase/server";
import ApplyForm from "@/components/tools/ApplyForm";
import Icon from "@/components/Icon";
import Link from "next/link";
import LogoMark from "@/components/LogoMark";

export const dynamic = "force-dynamic";

// Apply.ai — public, candidate-facing. No login required: anyone can browse
// published roles and apply. Deliberately NOT under /tools or AppShell —
// those are the internal owner/staff console (middleware gates /tools to
// signed-in users, and the sidebar shows owner branding that has no
// business being shown to a job applicant). This is its own simple public
// surface, same Supabase project, RLS-scoped to status = 'published' only.
export default async function ApplyPage() {
  const supabase = await createClient();
  const { data: jobs } = await supabase
    .from("job_postings")
    .select("id, title, location, employment_type, description, ai_polished_description")
    .eq("status", "published")
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
                CAREERS
              </small>
            </div>
          </Link>
        </div>
      </header>

      <main className="max-w-[1000px] mx-auto px-6 py-10">
        <h1 className="text-[26px] font-bold m-0">Apply.ai</h1>
        <p className="text-[13.5px] text-ink-muted mt-1.5 max-w-xl">
          Browse open roles and apply directly — no account needed. Your
          application goes straight to the hiring team.
        </p>

        {openRoles.length === 0 ? (
          <div className="border border-dashed border-border rounded-md px-4 py-8 text-center text-[13px] text-ink-muted mt-8 max-w-xl">
            <Icon name="briefcase" className="w-6 h-6 mx-auto mb-2 text-ink-muted" />
            No open roles right now. Check back soon.
          </div>
        ) : (
          <ApplyForm jobs={openRoles} />
        )}
      </main>
    </div>
  );
}
