import AppShell from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import JobPostingApprovalRow from "@/components/admin/JobPostingApprovalRow";
import ApplicationApprovalRow from "@/components/admin/ApplicationApprovalRow";
import OfferApprovalRow from "@/components/admin/OfferApprovalRow";
import SignOutButton from "@/components/admin/SignOutButton";
import AdminNav from "@/components/admin/AdminNav";
import { DEPARTMENTS } from "@/lib/departments";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createClient();

  const { data: jobPostings, error } = await supabase
    .from("job_postings")
    .select("*")
    .order("created_at", { ascending: false });

  const pending = (jobPostings ?? []).filter((p) => p.status === "pending_approval");
  const decided = (jobPostings ?? []).filter((p) => p.status !== "pending_approval");

  const { data: applications, error: applicationsError } = await supabase
    .from("job_applications")
    .select("*, job_postings(title)")
    .order("created_at", { ascending: false });

  const pendingApplications = (applications ?? []).filter(
    (a) => a.status === "pending_approval"
  );
  const decidedApplications = (applications ?? []).filter(
    (a) => a.status !== "pending_approval"
  );

  const { data: offers, error: offersError } = await supabase
    .from("offers")
    .select("*")
    .order("created_at", { ascending: false });

  const pendingOffers = (offers ?? []).filter((o) => o.status === "pending_approval");
  const decidedOffers = (offers ?? []).filter((o) => o.status !== "pending_approval");

  // Every HR tool that isn't built yet — shown honestly as "not built"
  // rather than pretending there's a queue for something that doesn't
  // exist.
  const notBuiltYet = DEPARTMENTS.flatMap((d) => d.tools)
    .filter((t) => t.s === "soon")
    .slice(0, 6);

  return (
    <AppShell title="Admin">
      <AdminNav />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="m-0 text-[19px] font-bold">Approval queues</h2>
          <p className="m-0 mt-1 text-[13px] text-ink-muted">
            One queue per feature. Nothing a tool produces goes live until you approve it here.
          </p>
        </div>
        <SignOutButton />
      </div>

      {error && (
        <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2 mb-4">
          Could not load job postings: {error.message}
        </div>
      )}

      <section className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="m-0 text-[14px] font-bold">Job Postings.ai</h3>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-good-wash text-good-text">
            {pending.length} pending
          </span>
        </div>

        {pending.length === 0 ? (
          <EmptyState text="Nothing waiting on you right now." />
        ) : (
          <div className="flex flex-col gap-2">
            {pending.map((posting) => (
              <JobPostingApprovalRow key={posting.id} posting={posting} />
            ))}
          </div>
        )}

        {decided.length > 0 && (
          <details className="mt-4">
            <summary className="text-[12px] font-bold text-ink-muted cursor-pointer">
              {decided.length} decided
            </summary>
            <div className="flex flex-col gap-2 mt-2">
              {decided.map((posting) => (
                <JobPostingApprovalRow key={posting.id} posting={posting} readOnly />
              ))}
            </div>
          </details>
        )}
      </section>

      <section className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="m-0 text-[14px] font-bold">Apply.ai</h3>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-good-wash text-good-text">
            {pendingApplications.length} pending
          </span>
        </div>

        {applicationsError && (
          <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2 mb-4">
            Could not load applications: {applicationsError.message}
          </div>
        )}

        {pendingApplications.length === 0 ? (
          <EmptyState text="Nothing waiting on you right now." />
        ) : (
          <div className="flex flex-col gap-2">
            {pendingApplications.map((application) => (
              <ApplicationApprovalRow key={application.id} application={application} />
            ))}
          </div>
        )}

        {decidedApplications.length > 0 && (
          <details className="mt-4">
            <summary className="text-[12px] font-bold text-ink-muted cursor-pointer">
              {decidedApplications.length} decided
            </summary>
            <div className="flex flex-col gap-2 mt-2">
              {decidedApplications.map((application) => (
                <ApplicationApprovalRow key={application.id} application={application} readOnly />
              ))}
            </div>
          </details>
        )}
      </section>

      <section className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="m-0 text-[14px] font-bold">Offer.ai</h3>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-good-wash text-good-text">
            {pendingOffers.length} pending
          </span>
        </div>

        {offersError && (
          <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2 mb-4">
            Could not load offers: {offersError.message}
          </div>
        )}

        {pendingOffers.length === 0 ? (
          <EmptyState text="Nothing waiting on you right now." />
        ) : (
          <div className="flex flex-col gap-2">
            {pendingOffers.map((offer) => (
              <OfferApprovalRow key={offer.id} offer={offer} />
            ))}
          </div>
        )}

        {decidedOffers.length > 0 && (
          <details className="mt-4">
            <summary className="text-[12px] font-bold text-ink-muted cursor-pointer">
              {decidedOffers.length} decided
            </summary>
            <div className="flex flex-col gap-2 mt-2">
              {decidedOffers.map((offer) => (
                <OfferApprovalRow key={offer.id} offer={offer} readOnly />
              ))}
            </div>
          </details>
        )}
      </section>

      <section>
        <h3 className="m-0 text-[14px] font-bold mb-3">Other HR tools</h3>
        <div className="grid grid-cols-2 gap-2">
          {notBuiltYet.map((tool) => (
            <div
              key={tool.n}
              className="border border-border rounded-md px-4 py-3 bg-surface text-[13px] text-ink-muted flex items-center justify-between"
            >
              {tool.n}
              <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-page">
                Not built yet
              </span>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="border border-dashed border-border rounded-md px-4 py-6 text-center text-[13px] text-ink-muted">
      {text}
    </div>
  );
}
