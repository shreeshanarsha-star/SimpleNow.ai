import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { help as s } from "@/lib/nrs/i18n/en/help";
import { gatePage } from "../_home/gate";
import { Card, EmptyLine, PageHeader, Pill, SectionTitle, fill, fmtDate } from "../_home/ui";
import { TICKET_COLUMNS, TICKET_TONE, type TicketRow } from "./_lib";
import NewTicketForm from "./NewTicketForm";

interface AssetRow {
  id: string;
  kind: "laptop" | "phone" | "sim" | "other";
  model: string | null;
  serial: string | null;
  status: "in_stock" | "issued" | "returned" | "lost";
  issued_on: string | null;
}

export default async function NrSynergyHelpPage() {
  const gate = await gatePage("help");
  if (!gate.ok) return gate.node;
  const { member } = gate;
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
      .select("id, kind, model, serial, status, issued_on")
      .eq("assigned_member_id", member.id)
      .order("issued_on", { ascending: false, nullsFirst: false }),
  ]);
  if (ticketsRes.error) throw new Error(ticketsRes.error.message);
  if (assetsRes.error) throw new Error(assetsRes.error.message);
  const tickets = (ticketsRes.data ?? []) as TicketRow[];
  const assets = (assetsRes.data ?? []) as AssetRow[];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={s.title} subtitle={s.subtitle} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card labelledBy="nrs-new-ticket" className="self-start">
          <SectionTitle id="nrs-new-ticket">{s.newTicket}</SectionTitle>
          <NewTicketForm />
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
                        </span>
                      </span>
                      <Pill tone={TICKET_TONE[tk.status]}>{s.status[tk.status]}</Pill>
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
              <ul className="flex flex-col divide-y divide-border">
                {assets.map((a) => (
                  <li key={a.id} className="py-2.5 flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block text-[13px] font-bold text-ink break-words">
                        {s.assetKind[a.kind]}
                        {a.model ? ` · ${a.model}` : ""}
                      </span>
                      <span className="block text-[11.5px] text-ink-muted break-words">
                        {[a.serial ? fill(s.serial, { serial: a.serial }) : null, a.issued_on ? fill(s.issuedOn, { date: fmtDate(a.issued_on) }) : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <Pill tone={a.status === "issued" ? "good" : a.status === "lost" ? "critical" : "neutral"}>
                      {s.assetStatus[a.status]}
                    </Pill>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
