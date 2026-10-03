import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getNrsContext, hasNrsAccess } from "@/lib/nrs/member";
import { t } from "@/lib/nrs/i18n/en";
import { home as s } from "@/lib/nrs/i18n/en/home";
import { canOpenTab, nrsTab } from "@/lib/nrs/tabs";
import NrsState from "./_components/NrsState";
import Events from "./_home/Events";
import Feed from "./_home/Feed";
import Kudos from "./_home/Kudos";
import NeedsYou from "./_home/NeedsYou";
import { memberTimezone } from "./_home/server";
import { Card, Skeleton } from "./_home/ui";

function SectionLoading() {
  return (
    <Card>
      <div role="status" aria-live="polite">
        <span className="sr-only">{t("common.loading")}</span>
        <Skeleton lines={3} />
      </div>
    </Card>
  );
}

export default async function NrSynergyHomePage() {
  const ctx = await getNrsContext();
  if (!hasNrsAccess(ctx)) return null;
  if (!canOpenTab(nrsTab("home"), ctx)) {
    return <NrsState icon="x" title={t("common.notAvailableTitle")} body={t("common.featureOff")} />;
  }

  const supabase = await createClient();
  const member = ctx.member;
  const orgId = ctx.orgId;
  const tz = member ? await memberTimezone(supabase, member) : "UTC";

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-1.5">
        <h1 className="text-[22px] sm:text-[26px] font-bold text-ink tracking-tight">
          {t("common.welcome", { name: ctx.firstName })}
        </h1>
        <p className="text-[13px] text-ink-muted">{t("common.welcomeBody")}</p>
        {!member && <p className="text-[12.5px] text-ink-muted">{s.noMember}</p>}
      </section>

      {member && (
        <Suspense fallback={<SectionLoading />}>
          <NeedsYou supabase={supabase} ctx={ctx} member={member} tz={tz} />
        </Suspense>
      )}

      {orgId && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Suspense fallback={<SectionLoading />}>
            <Feed supabase={supabase} orgId={orgId} meId={member?.id ?? null} tz={tz} />
          </Suspense>
          <div className="flex flex-col gap-4 min-w-0">
            <Suspense fallback={<SectionLoading />}>
              <Kudos supabase={supabase} orgId={orgId} meId={member?.id ?? null} tz={tz} />
            </Suspense>
            <Suspense fallback={<SectionLoading />}>
              <Events supabase={supabase} orgId={orgId} tz={tz} />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}
