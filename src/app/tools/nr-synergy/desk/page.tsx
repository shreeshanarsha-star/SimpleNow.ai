import { redirect } from "next/navigation";
import { getNrsContext, hasNrsAccess } from "@/lib/nrs/member";
import { t } from "@/lib/nrs/i18n/en";
import { desk } from "@/lib/nrs/i18n/en/desk";
import { NRS_DESKS } from "@/lib/nrs/tabs";
import NrsState from "../_components/NrsState";

export const metadata = { title: `${t("nav.desk")} · NR Synergy` };
export const dynamic = "force-dynamic";

// The Desk tab opens the first desk the caller can use (support, then travel).
export default async function DeskPage() {
  const ctx = await getNrsContext();
  if (!hasNrsAccess(ctx)) return null;
  const first = NRS_DESKS.find((d) => ctx.desk[d.key]);
  if (first) redirect(first.href);
  return <NrsState icon="briefcase" title={desk.support.noAccessTitle} body={desk.support.noAccessBody} />;
}
