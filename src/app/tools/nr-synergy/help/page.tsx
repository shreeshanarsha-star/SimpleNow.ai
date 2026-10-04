import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { help as s } from "@/lib/nrs/i18n/en/help";
import { desk } from "@/lib/nrs/i18n/en/desk";
import { gatePage } from "../_home/gate";
import { memberNames } from "../_home/server";
import { NRS_BASE } from "@/lib/nrs/tabs";
import { Card, EmptyLine, PageHeader, Pill, SectionTitle, fill, fmtDate, secondaryButtonClass } from "../_home/ui";
import { agentCategories } from "../desk/support/_server";
import { PRIORITY_TONE, TICKET_COLUMNS, TICKET_TONE, type TicketRow } from "./_lib";
import NewTicketForm from "./NewTicketForm";

interface AssetRow {
  id: string;
  kind: "laptop" | "phone" | "sim" | "other";
  model: string | null;
  serial: string | null;
  status: "in_stock" | "issued" | "returned" | "lost";
  issued_on: string | null;
  returned_on: string | null;
}

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined, max: number) => (typeof (Array.isArray(v) ? v[0] : v) === "string" ? String(Array.isArray(v) ? v[0] : v).slice(0, max) : "");

export default async function NrSynergyHelpPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const prefill = { category: first(sp.category, 20), title: first(sp.title, 200), description: first(sp.body, 4000) };
  const gate = await gatePage("help");
  if (!gate.ok) return gate.node;
  const { member, ctx } = gate;
  const supabase = await createClient();

  const [ticketsRes, assetsRes] = await Promise.all([
    supabase
      .from("nrs_tickets")
      .select(TICKET_COLUMNS)
      .eq("member_id", member.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("nrs_assets")
      .select("id, kind, model, serial, status, issued_on, returned_on")
      .eq("assigned_member_id", member.id)
      .order("issued_on", { ascending: false, nullsFirst: false }),
  ]);
  if (ticketsRes.error) throw new Error(ticketsRes.error.message);
  if (assetsRes.error) throw new Error(assetsRes.error.message);
  const tickets = (ticketsRes.data ?? []) as TicketRow[];
  const assets = (assetsRes.data ?? []) as AssetRow[];
  const currentAssets = assets.filter((a) => a.status !== "returned");
  const pastAssets = assets
    .filter((a) => a.status === "returned")
    .sort((a, b) => (b.returned_on ?? "").localeCompare(a.returned_on ?? ""));
  const [names, deskCats] = await Promise.all([
    memberNames(
      supabase,
      tickets.map((tk) => tk.assignee_member_id)
    ),
    agentCategories(supabase, ctx, member).catch(() => []),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={s.title}
        subtitle={s.subtitle}
        aside={
          deskCats.length > 0 ? (
            <Link href={`${NRS_BASE}/desk/support`} className={secondaryButtonClass}>
              {desk.support.title}
            </Link>
          ) : undefined
        }
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card labelledBy="nrs-new-ticket" className="self-start">
          <SectionTitle id="nrs-new-ticket">{s.newTicket}</SectionTitle>
          <NewTicketForm prefill={prefill} />
        </Card>

        <div className="flex flex-col gap-4 min-w-0">
          <Card labelledBy="nrs-my-tickets">
            <SectionTitle id="nrs-my-tickets">{s.myTickets}</SectionTitle>
            {tickets.length === 0 ? (
              <EmptyLine>{s.ticketsEmpty}</EmptyLine>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {tickets.map((tk) => (
                  <li key={tk.id}>
                    <Link
                      href={`/tools/nr-synergy/help/${tk.id}`}
                      className="flex items-center justify-between gap-2 py-2.5 px-1 -mx-1 rounded-sm hover:bg-page focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <span className="min-w-0">
                        <span className="block text-[13px] font-bold text-ink break-words">{tk.title}</span>
                        <span className="block text-[11.5px] text-ink-muted">
                          {s.categories[tk.category]} · {fill(s.openedOn, { date: fmtDate(tk.created_at) })}
                          {" · "}
                          {tk.assignee_member_id && names.get(tk.assignee_member_id)
                            ? fill(desk.help.assignee, { name: names.get(tk.assignee_member_id) ?? "" })
                            : desk.help.notAssigned}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <Pill tone={TICKET_TONE[tk.status]}>{desk.ticketStatus[tk.status]}</Pill>
                        {tk.priority !== "normal" && <Pill tone={PRIORITY_TONE[tk.priority]}>{desk.priority[tk.priority]}</Pill>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card labelledBy="nrs-my-assets">
            <SectionTitle id="nrs-my-assets">{s.myAssets}</SectionTitle>
            {assets.length === 0 ? (
              <EmptyLine>{s.assetsEmpty}</EmptyLine>
            ) : (
              <>
                {currentAssets.length === 0 ? (
                  <EmptyLine>{s.assetsEmpty}</EmptyLine>
                ) : (
                  <AssetList assets={currentAssets} />
                )}
                {pastAssets.length > 0 && (
                  <>
                    <h3 className="mt-3 mb-1 text-[11.5px] font-bold uppercase tracking-wide text-ink-muted">{desk.help.assetsHistory}</h3>
                    <AssetList assets={pastAssets} />
                  </>
                )}
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function AssetList({ assets }: { assets: AssetRow[] }) {
  return (
    <ul className="flex flex-col divide-y divide-border">
      {assets.map((a) => (
        <li key={a.id} className="py-2.5 flex items-center justify-between gap-2">
          <span className="min-w-0">
            <span className={`block text-[13px] font-bold break-words ${a.status === "returned" ? "text-ink-2" : "text-ink"}`}>
              {s.assetKind[a.kind]}
              {a.model ? ` · ${a.model}` : ""}
            </span>
            <span className="block text-[11.5px] text-ink-muted break-words">
              {[
                a.serial ? fill(s.serial, { serial: a.serial }) : null,
                a.issued_on ? fill(s.issuedOn, { date: fmtDate(a.issued_on) }) : null,
                a.returned_on ? fill(desk.help.returnedOn, { date: fmtDate(a.returned_on) }) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
          <Pill tone={a.status === "issued" ? "good" : a.status === "lost" ? "critical" : "neutral"}>{s.assetStatus[a.status]}</Pill>
        </li>
      ))}
    </ul>
  );
}
