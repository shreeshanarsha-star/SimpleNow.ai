import { getNrsContext, hasNrsAccess } from "@/lib/nrs/member";
import { t } from "@/lib/nrs/i18n/en";
import { canOpenTab, nrsTab, type NrsTabKey } from "@/lib/nrs/tabs";
import NrsState from "./NrsState";

// Temporary page body for tabs whose module isn't built yet. The layout has
// already checked overall access; this enforces the tab's own feature
// switch / audience in case the URL is opened directly.
export default async function TabPlaceholder({ tab }: { tab: NrsTabKey }) {
  const ctx = await getNrsContext();
  const def = nrsTab(tab);
  if (!hasNrsAccess(ctx)) return null;

  if (!canOpenTab(def, ctx)) {
    const body =
      def.audience === "hr" ? t("common.hrOnly") : def.audience === "manager" ? t("common.managersOnly") : t("common.featureOff");
    return <NrsState icon="x" title={t("common.notAvailableTitle")} body={body} />;
  }

  return <NrsState icon={def.icon} title={`${t(def.label)}: ${t("common.comingSoon")}`} body={t("common.comingSoonBody")} />;
}
