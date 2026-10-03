import AppShell from "@/components/AppShell";
import { requireFeatureAccess } from "@/lib/supabase/requireAdmin";
import { getNrsContext, hasNrsAccess, NRS_FEATURE_KEY } from "@/lib/nrs/member";
import { t } from "@/lib/nrs/i18n/en";
import { canOpenTab, NRS_TABS } from "@/lib/nrs/tabs";
import NrsNav, { type NrsNavItem } from "./_components/NrsNav";
import NrsState from "./_components/NrsState";

export const metadata = { title: "NR Synergy" };

async function licenceError(): Promise<string | null> {
  try {
    await requireFeatureAccess(NRS_FEATURE_KEY);
    return null;
  } catch (res) {
    if (res instanceof Response) {
      try {
        const body = (await res.json()) as { error?: unknown };
        if (typeof body.error === "string") return body.error;
      } catch {
        // fall through to the generic message
      }
    }
    return t("common.error");
  }
}

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

  const licence = await licenceError();
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

  return (
    <AppShell title={title}>
      <div className="flex-1 min-h-0 flex flex-col gap-4 sm:gap-5">
        <NrsNav items={items} />
        <div className="flex-1 flex flex-col min-w-0">{children}</div>
      </div>
    </AppShell>
  );
}
