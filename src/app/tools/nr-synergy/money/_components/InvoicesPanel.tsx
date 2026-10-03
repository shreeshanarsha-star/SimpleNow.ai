"use client";

import { useState } from "react";
import { money as s } from "@/lib/nrs/i18n/en/money";
import { formatMoney } from "@/lib/nrs/money";
import type { InvoiceDto, MoneyProfileDto } from "@/lib/nrs/invoice/types";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Empty,
  ErrorBox,
  Field,
  Loading,
  Notice,
  SectionTitle,
  api,
  errorText,
  fmt,
  inputCls,
  openSignedUrl,
  useLoad,
} from "./ui";
import SignatureSection from "./SignaturePad";

function lastMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}` };
}

interface Snapshot {
  calendar?: { working_days_in_month?: number; working_days_billed?: number; holidays_in_period?: string[] };
  leave?: { in_period?: { days: string[] }[]; deducted_days?: string };
  expenses?: { skipped?: unknown[] };
}

function sourceText(src: Record<string, unknown>): string {
  return Object.entries(src)
    .filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

export function InvoiceDetail({ invoice }: { invoice: InvoiceDto }) {
  const snap = (invoice.calc_snapshot ?? {}) as Snapshot;
  const leaveDays = (snap.leave?.in_period ?? []).reduce((n, l) => n + l.days.length, 0);
  const skipped = snap.expenses?.skipped?.length ?? 0;
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-[12.5px]">
          <caption className="sr-only">{s.invoices.lines}</caption>
          <thead>
            <tr className="text-left text-ink-muted border-b border-border">
              <th scope="col" className="py-1.5 pr-2 font-bold">{s.invoices.lines}</th>
              <th scope="col" className="py-1.5 px-2 font-bold text-right">{s.invoices.qty}</th>
              <th scope="col" className="py-1.5 px-2 font-bold text-right">{s.invoices.unit}</th>
              <th scope="col" className="py-1.5 pl-2 font-bold text-right">{s.invoices.amount}</th>
            </tr>
          </thead>
          <tbody>
            {(invoice.lines ?? []).map((l) => (
              <tr key={l.id} className="border-b border-border align-top">
                <td className="py-1.5 pr-2">
                  <span className="text-ink">{l.description}</span>
                  <details className="mt-0.5">
                    <summary className="cursor-pointer text-[11.5px] text-ink-muted">{s.invoices.source}</summary>
                    <p className="text-[11.5px] text-ink-muted break-words">{sourceText(l.source)}</p>
                  </details>
                </td>
                <td className="py-1.5 px-2 text-right tabular-nums">{l.quantity}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{formatMoney(l.unit_minor, invoice.currency)}</td>
                <td className={`py-1.5 pl-2 text-right tabular-nums ${l.amount_minor < 0 ? "text-red-700" : ""}`}>
                  {formatMoney(l.amount_minor, invoice.currency)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={3} className="pt-2 text-right font-normal text-ink-muted">{s.invoices.fees}</th>
              <td className="pt-2 text-right tabular-nums">{formatMoney(invoice.subtotal_minor, invoice.currency)}</td>
            </tr>
            <tr>
              <th scope="row" colSpan={3} className="text-right font-normal text-ink-muted">{s.invoices.expenses}</th>
              <td className="text-right tabular-nums">{formatMoney(invoice.expenses_minor, invoice.currency)}</td>
            </tr>
            <tr>
              <th scope="row" colSpan={3} className="text-right font-bold text-ink">{s.invoices.total}</th>
              <td className="text-right font-bold tabular-nums">{formatMoney(invoice.total_minor, invoice.currency)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="rounded-md bg-page px-3 py-2 text-[12px] text-ink-2 flex flex-col gap-0.5">
        <p className="font-bold">{s.invoices.how}</p>
        {snap.calendar?.working_days_in_month != null && (
          <p>
            {fmt(s.invoices.workingDays, {
              billed: snap.calendar.working_days_billed ?? 0,
              month: snap.calendar.working_days_in_month,
            })}
          </p>
        )}
        {!!snap.calendar?.holidays_in_period?.length && <p>{fmt(s.invoices.holidays, { list: snap.calendar.holidays_in_period.join(", ") })}</p>}
        {leaveDays > 0 && <p>{fmt(s.invoices.leave, { days: leaveDays, deducted: snap.leave?.deducted_days ?? "0" })}</p>}
        {skipped > 0 && <p>{fmt(s.invoices.skipped, { n: skipped })}</p>}
      </div>
    </div>
  );
}

export default function InvoicesPanel({ profile, onProfileChange }: { profile: MoneyProfileDto; onProfileChange: () => void }) {
  const list = useLoad(() => api<{ invoices: InvoiceDto[] }>("/api/nr-synergy/invoices"), []);
  const [month, setMonth] = useState(lastMonth());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<InvoiceDto | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "submit" | "discard"; inv: InvoiceDto } | null>(null);

  if (profile.engagementType !== "consultant") {
    return (
      <Card>
        <Empty title={s.tabs.invoices} body={s.invoices.consultantsOnly} />
      </Card>
    );
  }

  const upsert = (inv: InvoiceDto) =>
    list.setData((d) => {
      const rest = (d?.invoices ?? []).filter((x) => x.id !== inv.id);
      return { invoices: [inv, ...rest].sort((a, b) => (a.period_start < b.period_start ? 1 : -1)) };
    });

  const generate = async (start: string, end: string, key: string) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const { invoice } = await api<{ invoice: InvoiceDto }>("/api/nr-synergy/invoices", {
        method: "POST",
        body: JSON.stringify({ period_start: start, period_end: end }),
      });
      upsert(invoice);
      setOpen(invoice);
      setNotice(s.invoices.generated);
    } catch (e) {
      setError(errorText(e, s.common.error));
    } finally {
      setBusy(null);
    }
  };

  const view = async (inv: InvoiceDto) => {
    if (open?.id === inv.id) return setOpen(null);
    setBusy(`view-${inv.id}`);
    setError(null);
    try {
      const { invoice } = await api<{ invoice: InvoiceDto }>(`/api/nr-synergy/invoices/${inv.id}`);
      setOpen(invoice);
    } catch (e) {
      setError(errorText(e, s.common.error));
    } finally {
      setBusy(null);
    }
  };

  const pdf = async (inv: InvoiceDto) => {
    setBusy(`pdf-${inv.id}`);
    setError(null);
    try {
      await openSignedUrl(`/api/nr-synergy/invoices/${inv.id}/pdf`);
    } catch (e) {
      setError(errorText(e, s.common.error));
    } finally {
      setBusy(null);
    }
  };

  const doConfirm = async () => {
    if (!confirm) return;
    const { kind, inv } = confirm;
    setBusy(`${kind}-${inv.id}`);
    setError(null);
    try {
      if (kind === "submit") {
        const { invoice } = await api<{ invoice: InvoiceDto }>(`/api/nr-synergy/invoices/${inv.id}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "submit" }),
        });
        upsert(invoice);
        setOpen(null);
        setNotice(s.invoices.submitted);
      } else {
        await api(`/api/nr-synergy/invoices/${inv.id}`, { method: "DELETE" });
        list.setData((d) => (d ? { invoices: d.invoices.filter((x) => x.id !== inv.id) } : d));
        setOpen(null);
        setNotice(s.invoices.discarded);
      }
      setConfirm(null);
    } catch (e) {
      setError(errorText(e, s.common.error));
      setConfirm(null);
    } finally {
      setBusy(null);
    }
  };

  const range = monthRange(month);

  return (
    <div className="flex flex-col gap-4">
      <SignatureSection onChange={onProfileChange} />

      <Card>
        <SectionTitle title={s.invoices.generateTitle} body={s.invoices.generateBody} />
        {!profile.hasVerifiedTerms ? (
          <Notice tone="warn" message={s.invoices.noTerms} />
        ) : (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void generate(range.start, range.end, "generate");
            }}
          >
            <Field label={s.invoices.month} className="w-[200px]">
              {(id) => <input id={id} type="month" required max={lastMonth()} className={inputCls} value={month} onChange={(e) => setMonth(e.target.value)} />}
            </Field>
            <Button type="submit" variant="primary" busy={busy === "generate"}>
              {busy === "generate" ? s.invoices.generating : s.invoices.generate}
            </Button>
          </form>
        )}
      </Card>

      {notice && <Notice message={notice} />}
      {error && <ErrorBox message={error} />}

      {list.loading && !list.data ? (
        <Loading label={s.common.loading} />
      ) : list.error ? (
        <ErrorBox message={list.error} onRetry={list.reload} retryLabel={s.common.retry} />
      ) : !list.data?.invoices.length ? (
        <Card>
          <Empty title={s.invoices.emptyTitle} body={s.invoices.emptyBody} />
        </Card>
      ) : (
        <ul aria-label={s.invoices.listLabel} className="flex flex-col gap-2">
          {list.data.invoices.map((inv) => {
            const isOpen = open?.id === inv.id;
            const canRegen = ["draft", "sent_back", "rejected", "cancelled"].includes(inv.status);
            return (
              <li key={inv.id}>
                <Card className="!p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-ink">{inv.number}</p>
                      <p className="text-[12px] text-ink-muted">
                        {inv.period_start} → {inv.period_end}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[14px] font-bold tabular-nums text-ink">{formatMoney(inv.total_minor, inv.currency)}</span>
                      <Badge tone={inv.status}>{s.status[inv.status]}</Badge>
                    </div>
                  </div>
                  {inv.status === "sent_back" && <p className="mt-2 text-[12px] text-amber-900">{s.invoices.sentBackNote}</p>}
                  {inv.paid_at && (
                    <p className="mt-1 text-[12px] text-ink-muted">{fmt(s.finance.paidOn, { date: inv.paid_at.slice(0, 10), ref: inv.payment_ref ?? "" })}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Button variant="ghost" aria-expanded={isOpen} busy={busy === `view-${inv.id}`} onClick={() => void view(inv)}>
                      {isOpen ? s.invoices.hide : s.invoices.view}
                    </Button>
                    <Button variant="ghost" busy={busy === `pdf-${inv.id}`} onClick={() => void pdf(inv)}>
                      {s.invoices.downloadPdf}
                    </Button>
                    {canRegen && (
                      <Button busy={busy === `regen-${inv.id}`} onClick={() => void generate(inv.period_start, inv.period_end, `regen-${inv.id}`)}>
                        {s.invoices.regenerate}
                      </Button>
                    )}
                    {canRegen && (
                      <Button variant="danger" onClick={() => setConfirm({ kind: "discard", inv })}>
                        {s.invoices.discard}
                      </Button>
                    )}
                    {inv.status === "draft" && (
                      <Button
                        variant="primary"
                        disabled={!profile.hasSignature}
                        title={!profile.hasSignature ? s.invoices.signatureMissing : undefined}
                        onClick={() => setConfirm({ kind: "submit", inv })}
                      >
                        {s.invoices.submit}
                      </Button>
                    )}
                  </div>
                  {inv.status === "draft" && !profile.hasSignature && <p className="mt-1 text-[11.5px] text-ink-muted">{s.invoices.signatureMissing}</p>}
                  {isOpen && open && (
                    <div className="mt-3 border-t border-border pt-3">
                      <InvoiceDetail invoice={open} />
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.kind === "submit" ? s.invoices.submit : s.invoices.discard}
        body={
          confirm?.kind === "submit"
            ? fmt(s.invoices.submitConfirm, { number: confirm.inv.number, total: formatMoney(confirm.inv.total_minor, confirm.inv.currency) })
            : s.invoices.discardConfirm
        }
        confirmLabel={confirm?.kind === "submit" ? s.invoices.submit : s.invoices.discard}
        cancelLabel={s.common.cancel}
        danger={confirm?.kind === "discard"}
        busy={!!confirm && busy === `${confirm.kind}-${confirm.inv.id}`}
        onConfirm={() => void doConfirm()}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}
