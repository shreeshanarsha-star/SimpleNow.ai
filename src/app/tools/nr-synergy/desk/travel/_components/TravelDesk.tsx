"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { travel as s, fillTravel as fill } from "@/lib/nrs/i18n/en/travel";
import { Button, COMMON_CURRENCIES, Field, Tabs, inputCls } from "../../../money/_components/ui";
import type { AwaitingItem, DeskData, DeskTrip } from "../_lib/server";
import { BOOKING_TYPES, type BookingType } from "../_lib/types";
import { BookingList, TravelProgress, TravelStatusBadge, money, shortDate } from "./TravelBits";

type TabKey = "awaiting" | "toBook" | "booked";

const MAX_FILE = 10 * 1024 * 1024;
const FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];

async function call(url: string, init: RequestInit): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { cache: "no-store", ...init });
    if (res.ok) return { ok: true };
    const body: unknown = await res.json().catch(() => null);
    const msg = body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string" ? (body as { error: string }).error : null;
    return { ok: false, error: msg ?? `Request failed (${res.status})` };
  } catch {
    return { ok: false, error: "Network error. Check your connection and try again." };
  }
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface px-4 py-10 text-center text-[12.5px] text-ink-muted">{text}</div>
  );
}

function TripHeader({ trip, extra }: { trip: DeskTrip; extra?: string | null }) {
  const est = money(trip.estimated_minor, trip.currency);
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-wide text-brand-dark">
          {[trip.traveller.name, trip.traveller.designation, trip.traveller.country].filter(Boolean).join(" · ")}
        </p>
        <h3 className="text-[15px] font-bold text-ink break-words">{trip.destination}</h3>
        <p className="text-[12px] text-ink-muted">
          {shortDate(trip.starts_on)} → {shortDate(trip.ends_on)}
          {extra ? ` · ${extra}` : ""}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <TravelStatusBadge status={trip.status} />
        {est && (
          <span className="text-[12.5px] font-bold text-ink tabular-nums">
            <span className="sr-only">{s.desk.estimate}: </span>
            {est}
          </span>
        )}
      </div>
    </div>
  );
}

const cardCls = "rounded-lg border border-border bg-surface p-4 shadow-sm flex flex-col gap-3 min-w-0";

// ---------------------------------------------------------------------------
// Awaiting my approval
// ---------------------------------------------------------------------------

function ApprovalCard({ item, canApprove }: { item: AwaitingItem; canApprove: boolean }) {
  const router = useRouter();
  const ids = useId();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const { trip } = item;

  const act = async (decision: "approve" | "reject" | "send_back") => {
    setError(null);
    if (decision !== "approve" && !comment.trim()) {
      setError(s.desk.commentRequired);
      return;
    }
    setBusy(decision);
    const res = await call("/api/nr-synergy/approvals/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stepId: item.stepId, decision, comment: comment.trim() || null }),
    });
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDone(true);
    router.refresh();
  };

  return (
    <article className={cardCls} aria-labelledby={`${ids}-t`}>
      <div id={`${ids}-t`}>
        <TripHeader trip={trip} extra={fill(s.desk.step, { n: item.stepNo })} />
      </div>
      <dl className="grid grid-cols-[minmax(80px,auto)_1fr] gap-x-3 gap-y-1 rounded-md bg-page px-3 py-2 text-[12.5px]">
        <dt className="text-ink-muted">{s.desk.purpose}</dt>
        <dd className="text-ink whitespace-pre-line break-words min-w-0">{trip.purpose}</dd>
        <dt className="text-ink-muted">{s.desk.dates}</dt>
        <dd className="text-ink">{fill(s.desk.submittedOn, { date: shortDate(trip.created_at) })}</dd>
      </dl>
      <TravelProgress status={trip.status} chain={trip.chain} createdAt={trip.created_at} bookedAt={trip.booked_at} bookedBy={trip.booked_by_name} />
      {done ? (
        <p role="status" className="text-[12.5px] font-semibold text-good-text">
          {s.desk.decided}
        </p>
      ) : canApprove ? (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] font-semibold text-ink-muted">
              {s.desk.commentLabel} <span className="font-normal">({s.desk.commentHint})</span>
            </span>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} maxLength={2000} className={inputCls} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" busy={busy === "approve"} disabled={busy !== null} onClick={() => void act("approve")}>
              {busy === "approve" ? s.desk.deciding : s.desk.approve}
            </Button>
            <Button busy={busy === "send_back"} disabled={busy !== null} onClick={() => void act("send_back")}>
              {busy === "send_back" ? s.desk.deciding : s.desk.sendBack}
            </Button>
            <Button variant="danger" busy={busy === "reject"} disabled={busy !== null} onClick={() => void act("reject")}>
              {busy === "reject" ? s.desk.deciding : s.desk.reject}
            </Button>
          </div>
        </>
      ) : (
        <p className="rounded-md bg-page px-3 py-2 text-[12px] text-ink-2">{s.desk.readOnlyApprove}</p>
      )}
      {error && (
        <p role="alert" className="text-[12px] font-semibold text-critical">
          {error}
        </p>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// To book
// ---------------------------------------------------------------------------

function BookingForm({ trip, onDone, onCancel }: { trip: DeskTrip; onDone: () => void; onCancel: () => void }) {
  const [type, setType] = useState<BookingType>("flight");
  const [provider, setProvider] = useState("");
  const [reference, setReference] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(trip.destination);
  const [startsOn, setStartsOn] = useState(trip.starts_on);
  const [endsOn, setEndsOn] = useState(trip.ends_on);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(trip.currency ?? "USD");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currencies = useMemo(() => Array.from(new Set([trip.currency ?? "USD", ...COMMON_CURRENCIES])), [trip.currency]);

  const pickFile = (f: File | null) => {
    setError(null);
    if (f && f.size > MAX_FILE) {
      setError(s.desk.fileTooBig);
      setFile(null);
      return;
    }
    if (f && !FILE_TYPES.includes(f.type)) {
      setError(s.desk.fileType);
      setFile(null);
      return;
    }
    setFile(f);
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    const fd = new FormData();
    fd.set("type", type);
    fd.set("provider", provider);
    fd.set("reference", reference);
    fd.set("from", from);
    fd.set("to", to);
    fd.set("starts_on", startsOn);
    fd.set("ends_on", endsOn);
    if (amount.trim()) {
      fd.set("amount", amount.trim());
      fd.set("currency", currency);
    }
    if (file) fd.set("file", file);
    const res = await call(`/api/nr-synergy/desk/travel/${trip.id}/bookings`, { method: "POST", body: fd });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onDone();
  };

  return (
    <form
      className="flex flex-col gap-3 rounded-md border border-brand/30 bg-brand-wash/40 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h4 className="text-[13px] font-bold text-ink">{s.desk.formTitle}</h4>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-[12px] font-bold text-ink-2 mb-1">{s.desk.type}</legend>
        <div className="flex flex-wrap gap-1.5">
          {BOOKING_TYPES.map((bt) => (
            <label
              key={bt}
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-[12px] font-bold focus-within:ring-2 focus-within:ring-brand ${
                type === bt ? "border-brand bg-brand text-white" : "border-border bg-surface text-ink-2 hover:bg-page"
              }`}
            >
              <input type="radio" name={`type-${trip.id}`} value={bt} checked={type === bt} onChange={() => setType(bt)} className="sr-only" />
              {s.bookingTypes[bt]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={s.desk.provider} hint={s.desk.providerHint}>
          {(id, d) => <input id={id} aria-describedby={d} required maxLength={120} className={inputCls} value={provider} onChange={(e) => setProvider(e.target.value)} />}
        </Field>
        <Field label={`${s.desk.referenceField} (${s.desk.optional})`}>
          {(id) => <input id={id} maxLength={80} autoComplete="off" className={inputCls} value={reference} onChange={(e) => setReference(e.target.value)} />}
        </Field>
        <Field label={`${s.desk.from} (${s.desk.optional})`} hint={s.desk.fromHint}>
          {(id, d) => <input id={id} aria-describedby={d} maxLength={120} className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />}
        </Field>
        <Field label={`${s.desk.to} (${s.desk.optional})`} hint={s.desk.toHint}>
          {(id, d) => <input id={id} aria-describedby={d} maxLength={120} className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />}
        </Field>
        <Field label={s.desk.startsOn}>
          {(id) => (
            <input
              id={id}
              type="date"
              required
              className={inputCls}
              value={startsOn}
              onChange={(e) => {
                setStartsOn(e.target.value);
                if (endsOn && endsOn < e.target.value) setEndsOn(e.target.value);
              }}
            />
          )}
        </Field>
        <Field label={`${s.desk.endsOn} (${s.desk.optional})`}>
          {(id) => <input id={id} type="date" min={startsOn} className={inputCls} value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />}
        </Field>
        <Field label={`${s.desk.amount} (${s.desk.optional})`}>
          {(id) => <input id={id} inputMode="decimal" autoComplete="off" placeholder="0.00" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} />}
        </Field>
        <Field label={s.desk.currency}>
          {(id) => (
            <select id={id} className={inputCls} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={`${s.desk.file} (${s.desk.optional})`} hint={s.desk.fileHint} className="sm:col-span-2">
          {(id, d) => (
            <input
              id={id}
              aria-describedby={d}
              type="file"
              accept={FILE_TYPES.join(",")}
              className="block w-full text-[12.5px] text-ink-2 file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-[12px] file:font-bold file:text-ink hover:file:bg-page"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
          )}
        </Field>
      </div>
      {error && (
        <p role="alert" className="text-[12px] font-semibold text-critical">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          {s.desk.cancel}
        </Button>
        <Button type="submit" variant="primary" busy={busy}>
          {busy ? s.desk.saving : s.desk.save}
        </Button>
      </div>
    </form>
  );
}

function ToBookCard({ trip }: { trip: DeskTrip }) {
  const router = useRouter();
  const ids = useId();
  const [adding, setAdding] = useState(trip.bookings.length === 0);
  const [removing, setRemoving] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const remove = async (bookingId: string) => {
    if (!window.confirm(s.desk.removeConfirm)) return;
    setError(null);
    setRemoving(bookingId);
    const res = await call(`/api/nr-synergy/desk/travel/${trip.id}/bookings/${bookingId}`, { method: "DELETE" });
    setRemoving(null);
    if (!res.ok) setError(res.error);
    else router.refresh();
  };

  const markBooked = async () => {
    setError(null);
    if (!trip.bookings.length) {
      setError(s.desk.needBooking);
      return;
    }
    setMarking(true);
    const res = await call(`/api/nr-synergy/desk/travel/${trip.id}/book`, { method: "POST" });
    setMarking(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setNotice(s.desk.bookedDone);
    router.refresh();
  };

  return (
    <article className={cardCls} aria-labelledby={`${ids}-t`}>
      <div id={`${ids}-t`}>
        <TripHeader trip={trip} extra={trip.approved_at ? fill(s.desk.approvedOn, { date: shortDate(trip.approved_at) }) : null} />
      </div>
      <p className="text-[12.5px] text-ink-2 break-words">{trip.purpose}</p>
      <TravelProgress status={trip.status} chain={trip.chain} createdAt={trip.created_at} bookedAt={trip.booked_at} bookedBy={trip.booked_by_name} />
      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <h4 className="text-[12.5px] font-bold text-ink">{s.bookingsHeading}</h4>
        <BookingList
          bookings={trip.bookings}
          fileEndpoint={(bid) => `/api/nr-synergy/desk/travel/${trip.id}/bookings/${bid}/file`}
          onRemove={(bid) => void remove(bid)}
          removingId={removing}
        />
        {adding ? (
          <BookingForm
            trip={trip}
            onCancel={() => setAdding(false)}
            onDone={() => {
              setAdding(false);
              router.refresh();
            }}
          />
        ) : (
          <Button className="self-start" onClick={() => setAdding(true)}>
            + {trip.bookings.length ? s.desk.addAnother : s.desk.addBooking}
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <p className="text-[11.5px] text-ink-muted">{s.desk.markBookedHint}</p>
        <Button variant="primary" busy={marking} disabled={!trip.bookings.length || adding} onClick={() => void markBooked()}>
          {marking ? s.desk.marking : s.desk.markBooked}
        </Button>
      </div>
      <div aria-live="polite">
        {notice && <p className="text-[12px] font-semibold text-good-text">{notice}</p>}
        {error && (
          <p role="alert" className="text-[12px] font-semibold text-critical">
            {error}
          </p>
        )}
      </div>
    </article>
  );
}

function BookedCard({ trip }: { trip: DeskTrip }) {
  return (
    <article className={cardCls}>
      <TripHeader
        trip={trip}
        extra={
          trip.booked_at
            ? trip.booked_by_name
              ? fill(s.bookedBy, { name: trip.booked_by_name, date: shortDate(trip.booked_at) })
              : fill(s.bookedOn, { date: shortDate(trip.booked_at) })
            : null
        }
      />
      <BookingList bookings={trip.bookings} fileEndpoint={(bid) => `/api/nr-synergy/desk/travel/${trip.id}/bookings/${bid}/file`} />
    </article>
  );
}

// ---------------------------------------------------------------------------

export default function TravelDesk({ data, canApprove }: { data: DeskData; canApprove: boolean }) {
  const [tab, setTab] = useState<TabKey>(data.awaiting.length && canApprove ? "awaiting" : data.toBook.length ? "toBook" : "awaiting");
  const count = (n: number) => (n ? ` (${n})` : "");
  const tabs: { key: TabKey; label: string }[] = [
    { key: "awaiting", label: `${s.desk.awaitingTab}${count(data.awaiting.length)}` },
    { key: "toBook", label: `${s.desk.toBookTab}${count(data.toBook.length)}` },
    { key: "booked", label: s.desk.bookedTab },
  ];

  return (
    <div className="flex flex-col gap-4 min-w-0">
      <Tabs tabs={tabs} active={tab} onChange={setTab} label={s.desk.queueLabel} />
      <div role="tabpanel" aria-label={tabs.find((x) => x.key === tab)?.label} className="flex flex-col gap-3 min-w-0">
        {tab === "awaiting" ? (
          data.awaiting.length ? (
            data.awaiting.map((it) => <ApprovalCard key={it.stepId} item={it} canApprove={canApprove} />)
          ) : (
            <Empty text={s.desk.awaitingEmpty} />
          )
        ) : tab === "toBook" ? (
          data.toBook.length ? (
            data.toBook.map((tr) => <ToBookCard key={tr.id} trip={tr} />)
          ) : (
            <Empty text={s.desk.toBookEmpty} />
          )
        ) : data.booked.length ? (
          data.booked.map((tr) => <BookedCard key={tr.id} trip={tr} />)
        ) : (
          <Empty text={s.desk.bookedEmpty} />
        )}
      </div>
    </div>
  );
}
