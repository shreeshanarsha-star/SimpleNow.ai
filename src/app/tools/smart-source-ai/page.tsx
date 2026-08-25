import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import { createClient } from "@/lib/supabase/server";
import SmartSourceAiForm from "@/components/tools/SmartSourceAiForm";

const FEATURE_KEY = "Smart Source.ai";

export default async function SmartSourceAiPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AppShell title="Smart Source.ai">
        <AccessDenied reason="You need to sign in first." />
      </AppShell>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin, org_id")
    .eq("id", user.id)
    .single();

  let hasAccess = !!profile?.is_admin;
  if (!hasAccess && profile?.org_id) {
    const { data: org } = await supabase
      .from("organizations")
      .select("plan, status")
      .eq("id", profile.org_id)
      .maybeSingle();
    if (org?.status === "approved" && org.plan === "bulk") {
      hasAccess = true;
    } else if (org?.status === "approved") {
      const { data: grant } = await supabase
        .from("feature_access")
        .select("id")
        .eq("org_id", profile.org_id)
        .eq("feature_key", FEATURE_KEY)
        .maybeSingle();
      hasAccess = !!grant;
    }
  }

  // Admins get a lightweight visibility badge showing how many searches
  // this org has run this calendar month -- there's no per-search credit
  // system yet (SerpApi is billed on the org's own account), so this is
  // informational usage tracking rather than a hard quota gate.
  let monthlySearchCount: number | undefined;
  if (hasAccess && profile?.is_admin && profile?.org_id) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from("smart_source_searches")
      .select("id", { count: "exact", head: true })
      .eq("org_id", profile.org_id)
      .gte("created_at", startOfMonth.toISOString());
    monthlySearchCount = count ?? 0;
  }

  return (
    <AppShell title="Smart Source.ai">
      {hasAccess ? (
        <SmartSourceAiForm isAdmin={!!profile?.is_admin} monthlySearchCount={monthlySearchCount} />
      ) : (
        <AccessDenied reason='The admin hasn’t granted you access to "Smart Source.ai" yet.' />
      )}
    </AppShell>
  );
}

function AccessDenied({ reason }: { reason: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-2.5">
      <Icon name="x" className="w-8 h-8 text-ink-muted mb-1" />
      <div className="text-[16px] font-bold">Access needed</div>
      <p className="text-[12.5px] text-ink-muted max-w-[320px] leading-relaxed">
        {reason}
      </p>
    </div>
  );
}
