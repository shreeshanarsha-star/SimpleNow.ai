import AppShell from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import OrgSettingsPanel from "@/components/OrgSettingsPanel";

export const dynamic = "force-dynamic";

export default async function OrgSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AppShell title="Organization Settings">
        <div className="border border-dashed border-border rounded-md px-4 py-6 text-center text-[13px] text-ink-muted">
          Sign in first.
        </div>
      </AppShell>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin, org_id, org_role")
    .eq("id", user.id)
    .single();

  if (!profile?.org_id) {
    return (
      <AppShell title="Organization Settings">
        <div className="border border-dashed border-border rounded-md px-4 py-6 text-center text-[13px] text-ink-muted">
          Your account isn&apos;t part of an organization yet.
        </div>
      </AppShell>
    );
  }

  if (profile.org_role !== "org_admin" && !profile.is_admin) {
    return (
      <AppShell title="Organization Settings">
        <div className="border border-dashed border-border rounded-md px-4 py-6 text-center text-[13px] text-ink-muted">
          Only your organization&apos;s admin can manage these settings.
        </div>
      </AppShell>
    );
  }

  const { data: org, error } = await supabase
    .from("organizations")
    .select("id, name, status, plan")
    .eq("id", profile.org_id)
    .single();

  const { data: grants } = await supabase
    .from("feature_access")
    .select("feature_key")
    .eq("org_id", profile.org_id);

  if (error || !org) {
    return (
      <AppShell title="Organization Settings">
        <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2">
          Could not load your organization.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Organization Settings">
      <div className="mb-6">
        <h2 className="m-0 text-[19px] font-bold">Organization Settings</h2>
        <p className="m-0 mt-1 text-[13px] text-ink-muted">
          Manage your organization&apos;s name, purchased tools, and members.
        </p>
      </div>
      <OrgSettingsPanel
        org={{ ...org, features: (grants || []).map((g) => g.feature_key) }}
        meId={user.id}
      />
    </AppShell>
  );
}
