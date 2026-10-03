"use client";

import { useMemo, useRef, useState } from "react";
import { money as s } from "@/lib/nrs/i18n/en/money";
import { formatMoney, toMinor } from "@/lib/nrs/money";
import { EXPENSE_CATEGORIES, type ExpenseCategory, type ExpenseDto, type MoneyProfileDto } from "@/lib/nrs/invoice/types";
import {
  Badge,
  Button,
  COMMON_CURRENCIES,
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
  todayIso,
  useLoad,
} from "./ui";

function safeMinor(amount: string, currency: string): number | null {
  try {
    const v = toMinor(amount, currency);
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

function ExpenseForm({ profile, onDone, onCancel }: { profile: MoneyProfileDto; onDone: (e: ExpenseDto, submitted: boolean) => void; onCancel: () => void }) {
  const [spentOn, setSpentOn] = useState(todayIso());
  const [category, setCategory] = useState<ExpenseCategory>("travel");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(profile.countryCurrency);
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const currencies = useMemo(
    () => Array.from(new Set([profile.countryCurrency, profile.reportingCurrency, ...COMMON_CURRENCIES])),
    [profile.countryCurrency, profile.reportingCurrency]
  );
  const limit = profile.expenseLimits[category];
  const minor = safeMinor(amount, currency);
  const over = limit != null && minor != null && currency === profile.countryCurrency && minor > limit;

  const save = async (submit: boolean) => {
    setError(null);
    if (!description.trim()) return setError(`${s.expenses.description}: required`);
    if (minor == null) return setError(`${s.expenses.amount}: enter a number above zero`);
    const fd = new FormData();
    fd.set("spent_on", spentOn);
    fd.set("category", category);
    fd.set("description", description.trim());
    fd.set("amount", amount.trim());
    fd.set("currency", currency);
    if (submit) fd.set("submit", "1");
    const file = fileRef.current?.files?.[0];
    if (file) fd.set("receipt", file);
    setBusy(submit ? "submit" : "draft");
    try {
      const { expense } = await api<{ expense: ExpenseDto }>("/api/nr-synergy/money/expenses", { method: "POST", body: fd });
      onDone(expense, submit);
    } catch (e) {
      setError(errorText(e, s.common.error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save(true);
        }}
      >
        <h3 className="text-[14px] font-bold text-ink">{s.expenses.formTitle}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={s.expenses.date}>
            {(id) => <input id={id} type="date" required max={todayIso()} className={inputCls} value={spentOn} onChange={(e) => setSpentOn(e.target.value)} />}
          </Field>
          <Field label={s.expenses.category}>
            {(id) => (
              <select id={id} className={inputCls} value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {s.categories[c]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={s.expenses.description} hint={s.expenses.descriptionHint} className="sm:col-span-2">
            {(id, d) => <input id={id} aria-describedby={d} required maxLength={500} className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} />}
          </Field>
          <Field
            label={s.expenses.amount}
            hint={limit != null ? fmt(s.expenses.limitHint, { limit: formatMoney(limit, profile.countryCurrency) }) : undefined}
          >
            {(id, d) => (
              <input
                id={id}
                aria-describedby={d}
                required
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                className={inputCls}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            )}
          </Field>
          <Field label={s.expenses.currency}>
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
          <Field label={`${s.expenses.receipt} (${s.common.optional})`} hint={s.expenses.receiptHint} className="sm:col-span-2">
            {(id, d) => (
              <input
                id={id}
                ref={fileRef}
                aria-describedby={d}
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
                className="text-[12.5px] text-ink-2 file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-[12px] file:font-bold"
              />
            )}
          </Field>
        </div>
        {over && limit != null && <Notice tone="warn" message={fmt(s.expenses.overLimitWarn, { limit: formatMoney(limit, profile.countryCurrency) })} />}
        {error && <ErrorBox message={error} />}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            {s.common.cancel}
          </Button>
          <Button onClick={() => void save(false)} busy={busy === "draft"} disabled={!!busy}>
            {s.expenses.saveDraft}
          </Button>
          <Button type="submit" variant="primary" busy={busy === "submit"} disabled={!!busy}>
            {s.expenses.submit}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default function ExpensesPanel({ profile }: { profile: MoneyProfileDto }) {
  const list = useLoad(() => api<{ expenses: ExpenseDto[] }>("/api/nr-synergy/money/expenses"), []);
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<ExpenseDto | null>(null);

  const replace = (e: ExpenseDto) =>
    list.setData((d) => (d ? { expenses: d.expenses.map((x) => (x.id === e.id ? e : x)) } : d));

  const submit = async (e: ExpenseDto) => {
    setBusyId(e.id);
    setRowError(null);
    try {
      const { expense } = await api<{ expense: ExpenseDto }>(`/api/nr-synergy/money/expenses/${e.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "submit" }),
      });
      replace(expense);
      setNotice(s.expenses.submitted);
    } catch (err) {
      setRowError(errorText(err, s.common.error));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setBusyId(toDelete.id);
    setRowError(null);
    try {
      await api(`/api/nr-synergy/money/expenses/${toDelete.id}`, { method: "DELETE" });
      list.setData((d) => (d ? { expenses: d.expenses.filter((x) => x.id !== toDelete.id) } : d));
      setNotice(s.expenses.deleted);
      setToDelete(null);
    } catch (err) {
      setRowError(errorText(err, s.common.error));
    } finally {
      setBusyId(null);
    }
  };

  const receipt = async (e: ExpenseDto) => {
    setRowError(null);
    try {
      await openSignedUrl(`/api/nr-synergy/money/expenses/${e.id}/receipt`);
    } catch (err) {
      setRowError(errorText(err, s.common.error));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle
        title={s.tabs.expenses}
        action={
          !showForm && (
            <Button variant="primary" onClick={() => setShowForm(true)}>
              {s.expenses.new}
            </Button>
          )
        }
      />
      {notice && <Notice message={notice} />}
      {showForm && (
        <ExpenseForm
          profile={profile}
          onCancel={() => setShowForm(false)}
          onDone={(e, submitted) => {
            list.setData((d) => ({ expenses: [e, ...(d?.expenses ?? [])] }));
            setShowForm(false);
            setNotice(submitted ? s.expenses.submitted : s.expenses.created);
          }}
        />
      )}
      {rowError && <ErrorBox message={rowError} />}
      {list.loading && !list.data ? (
        <Loading label={s.common.loading} />
      ) : list.error ? (
        <ErrorBox message={list.error} onRetry={list.reload} retryLabel={s.common.retry} />
      ) : !list.data?.expenses.length ? (
        <Card>
          <Empty title={s.expenses.emptyTitle} body={s.expenses.emptyBody} />
        </Card>
      ) : (
        <ul aria-label={s.expenses.listLabel} className="flex flex-col gap-2">
          {list.data.expenses.map((e) => (
            <li key={e.id}>
              <Card className="!p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-ink break-words">{e.description}</p>
                    <p className="text-[12px] text-ink-muted">
                      {e.spent_on} · {s.categories[e.category]}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[13.5px] font-bold text-ink tabular-nums">{formatMoney(e.amount_minor, e.currency)}</p>
                    {e.reporting_amount_minor != null && e.currency !== profile.reportingCurrency && (
                      <p className="text-[11.5px] text-ink-muted tabular-nums">
                        {fmt(s.expenses.reporting, { amount: formatMoney(e.reporting_amount_minor, profile.reportingCurrency) })}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge tone={e.status}>{s.status[e.status]}</Badge>
                  {e.over_limit && <Badge tone="warn">{s.expenses.overLimit}</Badge>}
                  <div className="ml-auto flex flex-wrap gap-1.5">
                    {e.has_receipt && (
                      <Button variant="ghost" onClick={() => void receipt(e)}>
                        {s.expenses.viewReceipt}
                      </Button>
                    )}
                    {(e.status === "draft" || e.status === "sent_back") && (
                      <Button variant="primary" busy={busyId === e.id} onClick={() => void submit(e)}>
                        {e.status === "draft" ? s.expenses.submitDraft : s.expenses.resubmit}
                      </Button>
                    )}
                    {(e.status === "draft" || e.status === "sent_back" || e.status === "rejected") && (
                      <Button variant="danger" disabled={busyId === e.id} onClick={() => setToDelete(e)}>
                        {s.common.delete}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!toDelete}
        title={s.expenses.deleteConfirm}
        body={toDelete ? `${toDelete.description} · ${formatMoney(toDelete.amount_minor, toDelete.currency)}` : ""}
        confirmLabel={s.common.delete}
        cancelLabel={s.common.cancel}
        danger
        busy={!!toDelete && busyId === toDelete.id}
        onConfirm={() => void remove()}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
