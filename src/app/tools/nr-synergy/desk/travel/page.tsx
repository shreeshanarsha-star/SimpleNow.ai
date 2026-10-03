import { getNrsContext, hasNrsAccess } from "@/lib/nrs/member";
import { createAdminClient } from "@/lib/supabase/admin";
import { t } from "@/lib/nrs/i18n/en";
import { travel as s } from "@/lib/nrs/i18n/en/travel";
import NrsState from "../../_components/NrsState";
import { deskAccess, loadDeskData, type DeskData } from "./_lib/server";
import TravelDesk from "./_components/TravelDesk";

export const metadata = { title: `${s.desk.title} · NR Synergy` };
export const dynamic = "force-dynamic";

// Travel desk: approve trips at the travel-desk step, record bookings and
// mark trips booked. Travel desk role or HR. The NR Synergy layout has
// already checked sign-in, licence and access.
export default async function TravelDeskPage() {
  const ctx = await getNrsContext();
  if (!hasNrsAccess(ctx)) return null;
  if (!ctx.member || !ctx.orgId) return <NrsState icon="globe" title={s.desk.noAccessTitle} body={s.desk.noMember} />;

  const admin = createAdminClient();
  let data: DeskData;
  let access: Awaited<ReturnType<typeof deskAccess>>;
  try {
    access = await deskAccess(admin, ctx);
    if (!access.canBook) return <NrsState icon="globe" title={s.desk.noAccessTitle} body={s.desk.noAccessBody} />;
    data = await loadDeskData(admin, ctx.orgId, ctx.member.id);
  } catch {
    return (
      <NrsState icon="x" title={t("common.error")} body={t("common.error")} action={{ href: "/tools/nr-synergy/desk/travel", label: t("common.retry") }} />
    );
  }

  return (
    <section className="flex flex-col gap-4 min-w-0">
      <header className="flex flex-col gap-1">
        <h1 className="text-[22px] sm:text-[26px] font-bold text-ink tracking-tight">{s.desk.title}</h1>
        <p className="text-[13px] text-ink-muted max-w-prose">{s.desk.subtitle}</p>
      </header>
      <TravelDesk data={data} canApprove={access.canApprove} />
    </section>
  );
}
