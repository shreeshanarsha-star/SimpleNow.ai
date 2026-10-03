import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { help as s } from "@/lib/nrs/i18n/en/help";
import { desk } from "@/lib/nrs/i18n/en/desk";
import NrsState from "../../_components/NrsState";
import { gatePage } from "../../_home/gate";
import { isUuid, memberNames, memberTimezone } from "../../_home/server";
import { Card, EmptyLine, Pill, SectionTitle, fill, fmtDate, fmtDateTime, linkClass } from "../../_home/ui";
import { PRIORITY_TONE, TICKET_COLUMNS, TICKET_TONE, type TicketRow } from "../_lib";
import ReplyForm from "./ReplyForm";
import ReopenButton from "./ReopenButton";

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
    // Help is the requester's view: internal agent notes never show here.
    .eq("internal", false)
    .order("created_at", { ascending: true });
  if (mErr) throw new Error(mErr.message);
  const messages = (mData ?? []) as MessageRow[];
  const [names, tz] = await Promise.all([
    memberNames(supabase, [ticket.member_id, ticket.assignee_member_id, ...messages.map((m) => m.member_id)]),
    memberTimezone(supabase, member),
  ]);
  const closed = ticket.status === "closed";
  const resolved = ticket.status === "resolved";
  const isRequester = ticket.member_id === member.id;
  const assigneeName = ticket.assignee_member_id ? names.get(ticket.assignee_member_id) : undefined;

  return (
    <div className="flex flex-col gap-4 max-w-[820px]">
      {back}
      <Card className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="text-[19px] sm:text-[22px] font-bold text-ink tracking-tight break-words min-w-0">{ticket.title}</h1>
          <div className="flex flex-wrap items-center gap-1.5">
            {ticket.priority !== "normal" && (
              <Pill tone={PRIORITY_TONE[ticket.priority]}>{fill(desk.help.priorityLine, { priority: desk.priority[ticket.priority] })}</Pill>
            )}
            <Pill tone={TICKET_TONE[ticket.status]}>{desk.ticketStatus[ticket.status]}</Pill>
          </div>
        </div>
        <p className="text-[12px] text-ink-muted">
          {s.categories[ticket.category]} · {fill(s.openedOn, { date: fmtDate(ticket.created_at, tz) })}
          {!isRequester ? ` · ${names.get(ticket.member_id) ?? ""}` : ""}
          {" · "}
          {assigneeName ? fill(desk.help.assignee, { name: assigneeName }) : desk.help.notAssigned}
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
        {resolved && isRequester && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-page px-3 py-2.5">
            <p className="text-[12.5px] text-ink-2">
              <span className="font-bold text-ink">{desk.help.resolvedNote}</span> {desk.help.reopenHint}
            </p>
            <ReopenButton ticketId={ticket.id} />
          </div>
        )}
        {closed ? <p className="text-[12.5px] text-ink-muted">{s.closedNote}</p> : <ReplyForm ticketId={ticket.id} />}
      </Card>
    </div>
  );
}
