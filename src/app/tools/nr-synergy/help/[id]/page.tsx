import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { help as s } from "@/lib/nrs/i18n/en/help";
import NrsState from "../../_components/NrsState";
import { gatePage } from "../../_home/gate";
import { isUuid, memberNames, memberTimezone } from "../../_home/server";
import { Card, EmptyLine, Pill, SectionTitle, fill, fmtDate, fmtDateTime, linkClass } from "../../_home/ui";
import { TICKET_COLUMNS, TICKET_TONE, type TicketRow } from "../_lib";
import ReplyForm from "./ReplyForm";

interface MessageRow {
  id: string;
  member_id: string;
  body: string;
  created_at: string;
}

export default async function NrSynergyTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const gate = await gatePage("help");
  if (!gate.ok) return gate.node;
  const { member } = gate;
  const { id } = await params;

  const back = (
    <Link href="/tools/nr-synergy/help" className={`${linkClass} text-[12.5px] self-start`}>
      ← {s.back}
    </Link>
  );
  const notFound = (
    <div className="flex flex-col">
      {back}
      <NrsState icon="headset" title={s.notFound} />
    </div>
  );
  if (!isUuid(id)) return notFound;

  const supabase = await createClient();
  const { data: tData, error: tErr } = await supabase
    .from("nrs_tickets")
    .select(TICKET_COLUMNS)
    .eq("id", id)
    .eq("org_id", member.org_id)
    .maybeSingle();
  if (tErr) throw new Error(tErr.message);
  const ticket = tData as TicketRow | null;
  if (!ticket) return notFound;

  const { data: mData, error: mErr } = await supabase
    .from("nrs_ticket_messages")
    .select("id, member_id, body, created_at")
    .eq("ticket_id", ticket.id)
    .order("created_at", { ascending: true });
  if (mErr) throw new Error(mErr.message);
  const messages = (mData ?? []) as MessageRow[];
  const [names, tz] = await Promise.all([
    memberNames(supabase, [ticket.member_id, ticket.assignee_member_id, ...messages.map((m) => m.member_id)]),
    memberTimezone(supabase, member),
  ]);
  const closed = ticket.status === "closed";

  return (
    <div className="flex flex-col gap-4 max-w-[820px]">
      {back}
      <Card className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="text-[19px] sm:text-[22px] font-bold text-ink tracking-tight break-words min-w-0">{ticket.title}</h1>
          <Pill tone={TICKET_TONE[ticket.status]}>{s.status[ticket.status]}</Pill>
        </div>
        <p className="text-[12px] text-ink-muted">
          {s.categories[ticket.category]} · {fill(s.openedOn, { date: fmtDate(ticket.created_at, tz) })}
          {ticket.member_id !== member.id ? ` · ${names.get(ticket.member_id) ?? ""}` : ""}
        </p>
        {ticket.description && <p className="text-[13px] text-ink-2 whitespace-pre-line break-words">{ticket.description}</p>}
      </Card>

      <Card labelledBy="nrs-thread">
        <SectionTitle id="nrs-thread">{s.thread}</SectionTitle>
        {messages.length === 0 ? (
          <EmptyLine>{s.threadEmpty}</EmptyLine>
        ) : (
          <ol className="flex flex-col gap-2.5 mb-4">
            {messages.map((m) => {
              const mine = m.member_id === member.id;
              return (
                <li
                  key={m.id}
                  className={`max-w-[92%] sm:max-w-[80%] rounded-md px-3 py-2 ${mine ? "self-end bg-brand-wash" : "self-start bg-page"}`}
                >
                  <p className="text-[11.5px] font-bold text-ink-2">
                    {names.get(m.member_id) ?? ""} · <time dateTime={m.created_at}>{fmtDateTime(m.created_at, tz)}</time>
                  </p>
                  <p className="text-[13px] text-ink whitespace-pre-line break-words">{m.body}</p>
                </li>
              );
            })}
          </ol>
        )}
        {closed ? <p className="text-[12.5px] text-ink-muted">{s.closedNote}</p> : <ReplyForm ticketId={ticket.id} />}
      </Card>
    </div>
  );
}
