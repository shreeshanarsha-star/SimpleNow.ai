import { getNrsContext, hasNrsAccess } from "@/lib/nrs/member";
import { canOpenTab, nrsTab } from "@/lib/nrs/tabs";
import { money as s } from "@/lib/nrs/i18n/en/money";
import { t } from "@/lib/nrs/i18n/en";
import NrsState from "../_components/NrsState";
import MoneyClient from "./_components/MoneyClient";

export const dynamic = "force-dynamic";

export default async function NrSynergyMoneyPage() {
  const ctx = await getNrsContext();
  if (!hasNrsAccess(ctx)) return null;
  if (!canOpenTab(nrsTab("money"), ctx)) {
    return <NrsState icon="x" title={t("common.notAvailableTitle")} body={t("common.featureOff")} />;
  }
  if (!ctx.member) {
    return <NrsState icon="dollar" title={s.title} body={s.common.noProfile} />;
  }
  return <MoneyClient isConsultant={ctx.engagementType === "consultant"} isFinance={ctx.isFinance} />;
}
