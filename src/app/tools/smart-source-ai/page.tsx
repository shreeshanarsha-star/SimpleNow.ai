import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import Link from "next/link";
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
  if (hasAccess && profile?.is_admin) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    let countQuery = supabase
      .from("smart_source_searches")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startOfMonth.toISOString());
    if (profile.org_id) {
      countQuery = countQuery.eq("org_id", profile.org_id);
    } else {
      countQuery = countQuery.or(`org_id.is.null,created_by.eq.${user.id}`);
    }
    const { count } = await countQuery;
    monthlySearchCount = count ?? 0;
  }

  return (
    <AppShell title="Smart Source.ai">
      {hasAccess ? (
        <div className="flex flex-col gap-3">
          <ExtensionBanner />
          <SmartSourceAiForm isAdmin={!!profile?.is_admin} monthlySearchCount={monthlySearchCount} />
        </div>
      ) : (
        <AccessDenied reason='The admin hasn’t granted you access to "Smart Source.ai" yet.' />
      )}
    </AppShell>
  );
}

// Surfaces the SimpleNow-Source Chrome extension right inside Smart
// Source.ai itself -- the extension is what feeds this pipeline from
// LinkedIn, so someone landing here for the first time should see it
// without having to already know it lives under Personal Tools.
function ExtensionBanner() {
  return (
    <Link
      href="/tools/smartsource-clipper"
      className="group flex items-center gap-3 rounded-md border border-border bg-page px-4 py-3 hover:border-brand/40 hover:bg-brand-wash transition-colors"
    >
      <span className="w-9 h-9 rounded-md bg-[#151221] flex items-center justify-center flex-shrink-0">
        <Icon name="globe" className="w-4.5 h-4.5 text-[#C79A3E]" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[12.5px] font-bold text-ink">
          Get the SimpleNow-Source Chrome extension
        </span>
        <span className="block text-[11.5px] text-ink-muted leading-snug">
          Clip candidates and their AI-found contact info straight from LinkedIn into this pipeline.
        </span>
      </span>
      <span className="text-[11.5px] font-semibold text-brand flex-shrink-0 flex items-center gap-1">
        Download
        <Icon name="download" className="w-3.5 h-3.5" />
      </span>
    </Link>
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
