import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import { createClient } from "@/lib/supabase/server";
import TalentWorkspace from "@/components/tools/TalentWorkspace";

const FEATURE_KEY = "Talent.ai";

export default async function TalentAiPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AppShell title="Talent.ai">
        <AccessDenied reason="You need to sign in first." />
      </AppShell>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin, org_id")
    .eq("id", user.id)
    .single();

  // Platform owner: no personal Talent.ai workspace. He manages orgs,
  // approvals, and feature grants from the Owner Console -- checking a
  // specific customer's Talent.ai usage happens from that org's row there,
  // not by opening this tool as if he were a user of it.
  if (profile?.is_admin) {
    redirect("/admin/organizations");
  }

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

  return (
    <AppShell title="Talent.ai">
      {hasAccess ? (
        <TalentWorkspace />
      ) : (
        <AccessDenied reason='The admin hasn’t granted you access to "Talent.ai" yet.' />
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
