import { createClient } from "@/lib/supabase/server";
import { getNrsContext, hasNrsAccess } from "@/lib/nrs/member";
import { desk } from "@/lib/nrs/i18n/en/desk";
import NrsState from "../../_components/NrsState";
import { PageHeader } from "../../_home/ui";
import { agentCategories } from "./_server";
import SupportDesk from "./SupportDesk";

export const metadata = { title: `${desk.support.title} · NR Synergy` };
export const dynamic = "force-dynamic";

// Support desk: the ticket queue for IT agents, HR agents and HR admins.
// The NR Synergy layout has already checked sign-in, licence and access.
export default async function SupportDeskPage({ searchParams }: { searchParams: Promise<{ ticket?: string | string[] }> }) {
  const ctx = await getNrsContext();
  if (!hasNrsAccess(ctx)) return null;
  if (!ctx.member) return <NrsState icon="headset" title={desk.support.noAccessTitle} body={desk.support.noMember} />;

  const supabase = await createClient();
  const categories = await agentCategories(supabase, ctx, ctx.member);
  if (!categories.length) {
    return <NrsState icon="headset" title={desk.support.noAccessTitle} body={desk.support.noAccessBody} />;
  }

  const sp = await searchParams;
  const ticket = typeof sp.ticket === "string" && /^[0-9a-f-]{36}$/i.test(sp.ticket) ? sp.ticket : null;

  return (
    <div className="flex flex-col gap-4 min-w-0">
      <PageHeader title={desk.support.title} subtitle={desk.support.subtitle} />
      <SupportDesk categories={categories} initialTicket={ticket} />
    </div>
  );
}
