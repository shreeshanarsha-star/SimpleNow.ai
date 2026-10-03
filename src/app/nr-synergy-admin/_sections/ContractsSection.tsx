"use client";

import { useRef, useState } from "react";
import { admin as s } from "@/lib/nrs/i18n/en/admin";
import { money as ms } from "@/lib/nrs/i18n/en/money";
import { formatMoney } from "@/lib/nrs/money";
import type { BillingBasis } from "@/lib/nrs/invoice/calc";
import { EXPENSE_CATEGORIES, type ContractDto, type ContractExtraction, type ContractTermsDto, type ExtractedField } from "@/lib/nrs/invoice/types";
import type { AdminMemberDto } from "@/lib/nrs/invoice/adminTypes";
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
  todayIso,
  useLoad,
} from "@/app/tools/nr-synergy/money/_components/ui";

const T = s.contracts;
const BASES: BillingBasis[] = ["monthly_retainer", "pro_rata_working_days", "day_rate"];

function isExtraction(x: ContractDto["extraction"]): x is ContractExtraction {
  return !!x && typeof x === "object" && "basis" in x;
}

function Evidence({ f }: { f: ExtractedField<unknown> | undefined }) {
  if (!f) return null;
  const pct = Math.round(f.confidence * 100);
  return (
    <div className="flex flex-col gap-1 text-[11.5px]">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={f.confidence >= 0.8 ? "approved" : f.confidence >= 0.5 ? "review" : "rejected"}>{fmt(T.confidence, { pct })}</Badge>
        {f.confidence < 0.6 && <span className="text-amber-900 font-bold">{T.lowConfidence}</span>}
        {f.clause && (
          <span className="text-ink-muted">
            {T.clause} {f.clause}
          </span>
        )}
      </div>
      {f.evidence && (
        <blockquote className="border-l-2 border-brand/40 pl-2 italic text-ink-2 break-words" aria-label={T.evidence}>
          “{f.evidence}”
        </blockquote>
      )}
    </div>
  );
}

interface TermsForm {
  basis: BillingBasis;
  fee: string;
  currency: string;
  paid_leave_days_per_year: string;
  reimbursables: string[];
  tax: string;
  notice_days: string;
  effective_from: string;
  effective_to: string;
  clause_refs: string;
}

function initialForm(c: ContractDto): TermsForm {
  const x = isExtraction(c.extraction) ? c.extraction : null;
  const clauseRefs: Record<string, string> = {};
  if (x) {
    const map: [string, ExtractedField<unknown>][] = [
      ["basis", x.basis],
      ["fee", x.fee_amount],
      ["paid_leave", x.paid_leave_days_per_year],
      ["reimbursables", x.reimbursables],
      ["tax", x.tax],
      ["notice", x.notice_days],
      ["effective_from", x.effective_from],
    ];
    for (const [k, f] of map) if (f?.clause) clauseRefs[k] = f.clause;
  }
  return {
    basis: x?.basis.value ?? "monthly_retainer",
    fee: x?.fee_amount.value ?? "",
    currency: x?.currency.value ?? "",
    paid_leave_days_per_year: x?.paid_leave_days_per_year.value ?? "0",
    reimbursables: x?.reimbursables.value ?? [],
    tax: JSON.stringify(x?.tax.value ?? {}),
    notice_days: x?.notice_days.value != null ? String(x.notice_days.value) : "",
    effective_from: x?.effective_from.value ?? todayIso(),
    effective_to: x?.effective_to.value ?? "",
    clause_refs: JSON.stringify(clauseRefs),
  };
}

function Review({ contractId, onBack, onChanged }: { contractId: string; onBack: () => void; onChanged: () => void }) {
  const detail = useLoad(
    () => api<{ contract: ContractDto; fileUrl: string | null; terms: ContractTermsDto[] }>(`/api/nr-synergy/contracts/${contractId}`),
    [contractId]
  );
  const [form, setForm] = useState<TermsForm | null>(null);
  const [busy, setBusy] = useState<"verify" | "extract" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (detail.loading && !detail.data) return <Loading label={s.common.loading} />;
  if (detail.error || !detail.data) return <ErrorBox message={detail.error ?? s.common.error} onRetry={detail.reload} retryLabel={s.common.retry} />;
  const { contract, fileUrl, terms } = detail.data;
  const f = form ?? initialForm(contract);
  const x = isExtraction(contract.extraction) ? contract.extraction : null;
  const failed = contract.extraction && "error" in contract.extraction ? contract.extraction.error : null;
  const editable = contract.status === "review" || contract.status === "failed" || contract.status === "uploaded";
  const set = <K extends keyof TermsForm>(k: K, v: TermsForm[K]) => setForm({ ...f, [k]: v });

  const parseJson = (raw: string, field: string): Record<string, unknown> | null => {
    try {
      const v: unknown = raw.trim() ? JSON.parse(raw) : {};
      if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
    } catch {
      // fall through
    }
    setError(fmt(T.invalidJson, { field }));
    return null;
  };

  const verify = async () => {
    setError(null);
    const tax = parseJson(f.tax, T.tax);
    const clauseRefs = parseJson(f.clause_refs, T.clauseRefs);
    if (!tax || !clauseRefs) return setConfirm(false);
    setBusy("verify");
    try {
      await api(`/api/nr-synergy/contracts/${contract.id}/verify`, {
        method: "POST",
        body: JSON.stringify({
          basis: f.basis,
          fee: f.fee,
          currency: f.currency,
          paid_leave_days_per_year: f.paid_leave_days_per_year,
          reimbursables: f.reimbursables,
          tax,
          notice_days: f.notice_days === "" ? null : Number(f.notice_days),
          effective_from: f.effective_from,
          effective_to: f.effective_to || null,
          clause_refs: clauseRefs,
        }),
      });
      setNotice(T.verified);
      setForm(null);
      await detail.reload();
      onChanged();
    } catch (e) {
      setError(errorText(e, s.common.error));
    } finally {
      setBusy(null);
      setConfirm(false);
    }
  };

  const reextract = async () => {
    setBusy("extract");
    setError(null);
    try {
      await api(`/api/nr-synergy/contracts/${contract.id}/extract`, { method: "POST" });
      setForm(null);
      await detail.reload();
      onChanged();
    } catch (e) {
      setError(errorText(e, s.common.error));
    } finally {
      setBusy(null);
    }
  };

  const toggleReimb = (k: string, on: boolean) => {
    if (k === "all") return set("reimbursables", on ? ["all"] : []);
    const base = f.reimbursables.filter((r) => r !== "all");
    set("reimbursables", on ? [...base, k] : base.filter((r) => r !== k));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" onClick={onBack}>
          ← {s.common.back}
        </Button>
        <Badge tone={contract.status}>{T.statuses[contract.status]}</Badge>
      </div>
      <h3 className="text-[15px] font-bold text-ink">{fmt(T.reviewTitle, { name: contract.member_name })}</h3>
      {notice && <Notice message={notice} />}
      {failed && <Notice tone="warn" message={fmt(T.failed, { error: failed })} />}
      {error && <ErrorBox message={error} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <Card className="!p-2 lg:sticky lg:top-2">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2">
            <h4 className="text-[12.5px] font-bold text-ink">{T.document}</h4>
            {fileUrl && (
              <a href={fileUrl} target="_blank" rel="noreferrer" className="text-[12px] font-bold text-brand-dark underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-sm">
                {T.openPdf}
              </a>
            )}
          </div>
          {fileUrl ? (
            <iframe title={`${T.document}: ${contract.file_name ?? ""}`} src={fileUrl} className="w-full h-[50vh] lg:h-[75vh] rounded-md border border-border bg-white" />
          ) : (
            <p className="p-4 text-[12.5px] text-ink-muted">{T.noFile}</p>
          )}
        </Card>

        <Card>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              setConfirm(true);
            }}
          >
            {x && <p className="text-[11.5px] text-ink-muted">{fmt(T.model, { model: x.model })}</p>}
            {x?.notes && <Notice tone="warn" message={`${T.notes}: ${x.notes}`} />}
            <fieldset disabled={!editable} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Field label={T.basis}>
                  {(id) => (
                    <select id={id} className={inputCls} value={f.basis} onChange={(e) => set("basis", e.target.value as BillingBasis)}>
                      {BASES.map((b) => (
                        <option key={b} value={b}>
                          {T.bases[b]}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <Evidence f={x?.basis} />
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="grid grid-cols-[1fr_110px] gap-2">
                  <Field label={T.fee} hint={f.basis === "day_rate" ? T.feeHintDay : T.feeHintMonthly}>
                    {(id, h) => <input id={id} aria-describedby={h} required inputMode="decimal" className={inputCls} value={f.fee} onChange={(e) => set("fee", e.target.value)} />}
                  </Field>
                  <Field label={T.currency}>
                    {(id) => <input id={id} required maxLength={3} className={inputCls} value={f.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} />}
                  </Field>
                </div>
                <Evidence f={x?.fee_amount} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Field label={T.paidLeave}>
                  {(id) => <input id={id} inputMode="decimal" className={inputCls} value={f.paid_leave_days_per_year} onChange={(e) => set("paid_leave_days_per_year", e.target.value)} />}
                </Field>
                <Evidence f={x?.paid_leave_days_per_year} />
              </div>
              <fieldset className="flex flex-col gap-1.5">
                <legend className="text-[12px] font-bold text-ink-2 mb-1">{T.reimbursables}</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  <label className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-2">
                    <input type="checkbox" checked={f.reimbursables.includes("all")} onChange={(e) => toggleReimb("all", e.target.checked)} />
                    {T.reimbursablesAll}
                  </label>
                  {EXPENSE_CATEGORIES.map((k) => (
                    <label key={k} className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-2">
                      <input
                        type="checkbox"
                        disabled={f.reimbursables.includes("all")}
                        checked={f.reimbursables.includes(k)}
                        onChange={(e) => toggleReimb(k, e.target.checked)}
                      />
                      {ms.categories[k]}
                    </label>
                  ))}
                </div>
                <Evidence f={x?.reimbursables} />
              </fieldset>
              <div className="flex flex-col gap-1.5">
                <Field label={T.tax}>
                  {(id) => <textarea id={id} rows={2} className={`${inputCls} font-mono text-[12px]`} value={f.tax} onChange={(e) => set("tax", e.target.value)} />}
                </Field>
                <Evidence f={x?.tax} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Field label={T.noticeDays}>
                  {(id) => <input id={id} inputMode="numeric" className={inputCls} value={f.notice_days} onChange={(e) => set("notice_days", e.target.value)} />}
                </Field>
                <Evidence f={x?.notice_days} />
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Field label={T.effectiveFrom}>
                    {(id) => <input id={id} type="date" required className={inputCls} value={f.effective_from} onChange={(e) => set("effective_from", e.target.value)} />}
                  </Field>
                  <Field label={`${T.effectiveTo} (${s.common.optional})`}>
                    {(id) => <input id={id} type="date" className={inputCls} value={f.effective_to} onChange={(e) => set("effective_to", e.target.value)} />}
                  </Field>
                </div>
                <Evidence f={x?.effective_from} />
              </div>
              <Field label={T.clauseRefs}>
                {(id) => <textarea id={id} rows={2} className={`${inputCls} font-mono text-[12px]`} value={f.clause_refs} onChange={(e) => set("clause_refs", e.target.value)} />}
              </Field>
            </fieldset>
            {editable && (
              <div className="flex flex-wrap justify-end gap-2">
                {fileUrl && (
                  <Button busy={busy === "extract"} disabled={!!busy} onClick={() => void reextract()}>
                    {busy === "extract" ? T.reextracting : T.reextract}
                  </Button>
                )}
                <Button type="submit" variant="primary" disabled={!!busy}>
                  {T.verify}
                </Button>
              </div>
            )}
          </form>
        </Card>
      </div>

      <Card>
        <h4 className="text-[13px] font-bold text-ink mb-2">{T.history}</h4>
        {!terms.length ? (
          <p className="text-[12.5px] text-ink-muted">{T.historyEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {terms.map((t) => (
              <li key={t.id} className="rounded-md bg-page px-3 py-1.5 text-[12.5px] text-ink-2">
                <strong className="text-ink">{T.bases[t.basis]}</strong> · {formatMoney(t.fee_minor, t.currency)} · {t.effective_from} → {t.effective_to ?? "…"}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={confirm}
        title={T.verify}
        body={fmt(T.verifyConfirm, { date: f.effective_from, name: contract.member_name })}
        confirmLabel={T.verify}
        cancelLabel={s.common.cancel}
        busy={busy === "verify"}
        onConfirm={() => void verify()}
        onClose={() => setConfirm(false)}
      />
    </div>
  );
}

export default function ContractsSection() {
  const list = useLoad(() => api<{ contracts: ContractDto[] }>("/api/nr-synergy/contracts"), []);
  const members = useLoad(() => api<{ members: AdminMemberDto[] }>("/api/nr-synergy/admin/members"), []);
  const [memberId, setMemberId] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);

  if (reviewing) return <Review contractId={reviewing} onBack={() => setReviewing(null)} onChanged={() => void list.reload()} />;

  const consultants = (members.data?.members ?? []).filter((m) => m.status === "active");
  consultants.sort((a, b) => Number(b.engagement?.type === "consultant") - Number(a.engagement?.type === "consultant") || a.full_name.localeCompare(b.full_name));

  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!memberId || !file) return setError(`${T.member} / ${T.file}`);
    const fd = new FormData();
    fd.set("member_id", memberId);
    fd.set("file", file);
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { contract } = await api<{ contract: ContractDto }>("/api/nr-synergy/contracts", { method: "POST", body: fd });
      setNotice(T.uploaded);
      if (fileRef.current) fileRef.current.value = "";
      await list.reload();
      setReviewing(contract.id);
    } catch (e) {
      setError(errorText(e, s.common.error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle title={s.sections.contracts} body={T.intro} />
      <Card>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void upload();
          }}
        >
          <h3 className="text-[14px] font-bold text-ink">{T.upload}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={T.member}>
              {(id) =>
                members.error ? (
                  <ErrorBox message={members.error} onRetry={members.reload} retryLabel={s.common.retry} />
                ) : (
                  <select id={id} required className={inputCls} value={memberId} onChange={(e) => setMemberId(e.target.value)} disabled={members.loading}>
                    <option value="">{T.chooseMember}</option>
                    {consultants.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.full_name}
                        {m.engagement ? ` · ${s.users[m.engagement.type]}` : ""}
                      </option>
                    ))}
                  </select>
                )
              }
            </Field>
            <Field label={T.file} hint={T.fileHint}>
              {(id, h) => (
                <input
                  id={id}
                  ref={fileRef}
                  aria-describedby={h}
                  type="file"
                  required
                  accept="application/pdf"
                  className="text-[12.5px] text-ink-2 file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-[12px] file:font-bold"
                />
              )}
            </Field>
          </div>
          {busy && <p role="status" className="text-[12px] text-ink-muted">{T.uploading}</p>}
          {error && <ErrorBox message={error} />}
          <div className="flex justify-end">
            <Button type="submit" variant="primary" busy={busy}>
              {T.upload}
            </Button>
          </div>
        </form>
      </Card>
      {notice && <Notice message={notice} />}
      {list.loading && !list.data ? (
        <Loading label={s.common.loading} />
      ) : list.error ? (
        <ErrorBox message={list.error} onRetry={list.reload} retryLabel={s.common.retry} />
      ) : !list.data?.contracts.length ? (
        <Card>
          <Empty title={T.emptyTitle} body={T.emptyBody} />
        </Card>
      ) : (
        <ul aria-label={T.listLabel} className="flex flex-col gap-2">
          {list.data.contracts.map((c) => {
            const x = isExtraction(c.extraction) ? c.extraction : null;
            return (
              <li key={c.id}>
                <Card className="!p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-bold text-ink">
                        {c.member_name} {c.is_demo && <Badge tone="draft">{s.common.demo}</Badge>}
                      </p>
                      <p className="text-[12px] text-ink-muted break-all">
                        {c.file_name ?? "—"} · {c.created_at.slice(0, 10)}
                        {x?.basis.value && x.fee_minor.value != null && x.currency.value
                          ? ` · ${T.bases[x.basis.value]} ${formatMoney(x.fee_minor.value, x.currency.value)}`
                          : x?.fee_amount.value
                            ? ` · ${x.fee_amount.value}`
                            : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={c.status}>{T.statuses[c.status]}</Badge>
                      <Button onClick={() => setReviewing(c.id)}>{T.review}</Button>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
