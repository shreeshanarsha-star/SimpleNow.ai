"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import Icon from "@/components/Icon";
import { desk } from "@/lib/nrs/i18n/en/desk";
import { api, errorText, useLoad } from "../../money/_components/ui";
import { ErrorLine, Pill, Skeleton, fill, fmtDate, fmtDateTime, inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from "../../_home/ui";
import {
  ACTIVE_STATUSES,
  PRIORITY_TONE,
  SLA_HOURS,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_TONE,
  slaState,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
} from "../../help/_lib";
import type { AssignedFilter, DeskQueue, DeskTicket, DeskTicketDetail } from "./_types";

const s = desk.support;

interface Filters {
  status: "active" | "all" | TicketStatus;
  category: "" | TicketCategory;
  priority: "" | TicketPriority;
  assigned: AssignedFilter;
}
const DEFAULT_FILTERS: Filters = { status: "active", category: "", priority: "", assigned: "all" };

function queueUrl(f: Filters, q: string): string {
  const p = new URLSearchParams();
  p.set("status", f.status);
  if (f.category) p.set("category", f.category);
  if (f.priority) p.set("priority", f.priority);
  p.set("assigned", f.assigned);
  if (q) p.set("q", q);
  return `/api/nr-synergy/desk/support/tickets?${p.toString()}`;
}

function setTicketParam(id: string | null) {
  try {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("ticket", id);
    else url.searchParams.delete("ticket");
    window.history.replaceState(window.history.state, "", url.toString());
  } catch {
    // URL sync is a convenience only
  }
}

function SlaBadge({ ticket }: { ticket: Pick<DeskTicket, "created_at" | "priority" | "status"> }) {
  if (!(ACTIVE_STATUSES as readonly string[]).includes(ticket.status)) return null;
  const st = slaState(ticket.created_at, ticket.priority);
  const hours = SLA_HOURS[ticket.priority];
  const target = hours >= 48 ? `${hours / 24}d` : `${hours}h`;
  return (
    <span title={fill(s.slaHint, { priority: desk.priority[ticket.priority].toLowerCase(), target })}>
      <Pill tone={st.tone}>
        <Icon name="clock" className="w-3 h-3" />
        {fill(st.overdue ? s.overdue : s.age, { age: st.age })}
      </Pill>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

export default function SupportDesk({ categories, initialTicket }: { categories: TicketCategory[]; initialTicket: string | null }) {
  const uid = useId();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(initialTicket);

  useEffect(() => {
    const h = setTimeout(() => setQ(qInput.trim()), 300);
    return () => clearTimeout(h);
  }, [qInput]);

  const url = queueUrl(filters, q);
  const queue = useLoad(() => api<DeskQueue>(url), [url]);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((p) => ({ ...p, [k]: v }));
  const filtered = filters.status !== "active" || !!filters.category || !!filters.priority || filters.assigned !== "all" || !!q;

  const open = useCallback((id: string | null) => {
    setOpenId(id);
    setTicketParam(id);
  }, []);

  const tickets = queue.data?.tickets ?? [];
  const showCategory = categories.length > 1;

  return (
    <div className="flex flex-col gap-3 min-w-0">
      <section aria-labelledby={`${uid}-filters`} className="bg-surface border border-border rounded-md p-3 sm:p-4">
        <h2 id={`${uid}-filters`} className="sr-only">
          {s.filters}
        </h2>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <label htmlFor={`${uid}-q`} className={labelClass}>
              {s.search}
            </label>
            <input
              id={`${uid}-q`}
              type="search"
              className={inputClass}
              placeholder={s.searchPlaceholder}
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor={`${uid}-status`} className={labelClass}>
              {s.status}
            </label>
            <select id={`${uid}-status`} className={inputClass} value={filters.status} onChange={(e) => set("status", e.target.value as Filters["status"])}>
              <option value="active">{s.allStatuses}</option>
              <option value="all">{s.allStatusesEverything}</option>
              {TICKET_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {desk.agentStatus[st]}
                </option>
              ))}
            </select>
          </div>
          {showCategory && (
            <div>
              <label htmlFor={`${uid}-cat`} className={labelClass}>
                {s.category}
              </label>
              <select id={`${uid}-cat`} className={inputClass} value={filters.category} onChange={(e) => set("category", e.target.value as Filters["category"])}>
                <option value="">{s.allCategories}</option>
                {TICKET_CATEGORIES.filter((c) => categories.includes(c)).map((c) => (
                  <option key={c} value={c}>
                    {desk.categories[c]}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label htmlFor={`${uid}-pri`} className={labelClass}>
              {s.priority}
            </label>
            <select id={`${uid}-pri`} className={inputClass} value={filters.priority} onChange={(e) => set("priority", e.target.value as Filters["priority"])}>
              <option value="">{s.allPriorities}</option>
              {[...TICKET_PRIORITIES].reverse().map((p) => (
                <option key={p} value={p}>
                  {desk.priority[p]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${uid}-asg`} className={labelClass}>
              {s.assigned}
            </label>
            <select id={`${uid}-asg`} className={inputClass} value={filters.assigned} onChange={(e) => set("assigned", e.target.value as AssignedFilter)}>
              <option value="all">{s.assignedAll}</option>
              <option value="me">{s.assignedMe}</option>
              <option value="unassigned">{s.assignedUnassigned}</option>
            </select>
          </div>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          <p role="status" aria-live="polite" className="text-[12px] text-ink-muted">
            {queue.data ? (tickets.length === 1 ? s.countOne : fill(s.count, { n: tickets.length })) : ""}
          </p>
          {filtered && (
            <button
              type="button"
              className="text-[12px] font-bold text-brand-dark hover:underline rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              onClick={() => {
                setFilters(DEFAULT_FILTERS);
                setQInput("");
                setQ("");
              }}
            >
              {s.clear}
            </button>
          )}
        </div>
      </section>

      <section aria-label={s.queueLabel} aria-busy={queue.loading} className="min-w-0">
        {queue.loading && !queue.data ? (
          <div role="status" className="bg-surface border border-border rounded-md p-4 flex flex-col gap-4">
            <span className="sr-only">{s.loading}</span>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} lines={2} />
            ))}
          </div>
        ) : queue.error ? (
          <div role="alert" className="bg-surface border border-border rounded-md p-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12.5px] text-critical">
              {s.error} {queue.error}
            </p>
            <button type="button" className={secondaryButtonClass} onClick={() => void queue.reload()}>
              {s.retry}
            </button>
          </div>
        ) : tickets.length === 0 ? (
          <div className="bg-surface border border-border rounded-md py-12 px-4 flex flex-col items-center text-center gap-2">
            <span className="w-11 h-11 rounded-full bg-brand-wash text-brand flex items-center justify-center">
              <Icon name={filtered ? "filter" : "check"} className="w-5 h-5" />
            </span>
            <p className="text-[14px] font-bold text-ink">{filtered ? s.emptyTitle : s.queueEmptyTitle}</p>
            <p className="text-[12.5px] text-ink-muted max-w-[360px]">{filtered ? s.emptyBody : s.queueEmptyBody}</p>
          </div>
        ) : (
          <ul className={`flex flex-col gap-2 transition-opacity ${queue.loading ? "opacity-60" : ""}`}>
            {tickets.map((t) => (
              <li key={t.id}>
                <QueueRow ticket={t} me={queue.data?.me ?? ""} active={openId === t.id} showCategory={showCategory} onOpen={() => open(t.id)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <TicketDrawer
        id={openId}
        onClose={() => open(null)}
        onChanged={() => {
          void queue.reload();
        }}
      />
    </div>
  );
}

function QueueRow({
  ticket: t,
  me,
  active,
  showCategory,
  onOpen,
}: {
  ticket: DeskTicket;
  me: string;
  active: boolean;
  showCategory: boolean;
  onOpen: () => void;
}) {
  const urgentEdge = t.priority === "urgent" ? "border-l-critical" : t.priority === "high" ? "border-l-warning" : "border-l-transparent";
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={fill(s.openTicket, { title: t.title })}
      aria-current={active || undefined}
      className={`w-full text-left bg-surface border border-border border-l-4 ${urgentEdge} rounded-md px-3.5 py-3 hover:bg-page transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
        active ? "ring-2 ring-brand/40" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-bold text-ink break-words">{t.title}</p>
          <p className="mt-0.5 text-[11.5px] text-ink-muted break-words">
            {[showCategory ? desk.categories[t.category] : null, t.requester_name, fill(s.opened, { date: fmtDate(t.created_at) })]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <SlaBadge ticket={t} />
          {t.priority !== "normal" && <Pill tone={PRIORITY_TONE[t.priority]}>{desk.priority[t.priority]}</Pill>}
          <Pill tone={TICKET_TONE[t.status]}>{desk.agentStatus[t.status]}</Pill>
        </div>
      </div>
      <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-ink-2">
        <span
          aria-hidden="true"
          className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
            t.assignee_name ? "bg-brand-wash text-brand-dark" : "bg-page text-ink-muted border border-dashed border-border"
          }`}
        >
          {t.assignee_name ? t.assignee_name.charAt(0).toUpperCase() : "?"}
        </span>
        <span className="sr-only">{s.assignee}: </span>
        {t.assignee_name ? (
          <span>
            {t.assignee_name}
            {t.assignee_member_id === me ? ` (${s.youTag})` : ""}
          </span>
        ) : (
          <span className="text-ink-muted">{s.unassigned}</span>
        )}
      </p>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Ticket drawer
// ---------------------------------------------------------------------------

function TicketDrawer({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (id && !d.open) d.showModal();
    if (!id && d.open) d.close();
  }, [id]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose(); // backdrop click
      }}
      className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-[640px] border-0 border-l border-border bg-page p-0 text-ink shadow-xl backdrop:bg-black/40"
    >
      {id && <DrawerBody key={id} id={id} titleId={titleId} onClose={onClose} onChanged={onChanged} />}
    </dialog>
  );
}

function DrawerBody({ id, titleId, onClose, onChanged }: { id: string; titleId: string; onClose: () => void; onChanged: () => void }) {
  const detail = useLoad(() => api<DeskTicketDetail>(`/api/nr-synergy/desk/support/tickets/${id}`), [id]);
  const d = detail.data;

  const reloadAll = useCallback(async () => {
    await detail.reload();
    onChanged();
    // detail.reload is stable (useCallback with [] inside useLoad)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onChanged]);

  return (
    <div className="flex h-full flex-col">
      <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-surface px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 id={titleId} className="text-[16px] sm:text-[17px] font-bold text-ink break-words">
            {d?.ticket.title ?? s.loadingTicket}
          </h2>
          {d && (
            <p className="mt-0.5 text-[11.5px] text-ink-muted break-words">
              {desk.categories[d.ticket.category]} · {d.ticket.requester_name} · {fill(s.opened, { date: fmtDateTime(d.ticket.created_at) })}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-sm text-ink-2 hover:bg-page focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          aria-label={s.close}
        >
          <Icon name="x" className="w-5 h-5" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5 flex flex-col gap-4">
        {detail.loading && !d ? (
          <div role="status" className="flex flex-col gap-4">
            <span className="sr-only">{s.loadingTicket}</span>
            <Skeleton lines={3} />
            <Skeleton lines={4} />
          </div>
        ) : detail.error || !d ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-critical-wash px-3 py-2">
            <p className="text-[12.5px] text-critical">{detail.error ?? s.error}</p>
            <button type="button" className={secondaryButtonClass} onClick={() => void detail.reload()}>
              {s.retry}
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <Pill tone={TICKET_TONE[d.ticket.status]}>{desk.agentStatus[d.ticket.status]}</Pill>
              <Pill tone={PRIORITY_TONE[d.ticket.priority]}>{desk.priority[d.ticket.priority]}</Pill>
              <SlaBadge ticket={d.ticket} />
            </div>
            <ManagePanel detail={d} onSaved={reloadAll} />
            <section aria-labelledby={`${titleId}-details`} className="rounded-md border border-border bg-surface p-4">
              <h3 id={`${titleId}-details`} className="text-[12px] font-bold uppercase tracking-wide text-ink-muted mb-1.5">
                {s.details}
              </h3>
              <p className="text-[13px] text-ink-2 whitespace-pre-line break-words">{d.ticket.description || s.noDescription}</p>
            </section>
            <Thread detail={d} titleId={titleId} />
            <Composer detail={d} onSent={reloadAll} />
          </>
        )}
      </div>
    </div>
  );
}

function ManagePanel({ detail, onSaved }: { detail: DeskTicketDetail; onSaved: () => Promise<void> }) {
  const uid = useId();
  const t = detail.ticket;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await api(`/api/nr-synergy/desk/support/tickets/${t.id}`, { method: "PATCH", body: JSON.stringify(body) });
      setMsg(s.saved);
      await onSaved();
    } catch (e) {
      setError(errorText(e, s.error));
    } finally {
      setBusy(false);
    }
  };

  const agents = detail.agents;
  const assigneeKnown = !t.assignee_member_id || agents.some((a) => a.id === t.assignee_member_id);

  return (
    <section aria-labelledby={`${uid}-manage`} aria-busy={busy} className="rounded-md border border-border bg-surface p-4">
      <h3 id={`${uid}-manage`} className="text-[12px] font-bold uppercase tracking-wide text-ink-muted mb-2.5">
        {s.manage}
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${uid}-status`} className={labelClass}>
            {s.status}
          </label>
          <select
            id={`${uid}-status`}
            className={inputClass}
            value={t.status}
            disabled={busy}
            onChange={(e) => void patch({ status: e.target.value })}
          >
            {TICKET_STATUSES.map((st) => (
              <option key={st} value={st}>
                {desk.agentStatus[st]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${uid}-pri`} className={labelClass}>
            {s.priority}
          </label>
          <select
            id={`${uid}-pri`}
            className={inputClass}
            value={t.priority}
            disabled={busy}
            onChange={(e) => void patch({ priority: e.target.value })}
          >
            {TICKET_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {desk.priority[p]}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${uid}-asg`} className={labelClass}>
            {s.assignTo}
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              id={`${uid}-asg`}
              className={inputClass}
              value={t.assignee_member_id ?? ""}
              disabled={busy}
              onChange={(e) => void patch({ assignee: e.target.value || null })}
            >
              <option value="">{s.assignNone}</option>
              {!assigneeKnown && t.assignee_member_id && <option value={t.assignee_member_id}>{t.assignee_name ?? "—"}</option>}
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.full_name}
                  {a.id === detail.me ? ` (${s.youTag})` : ""}
                </option>
              ))}
            </select>
            {t.assignee_member_id !== detail.me && agents.some((a) => a.id === detail.me) && (
              <button type="button" className={`${secondaryButtonClass} shrink-0`} disabled={busy} onClick={() => void patch({ assignee: "me" })}>
                {s.assignMe}
              </button>
            )}
          </div>
          {agents.length === 0 && <p className="mt-1 text-[11.5px] text-ink-muted">{s.noAgents}</p>}
        </div>
      </div>
      <p role="status" aria-live="polite" className="mt-2 min-h-[1em] text-[12px] text-good-text">
        {busy ? s.saving : msg ?? ""}
      </p>
      {error && <ErrorLine>{error}</ErrorLine>}
    </section>
  );
}

function Thread({ detail, titleId }: { detail: DeskTicketDetail; titleId: string }) {
  const requester = detail.ticket.member_id;
  return (
    <section aria-labelledby={`${titleId}-thread`} className="rounded-md border border-border bg-surface p-4">
      <h3 id={`${titleId}-thread`} className="text-[12px] font-bold uppercase tracking-wide text-ink-muted mb-2.5">
        {s.thread}
      </h3>
      {detail.messages.length === 0 ? (
        <p className="text-[12.5px] text-ink-muted py-1">{s.threadEmpty}</p>
      ) : (
        <ol className="flex flex-col gap-2.5">
          {detail.messages.map((m) => {
            const fromRequester = m.member_id === requester;
            const tone = m.internal
              ? "self-stretch bg-warning-wash border border-dashed border-warning"
              : fromRequester
                ? "self-start bg-page"
                : "self-end bg-brand-wash";
            return (
              <li key={m.id} className={`max-w-full sm:max-w-[85%] rounded-md px-3 py-2 ${tone}`}>
                <p className="flex flex-wrap items-center gap-1.5 text-[11.5px] font-bold text-ink-2">
                  {m.internal && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-surface px-1.5 py-0.5 text-[10.5px] text-[#7a5200]">
                      <Icon name="edit" className="w-3 h-3" />
                      {s.internalTag}
                    </span>
                  )}
                  <span>
                    {m.author_name}
                    {m.member_id === detail.me ? ` (${s.youTag})` : ""}
                  </span>
                  <span aria-hidden="true">·</span>
                  <time dateTime={m.created_at} className="font-normal text-ink-muted">
                    {fmtDateTime(m.created_at)}
                  </time>
                </p>
                <p className="mt-0.5 text-[13px] text-ink whitespace-pre-line break-words">{m.body}</p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function Composer({ detail, onSent }: { detail: DeskTicketDetail; onSent: () => Promise<void> }) {
  const uid = useId();
  const closed = detail.ticket.status === "closed";
  const [mode, setMode] = useState<"reply" | "note">(closed ? "note" : "reply");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const internal = mode === "note";

  const modes = useMemo(
    () => [
      { key: "reply" as const, label: s.modeReply, disabled: closed },
      { key: "note" as const, label: s.modeNote, disabled: false },
    ],
    [closed]
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await api(`/api/nr-synergy/desk/support/tickets/${detail.ticket.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ body, internal }),
      });
      setBody("");
      setDone(true);
      await onSent();
    } catch (err) {
      setError(errorText(err, s.error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className={`sticky bottom-0 rounded-md border p-3 sm:p-4 shadow-soft-sm ${internal ? "border-warning bg-warning-wash" : "border-border bg-surface"}`}
    >
      <fieldset className="mb-2">
        <legend className="sr-only">{s.replyMode}</legend>
        <div className="inline-flex rounded-sm border border-border bg-surface p-0.5">
          {modes.map((m) => (
            <label
              key={m.key}
              className={`cursor-pointer rounded-[3px] px-3 py-1 text-[12px] font-bold focus-within:ring-2 focus-within:ring-brand ${
                mode === m.key ? (m.key === "note" ? "bg-warning-wash text-[#7a5200]" : "bg-brand text-white") : "text-ink-2 hover:bg-page"
              } ${m.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <input
                type="radio"
                name={`${uid}-mode`}
                value={m.key}
                className="sr-only"
                checked={mode === m.key}
                disabled={m.disabled}
                onChange={() => setMode(m.key)}
              />
              {m.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label htmlFor={`${uid}-body`} className="sr-only">
        {internal ? s.noteLabel : s.replyLabel}
      </label>
      <textarea
        id={`${uid}-body`}
        rows={3}
        maxLength={4000}
        className={inputClass}
        aria-describedby={internal ? `${uid}-hint` : undefined}
        placeholder={internal ? s.notePlaceholder : s.replyPlaceholder}
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          setDone(false);
        }}
      />
      {internal && (
        <p id={`${uid}-hint`} className="mt-1 text-[11.5px] text-[#7a5200]">
          {s.internalHint}
        </p>
      )}
      {closed && <p className="mt-1 text-[11.5px] text-ink-muted">{s.closedNote}</p>}
      {error && (
        <div className="mt-2">
          <ErrorLine>{error}</ErrorLine>
        </div>
      )}
      <div className="mt-2 flex items-center gap-3">
        <button type="submit" className={primaryButtonClass} disabled={busy || !body.trim()}>
          {busy ? s.sending : internal ? s.addNote : s.send}
        </button>
        <span role="status" aria-live="polite" className="text-[12px] text-good-text">
          {done ? s.sent : ""}
        </span>
      </div>
    </form>
  );
}
