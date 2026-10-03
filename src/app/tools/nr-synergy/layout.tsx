import AppShell from "@/components/AppShell";
import { getNrsContext, hasNrsAccess, nrsLicenceError } from "@/lib/nrs/member";
import { t } from "@/lib/nrs/i18n/en";
import { canOpenTab, NRS_BASE, NRS_TABS, nrsTab } from "@/lib/nrs/tabs";
import GlobalSearch from "./_components/GlobalSearch";
import NrsNav, { type NrsNavItem } from "./_components/NrsNav";
import NrsState from "./_components/NrsState";

export const metadata = { title: "NR Synergy" };

export default async function NrSynergyLayout({ children }: { children: React.ReactNode }) {
  const title = t("common.appName");
  const ctx = await getNrsContext();

  if (!ctx) {
    return (
      <AppShell title={title}>
        <NrsState
          icon="users"
          title={t("common.signInTitle")}
          body={t("common.signInBody")}
          action={{ href: "/login", label: t("common.signIn") }}
        />
      </AppShell>
    );
  }

  const licence = await nrsLicenceError(t("common.error"));
  if (licence) {
    return (
      <AppShell title={title}>
        <NrsState icon="x" title={t("common.licenceTitle")} body={licence} />
      </AppShell>
    );
  }

  if (!hasNrsAccess(ctx)) {
    return (
      <AppShell title={title}>
        <NrsState icon="users" title={t("common.noAccessTitle")} body={t("common.noAccessBody")} />
      </AppShell>
    );
  }

  const items: NrsNavItem[] = NRS_TABS.filter((tab) => canOpenTab(tab, ctx) && (tab.built || ctx.isHr)).map(
    (tab) => ({ key: tab.key, soon: !tab.built })
  );

  const helpHref = ctx.member && canOpenTab(nrsTab("help"), ctx) ? `${NRS_BASE}/help#nrs-new-ticket` : null;

  return (
    <AppShell title={title}>
      <div className="flex-1 min-h-0 flex flex-col gap-4 sm:gap-5">
        <div className="flex flex-col gap-3 sm:gap-4">
          <GlobalSearch helpHref={helpHref} />
          <NrsNav items={items} />
        </div>
        <div className="flex-1 flex flex-col min-w-0">{children}</div>
      </div>
    </AppShell>
  );
}
