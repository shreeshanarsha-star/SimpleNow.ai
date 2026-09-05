import AppShell from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import { DEPARTMENTS } from "@/lib/departments";
import OrgAccessRow from "@/components/admin/OrgAccessRow";
import AdminNav from "@/components/admin/AdminNav";
import SignOutButton from "@/components/admin/SignOutButton";

export const dynamic = "force-dynamic";

// Bundled tools (e.g. Team Chat) are free for every approved org and
// never need a feature_access grant, so they're excluded from the
// per-org grant checklist below -- granting/revoking them would be a
// no-op that only confuses the admin.
const LIVE_FEATURES = DEPARTMENTS.flatMap((d) => d.tools).filter(
  (t) => t.s === "live" && !t.bundled
);

export default async function AdminOrganizationsPage() {
  const supabase = await createClient();

  const { data: profile } = await (async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null };
    return supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  })();

  if (!profile?.is_admin) {
    return (
      <AppShell title="Admin — Organizations">
        <div className="border border-dashed border-border rounded-md px-4 py-6 text-center text-[13px] text-ink-muted">
          Owner access required.
        </div>
      </AppShell>
    );
  }

  const { data: orgsData, error } = await supabase
    .from("organizations")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: members } = await supabase.from("profiles").select("id, org_id");
  const { data: grants } = await supabase.from("feature_access").select("org_id, feature_key").not("org_id", "is", null);

  // Read-only Talent.ai usage snapshot per org -- lets the platform owner
  // see how much a customer is actually using Talent.ai (requisitions,
  // candidates in the pipeline) without opening the tool itself. Dataset is
  // small (tens of requisitions, low hundreds of candidates today), so a
  // plain fetch-and-reduce here is simpler than a DB-side aggregate/RPC and
  // easy to revisit if either table grows a lot.
  const { data: requisitions } = await supabase.from("talent_requisitions").select("id, org_id");
  const reqOrgById = new Map((requisitions || []).map((r) => [r.id, r.org_id as string | null]));
  const { data: candidateReqIds } = await supabase.from("talent_candidates").select("requisition_id");

  const byOrg = new Map<string, { members: number; features: string[]; requisitions: number; candidates: number }>();
  for (const o of orgsData || []) byOrg.set(o.id, { members: 0, features: [], requisitions: 0, candidates: 0 });
  for (const m of members || []) {
    if (m.org_id && byOrg.has(m.org_id)) byOrg.get(m.org_id)!.members += 1;
  }
  for (const g of grants || []) {
    if (g.org_id && byOrg.has(g.org_id)) byOrg.get(g.org_id)!.features.push(g.feature_key);
  }
  for (const r of requisitions || []) {
    if (r.org_id && byOrg.has(r.org_id)) byOrg.get(r.org_id)!.requisitions += 1;
  }
  for (const c of candidateReqIds || []) {
    const orgId = c.requisition_id ? reqOrgById.get(c.requisition_id) : null;
    if (orgId && byOrg.has(orgId)) byOrg.get(orgId)!.candidates += 1;
  }
  const orgs = (orgsData || []).map((o) => ({
    ...o,
    memberCount: byOrg.get(o.id)?.members ?? 0,
    features: byOrg.get(o.id)?.features ?? [],
    talentRequisitions: byOrg.get(o.id)?.requisitions ?? 0,
    talentCandidates: byOrg.get(o.id)?.candidates ?? 0,
  }));

  const pending = orgs.filter((o) => o.status === "pending");
  const rest = orgs.filter((o) => o.status !== "pending");

  return (
    <AppShell title="Admin — Organizations">
      <AdminNav />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="m-0 text-[19px] font-bold">Organizations</h2>
          <p className="m-0 mt-1 text-[13px] text-ink-muted">
            Every company using SimpleNow, sold individually or as a bulk plan. Approve new
            signups, then grant them the tools they&apos;ve purchased.
          </p>
        </div>
        <SignOutButton />
      </div>

      {error && (
        <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2 mb-4">
          Could not load organizations: {error.message}
        </div>
      )}

      {pending.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="m-0 text-[14px] font-bold">Pending approval</h3>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-brand-wash text-brand">
              {pending.length}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {pending.map((org) => (
              <OrgAccessRow key={org.id} org={org} allFeatures={LIVE_FEATURES.map((f) => f.n)} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="m-0 mb-3 text-[14px] font-bold">All organizations</h3>
        {rest.length === 0 ? (
          <div className="border border-dashed border-border rounded-md px-4 py-6 text-center text-[13px] text-ink-muted">
            No approved or suspended organizations yet.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {rest.map((org) => (
              <OrgAccessRow key={org.id} org={org} allFeatures={LIVE_FEATURES.map((f) => f.n)} />
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
