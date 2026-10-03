"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import { formatMoney } from "@/lib/nrs/money";
import { travel as s, fillTravel as fill } from "@/lib/nrs/i18n/en/travel";
import type { BookingDto, BookingType, ChainStepDto, TravelRequestStatus } from "../_lib/types";

// Shared travel UI: status badge, approval/booking progress and booking list.
// Used by Money › Travel (traveller) and the travel desk.

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = iso.length === 10 ? new Date(`${iso}T00:00:00Z`) : new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: iso.length === 10 ? "UTC" : undefined }).format(d);
}

export function money(minor: number | null, currency: string | null): string | null {
  if (minor == null || !currency) return null;
  try {
    return formatMoney(minor, currency);
  } catch {
    return `${minor} ${currency}`;
  }
}

const STATUS_TONE: Record<TravelRequestStatus, string> = {
  pending: "bg-warning-wash text-ink",
  approved: "bg-brand-wash text-brand-dark",
  booked: "bg-good-wash text-good-text",
  rejected: "bg-critical-wash text-critical",
  sent_back: "bg-warning-wash text-ink",
  cancelled: "bg-page text-ink-muted",
};

export function TravelStatusBadge({ status }: { status: TravelRequestStatus }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_TONE[status] ?? "bg-page text-ink-2"}`}>
      {s.status[status] ?? status}
    </span>
  );
}

type Tone = "done" | "current" | "todo" | "stopped";

function stepLabel(st: ChainStepDto): string {
  if (st.approver_type === "manager") return s.chain.manager;
  if (st.approver_type === "role") return s.chain.roles[st.approver_role ?? ""] ?? s.chain.member;
  return st.approver_name ?? s.chain.member;
}

function toneOf(status: string): Tone {
  if (status === "approved") return "done";
  if (status === "pending") return "current";
  if (status === "rejected" || status === "sent_back") return "stopped";
  return "todo";
}

const DOT: Record<Tone, string> = {
  done: "bg-good text-white border-good",
  current: "bg-surface text-brand-dark border-brand ring-2 ring-brand/25",
  todo: "bg-surface text-ink-muted border-border",
  stopped: "bg-critical text-white border-critical",
};

/** Submitted → approval steps → Booked. Vertical on phones, horizontal from sm. */
export function TravelProgress({
  status,
  chain,
  createdAt,
  bookedAt,
  bookedBy,
}: {
  status: TravelRequestStatus;
  chain: ChainStepDto[];
  createdAt: string;
  bookedAt: string | null;
  bookedBy: string | null;
}) {
  const ended = status === "rejected" || status === "sent_back" || status === "cancelled";
  const items: { key: string; label: string; tone: Tone; state: string; sub: string | null; comment: string | null }[] = [
    { key: "sub", label: s.chain.submitted, tone: "done", state: s.chain.stepStatus.done, sub: shortDate(createdAt), comment: null },
    ...chain.map((st) => {
      const tone = toneOf(st.status);
      const who = st.decided_by ?? (st.approver_type !== "role" ? st.approver_name : null);
      return {
        key: `s${st.step_no}`,
        label: stepLabel(st),
        tone,
        state: s.chain.stepStatus[st.status] ?? st.status,
        sub: [who && tone !== "todo" ? fill(s.chain.by, { name: who }) : null, st.decided_at ? shortDate(st.decided_at) : null]
          .filter(Boolean)
          .join(" · ") || null,
        comment: st.comment,
      };
    }),
    {
      key: "booked",
      label: s.chain.booked,
      tone: status === "booked" ? "done" : status === "approved" ? "current" : "todo",
      state: status === "booked" ? s.chain.stepStatus.done : status === "approved" ? s.chain.stepStatus.pending : ended ? s.chain.stepStatus.skipped : s.chain.stepStatus.waiting,
      sub: status === "booked" ? [bookedBy ? fill(s.chain.by, { name: bookedBy }) : null, shortDate(bookedAt)].filter(Boolean).join(" · ") : null,
      comment: null,
    },
  ];

  return (
    <ol aria-label={s.chain.label} className="flex flex-col sm:flex-row sm:flex-wrap gap-y-2 sm:gap-y-3">
      {items.map((it, i) => (
        <li key={it.key} className="relative flex sm:flex-1 sm:min-w-[110px] gap-2.5 sm:flex-col sm:gap-1.5 pl-0">
          <div className="flex sm:flex-row flex-col items-center sm:w-full">
            <span
              className={`relative z-[1] flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${DOT[it.tone]} ${
                ended && it.tone === "todo" ? "opacity-50" : ""
              }`}
              aria-hidden
            >
              {it.tone === "done" ? <Icon name="check" className="h-3 w-3" /> : it.tone === "stopped" ? <Icon name="x" className="h-3 w-3" /> : i}
            </span>
            {i < items.length - 1 && (
              <span
                className={`${it.tone === "done" ? "bg-good" : "bg-border"} w-px flex-1 min-h-[14px] sm:h-px sm:w-auto sm:min-h-0 sm:flex-1 sm:mx-1`}
                aria-hidden
              />
            )}
          </div>
          <div className="min-w-0 pb-1 sm:pr-2">
            <p className="text-[12px] font-bold text-ink leading-tight">
              {it.label} <span className="sr-only">: {it.state}</span>
            </p>
            <p className={`text-[11px] leading-tight ${it.tone === "stopped" ? "text-critical font-semibold" : "text-ink-muted"}`} aria-hidden>
              {it.state}
            </p>
            {it.sub && <p className="text-[11px] text-ink-muted leading-tight">{it.sub}</p>}
            {it.comment && <p className="mt-0.5 text-[11px] italic text-ink-2 break-words">{fill(s.chain.comment, { text: it.comment })}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

const TYPE_ICON: Record<BookingType, string> = { flight: "globe", hotel: "home", car: "truck", other: "tag" };

async function fetchSignedUrl(endpoint: string): Promise<string> {
  const res = await fetch(endpoint, { cache: "no-store" });
  const body: unknown = await res.json().catch(() => null);
  const url = body && typeof body === "object" && typeof (body as { url?: unknown }).url === "string" ? (body as { url: string }).url : null;
  if (!res.ok || !url) {
    const msg = body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string" ? (body as { error: string }).error : null;
    throw new Error(msg ?? s.fileFailed);
  }
  return url;
}

function FileButton({ endpoint }: { endpoint: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = async () => {
    setBusy(true);
    setError(null);
    const win = window.open("", "_blank");
    if (win) win.opener = null;
    try {
      const url = await fetchSignedUrl(endpoint);
      if (win) win.location.href = url;
      else window.location.href = url;
    } catch (e) {
      win?.close();
      setError(e instanceof Error ? e.message : s.fileFailed);
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        onClick={() => void open()}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-sm px-2 py-1 text-[11.5px] font-bold text-brand-dark hover:bg-brand-wash focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
      >
        <Icon name="download" className="h-3.5 w-3.5" />
        {busy ? s.openingFile : s.openFile}
      </button>
      {error && (
        <span role="alert" className="text-[11px] text-critical">
          {error}
        </span>
      )}
    </span>
  );
}

export function BookingList({
  bookings,
  fileEndpoint,
  onRemove,
  removingId,
}: {
  bookings: BookingDto[];
  fileEndpoint: (bookingId: string) => string;
  onRemove?: (bookingId: string) => void;
  removingId?: string | null;
}) {
  if (!bookings.length) return <p className="text-[12px] text-ink-muted">{s.bookingsEmpty}</p>;
  return (
    <ul className="flex flex-col gap-2" aria-label={s.bookingsHeading}>
      {bookings.map((b) => {
        const amount = money(b.amount_minor, b.currency);
        const dates = b.ends_on && b.ends_on !== b.starts_on ? `${shortDate(b.starts_on)} – ${shortDate(b.ends_on)}` : shortDate(b.starts_on);
        return (
          <li key={b.id} className="flex items-start gap-3 rounded-md border border-border bg-page/60 px-3 py-2.5">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-wash text-brand-dark" aria-hidden>
              <Icon name={TYPE_ICON[b.type]} className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-bold text-ink break-words">
                {s.bookingTypes[b.type]} · {b.provider}
              </p>
              <p className="text-[11.5px] text-ink-2 break-words">
                {[b.from || b.to ? fill(s.route, { from: b.from ?? "—", to: b.to ?? "—" }) : null, dates].filter(Boolean).join(" · ")}
              </p>
              <p className="text-[11.5px] text-ink-muted break-words">
                {[b.reference ? fill(s.reference, { ref: b.reference }) : null, amount].filter(Boolean).join(" · ")}
              </p>
              {(b.has_file || onRemove) && (
                <div className="mt-1 flex flex-wrap items-center gap-1 -ml-2">
                  {b.has_file && <FileButton endpoint={fileEndpoint(b.id)} />}
                  {onRemove && (
                    <button
                      type="button"
                      onClick={() => onRemove(b.id)}
                      disabled={removingId === b.id}
                      className="inline-flex items-center gap-1 rounded-sm px-2 py-1 text-[11.5px] font-bold text-critical hover:bg-critical-wash focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
                    >
                      <Icon name="trash" className="h-3.5 w-3.5" />
                      {removingId === b.id ? s.desk.removing : s.desk.remove}
                      <span className="sr-only"> {`${s.bookingTypes[b.type]} ${b.provider}`}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
