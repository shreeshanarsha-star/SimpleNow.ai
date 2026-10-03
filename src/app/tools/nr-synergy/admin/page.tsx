import { getNrsContext, hasNrsAccess } from "@/lib/nrs/member";
import { admin as s } from "@/lib/nrs/i18n/en/admin";
import { t } from "@/lib/nrs/i18n/en";
import NrsState from "../_components/NrsState";
import AdminClient from "./_components/AdminClient";

export const dynamic = "force-dynamic";

export default async function NrSynergyAdminPage() {
  const ctx = await getNrsContext();
  if (!hasNrsAccess(ctx)) return null;
  if (!ctx.isHr) return <NrsState icon="x" title={t("common.notAvailableTitle")} body={s.hrOnly} />;
  if (!ctx.orgId) return <NrsState icon="x" title={t("common.notAvailableTitle")} body={t("common.noAccessBody")} />;
  return <AdminClient />;
}
