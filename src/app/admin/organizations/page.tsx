import AppShell from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import { DEPARTMENTS } from "@/lib/departments";
import OrgAccessRow from "@/components/admin/OrgAccessRow";
import AdminNav from "@/components/admin/AdminNav";
import SignOutButton from "@/components/admin/SignOutButton";

export const dynamic = "force-dynamic";

const LIVE_FEATURES = DEPARTMENTS.flatMap((d) => d.tools).filter((t) => t.s === "live");

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

  const byOrg = new Map<string, { members: number; features: string[] }>();
  for (const o of orgsData || []) byOrg.set(o.id, { members: 0, features: [] });
  for (const m of members || []) {
    if (m.org_id && byOrg.has(m.org_id)) byOrg.get(m.org_id)!.members += 1;
  }
  for (const g of grants || []) {
    if (g.org_id && byOrg.has(g.org_id)) byOrg.get(g.org_id)!.features.push(g.feature_key);
  }
  const orgs = (orgsData || []).map((o) => ({
    ...o,
    memberCount: byOrg.get(o.id)?.members ?? 0,
    features: byOrg.get(o.id)?.features ?? [],
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
            Every company using Askshree, sold individually or as a bulk plan. Approve new
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
