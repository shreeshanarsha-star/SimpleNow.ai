import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import { createClient } from "@/lib/supabase/server";
import RequisitionCandidatesView from "@/components/tools/RequisitionCandidatesView";
import RequisitionRoleOverview from "@/components/tools/RequisitionRoleOverview";

const FEATURE_KEY = "Talent.ai";

export default async function RequisitionCandidatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string; stage?: string }>;
}) {
  const { id } = await params;
  const { view, stage } = await searchParams;
  // A stage-filtered deep link (from the pipeline table's per-stage cells)
  // always means "show me candidates in this stage" -- default to the
  // Role overview tab only when nothing else says otherwise.
  const showCandidates = view === "candidates" || !!stage;
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
        showCandidates ? (
          <RequisitionCandidatesView requisitionId={id} />
        ) : (
          <RequisitionRoleOverview requisitionId={id} />
        )
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
