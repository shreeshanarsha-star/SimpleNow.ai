import AppShell from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import { DEPARTMENTS } from "@/lib/departments";
import UserAccessRow from "@/components/admin/UserAccessRow";
import AdminNav from "@/components/admin/AdminNav";

export const dynamic = "force-dynamic";

const LIVE_FEATURES = DEPARTMENTS.flatMap((d) => d.tools).filter((t) => t.s === "live");

export default async function AdminUsersPage() {
  const supabase = await createClient();

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, email, is_admin, created_at")
    .order("created_at", { ascending: true });

  const { data: grants } = await supabase
    .from("feature_access")
    .select("user_id, feature_key");

  const grantsByUser = new Map<string, Set<string>>();
  for (const g of grants ?? []) {
    if (!grantsByUser.has(g.user_id)) grantsByUser.set(g.user_id, new Set());
    grantsByUser.get(g.user_id)!.add(g.feature_key);
  }

  return (
    <AppShell title="Admin — Users">
      <AdminNav />
      <div className="mb-6">
        <h2 className="m-0 text-[19px] font-bold">Users &amp; feature access</h2>
        <p className="m-0 mt-1 text-[13px] text-ink-muted">
          Every new sign-up starts with nothing enabled. Grant access one tool at a
          time — only tools that are actually built show up here.
        </p>
      </div>

      {error && (
        <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2 mb-4">
          Could not load users: {error.message}
        </div>
      )}

      {LIVE_FEATURES.length === 0 ? (
        <div className="border border-dashed border-border rounded-md px-4 py-6 text-center text-[13px] text-ink-muted">
          No tools are built yet — nothing to grant access to.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {(profiles ?? []).map((profile) => (
            <UserAccessRow
              key={profile.id}
              user={profile}
              features={LIVE_FEATURES.map((f) => f.n)}
              grantedFeatures={Array.from(grantsByUser.get(profile.id) ?? [])}
            />
          ))}
          {(profiles ?? []).length === 0 && (
            <div className="border border-dashed border-border rounded-md px-4 py-6 text-center text-[13px] text-ink-muted">
              No one has registered yet.
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
