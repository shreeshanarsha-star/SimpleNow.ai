import type { ReactNode } from "react";
import { getNrsContext, hasNrsAccess, type NrsContext, type NrsMember } from "@/lib/nrs/member";
import { t } from "@/lib/nrs/i18n/en";
import { canOpenTab, nrsTab, type NrsTabKey } from "@/lib/nrs/tabs";
import { home } from "@/lib/nrs/i18n/en/home";
import NrsState from "../_components/NrsState";

export type PageGate =
  | { ok: true; ctx: NrsContext; member: NrsMember }
  | { ok: false; node: ReactNode };

/**
 * Page-level check for a member-centric tab: overall access (the layout has
 * already rendered the right state, so this returns nothing), the tab's
 * feature switch, and a member row (HR without one sees a notice).
 */
export async function gatePage(tab: NrsTabKey): Promise<PageGate> {
  const ctx = await getNrsContext();
  if (!hasNrsAccess(ctx)) return { ok: false, node: null };
  if (!canOpenTab(nrsTab(tab), ctx)) {
    return { ok: false, node: <NrsState icon="x" title={t("common.notAvailableTitle")} body={t("common.featureOff")} /> };
  }
  if (!ctx.member) {
    return { ok: false, node: <NrsState icon="users" title={t("common.notAvailableTitle")} body={home.noMember} /> };
  }
  return { ok: true, ctx, member: ctx.member };
}
