import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import { createClient } from "@/lib/supabase/server";
import OfferAiForm from "@/components/tools/OfferAiForm";

const FEATURE_KEY = "Offer.ai";

export default async function OfferAiPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AppShell title="Offer.ai">
        <AccessDenied reason="You need to sign in first." />
      </AppShell>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  let hasAccess = !!profile?.is_admin;
  if (!hasAccess) {
    const { data: grant } = await supabase
      .from("feature_access")
      .select("id")
      .eq("user_id", user.id)
      .eq("feature_key", FEATURE_KEY)
      .maybeSingle();
    hasAccess = !!grant;
  }

  return (
    <AppShell title="Offer.ai">
      {hasAccess ? <OfferAiForm /> : <AccessDenied reason='The admin hasn’t granted you access to "Offer.ai" yet.' />}
    </AppShell>
  );
}

function AccessDenied({ reason }: { reason: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-2.5">
      <Icon name="x" className="w-8 h-8 text-ink-muted mb-1" />
      <div className="text-[16px] font-bold">Access needed</div>
      <p className="text-[12.5px] text-ink-muted max-w-[320px] leading-relaxed">{reason}</p>
    </div>
  );
}
