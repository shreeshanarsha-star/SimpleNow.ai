import { getNrsContext, hasNrsAccess } from "@/lib/nrs/member";
import { createClient } from "@/lib/supabase/server";
import { t } from "@/lib/nrs/i18n/en";
import { people as s } from "@/lib/nrs/i18n/en/people";
import { canOpenTab, nrsTab } from "@/lib/nrs/tabs";
import NrsState from "../_components/NrsState";
import PeopleApp from "./_components/PeopleApp";
import { loadDirectory, type Directory } from "./_lib/data";

export const dynamic = "force-dynamic";

export default async function NrSynergyPeoplePage() {
  const ctx = await getNrsContext();
  if (!hasNrsAccess(ctx)) return null;
  if (!canOpenTab(nrsTab("people"), ctx)) {
    return <NrsState icon="x" title={t("common.notAvailableTitle")} body={t("common.featureOff")} />;
  }
  if (!ctx.orgId) return <NrsState icon="users" title={s.emptyTitle} body={s.emptyBody} />;

  let directory: Directory;
  try {
    directory = await loadDirectory(await createClient(), ctx.orgId);
  } catch {
    return (
      <NrsState
        icon="x"
        title={t("common.error")}
        body={s.loadError}
        action={{ href: "/tools/nr-synergy/people", label: t("common.retry") }}
      />
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-[22px] sm:text-[26px] font-bold text-ink tracking-tight">{s.title}</h1>
        <p className="text-[13px] text-ink-muted">{s.subtitle}</p>
      </header>
      {directory.people.length === 0 ? (
        <NrsState icon="users" title={s.emptyTitle} body={s.emptyBody} />
      ) : (
        <PeopleApp people={directory.people} countries={directory.countries} meId={ctx.member?.id ?? null} />
      )}
    </section>
  );
}
