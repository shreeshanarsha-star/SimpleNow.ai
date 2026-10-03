"use client";

import { useState } from "react";
import { money as s } from "@/lib/nrs/i18n/en/money";
import { formatMoney } from "@/lib/nrs/money";
import type { InvoiceDto, InvoiceStatus } from "@/lib/nrs/invoice/types";
import { Badge, Button, Card, Dialog, Empty, ErrorBox, Field, Loading, Notice, SectionTitle, api, errorText, fmt, inputCls, openSignedUrl, useLoad } from "./ui";
import { InvoiceDetail } from "./InvoicesPanel";

const FILTERS: ("all" | InvoiceStatus)[] = ["all", "submitted", "manager_approved", "hr_approved", "finance_approved", "paid", "sent_back", "rejected"];

export default function FinancePanel() {
  const list = useLoad(() => api<{ invoices: InvoiceDto[] }>("/api/nr-synergy/invoices?scope=finance"), []);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("finance_approved");
  const [paying, setPaying] = useState<InvoiceDto | null>(null);
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<InvoiceDto | null>(null);

  const rows = (list.data?.invoices ?? []).filter((i) => filter === "all" || i.status === filter);

  const markPaid = async () => {
    if (!paying) return;
    setBusy("pay");
    setError(null);
    try {
      const { invoice } = await api<{ invoice: InvoiceDto }>(`/api/nr-synergy/invoices/${paying.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "mark_paid", payment_ref: ref }),
      });
      list.setData((d) => (d ? { invoices: d.invoices.map((x) => (x.id === invoice.id ? { ...invoice, member_name: x.member_name } : x)) } : d));
      setPaying(null);
      setRef("");
      setNotice(s.finance.markedPaid);
    } catch (e) {
      setError(errorText(e, s.common.error));
    } finally {
      setBusy(null);
    }
  };

  const view = async (inv: InvoiceDto) => {
    if (open?.id === inv.id) return setOpen(null);
    setBusy(`view-${inv.id}`);
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
    setError(null);
    try {
      await openSignedUrl(`/api/nr-synergy/invoices/${inv.id}/pdf`);
    } catch (e) {
      setError(errorText(e, s.common.error));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle
        title={s.finance.title}
        action={
          <Field label={s.finance.filter} className="w-[200px]">
            {(id) => (
              <select id={id} className={inputCls} value={filter} onChange={(e) => setFilter(e.target.value as (typeof FILTERS)[number])}>
                {FILTERS.map((f) => (
                  <option key={f} value={f}>
                    {f === "all" ? s.finance.all : s.status[f]}
                  </option>
                ))}
              </select>
            )}
          </Field>
        }
      />
      {notice && <Notice message={notice} />}
      {error && <ErrorBox message={error} />}
      {list.loading && !list.data ? (
        <Loading label={s.common.loading} />
      ) : list.error ? (
        <ErrorBox message={list.error} onRetry={list.reload} retryLabel={s.common.retry} />
      ) : !rows.length ? (
        <Card>
          <Empty title={s.finance.emptyTitle} body={s.finance.emptyBody} />
        </Card>
      ) : (
        <ul className="flex flex-col gap-2" aria-label={s.finance.title}>
          {rows.map((inv) => (
            <li key={inv.id}>
              <Card className="!p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-ink">{inv.member_name ?? s.finance.consultant}</p>
                    <p className="text-[12px] text-ink-muted">
                      {inv.number} · {inv.period_start} → {inv.period_end}
                    </p>
                    {inv.paid_at && <p className="text-[12px] text-ink-muted">{fmt(s.finance.paidOn, { date: inv.paid_at.slice(0, 10), ref: inv.payment_ref ?? "" })}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[14px] font-bold tabular-nums">{formatMoney(inv.total_minor, inv.currency)}</span>
                    <Badge tone={inv.status}>{s.status[inv.status]}</Badge>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button variant="ghost" aria-expanded={open?.id === inv.id} busy={busy === `view-${inv.id}`} onClick={() => void view(inv)}>
                    {open?.id === inv.id ? s.invoices.hide : s.invoices.view}
                  </Button>
                  <Button variant="ghost" onClick={() => void pdf(inv)}>
                    {s.invoices.downloadPdf}
                  </Button>
                  {inv.status === "finance_approved" && (
                    <Button variant="primary" onClick={() => setPaying(inv)}>
                      {s.finance.markPaid}
                    </Button>
                  )}
                </div>
                {open?.id === inv.id && (
                  <div className="mt-3 border-t border-border pt-3">
                    <InvoiceDetail invoice={open} />
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={!!paying} title={s.finance.markPaid} onClose={() => setPaying(null)}>
        {paying && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void markPaid();
            }}
          >
            <p className="text-[12.5px] text-ink-2">
              {paying.member_name} · {paying.number} · {formatMoney(paying.total_minor, paying.currency)}
            </p>
            <Field label={s.finance.paymentRef} hint={s.finance.paymentRefHint}>
              {(id, d) => <input id={id} aria-describedby={d} required maxLength={120} className={inputCls} value={ref} onChange={(e) => setRef(e.target.value)} />}
            </Field>
            {error && <ErrorBox message={error} />}
            <div className="flex justify-end gap-2">
              <Button onClick={() => setPaying(null)}>{s.common.cancel}</Button>
              <Button type="submit" variant="primary" busy={busy === "pay"} disabled={!ref.trim()}>
                {s.finance.markPaid}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
