"use client";

import { useMemo, useState, type ReactNode } from "react";
import { desk } from "@/lib/nrs/i18n/en/desk";
import {
  ASSET_KINDS,
  ASSET_STATUSES,
  type AssetDto,
  type AssetImportResult,
  type AssetKind,
  type AssetMemberDto,
  type AssetStatus,
  type AssetsData,
} from "@/app/api/nr-synergy/admin/assets/_types";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
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

const s = desk.assets;
const API = "/api/nr-synergy/admin/assets";

const STATUS_TONE: Record<AssetStatus, string> = {
  in_stock: "draft",
  issued: "approved",
  returned: "cancelled",
  lost: "rejected",
};

function fmtDay(v: string | null): string {
  if (!v) return "";
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return v;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(d);
}

function assetName(a: Pick<AssetDto, "kind" | "model">): string {
  return a.model ? `${s.kinds[a.kind]} · ${a.model}` : s.kinds[a.kind];
}

type Modal =
  | { kind: "add" }
  | { kind: "edit"; asset: AssetDto }
  | { kind: "assign"; asset: AssetDto }
  | { kind: "return"; asset: AssetDto }
  | { kind: "lost"; asset: AssetDto }
  | { kind: "import" }
  | null;

export default function AssetsSection() {
  const data = useLoad(() => api<AssetsData>(API), []);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | AssetStatus>("");
  const [kind, setKind] = useState<"" | AssetKind>("");
  const [modal, setModal] = useState<Modal>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lostError, setLostError] = useState<string | null>(null);

  const members = useMemo(() => new Map((data.data?.members ?? []).map((m) => [m.id, m])), [data.data]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data.data?.assets ?? []).filter((a) => {
      if (status && a.status !== status) return false;
      if (kind && a.kind !== kind) return false;
      if (!needle) return true;
      const m = a.assigned_member_id ? members.get(a.assigned_member_id) : undefined;
      return [a.model, a.serial, a.notes, m?.full_name, m?.email, s.kinds[a.kind]].some((v) => v?.toLowerCase().includes(needle));
    });
  }, [data.data, q, status, kind, members]);

  const counts = useMemo(() => {
    const c: Record<AssetStatus, number> = { in_stock: 0, issued: 0, returned: 0, lost: 0 };
    for (const a of data.data?.assets ?? []) c[a.status]++;
    return c;
  }, [data.data]);

  const done = (msg: string) => {
    setModal(null);
    setNotice(msg);
    void data.reload();
  };

  if (data.loading && !data.data) return <Loading label={s.loading} />;
  if (data.error || !data.data) return <ErrorBox message={data.error ?? s.error} onRetry={data.reload} retryLabel={s.retry} />;

  const total = data.data.assets.length;
  const activeMembers = data.data.members.filter((m) => m.status === "active");

  const markLost = async (asset: AssetDto) => {
    setBusy(true);
    setLostError(null);
    try {
      await api(`${API}/${asset.id}`, { method: "PATCH", body: JSON.stringify({ action: "lost" }) });
      done(s.lost);
    } catch (e) {
      setLostError(errorText(e, s.error));
    } finally {
      setBusy(false);
    }
  };

  const holder = (a: AssetDto): ReactNode => {
    if (!a.assigned_member_id) return <span className="text-ink-muted">{s.noMember}</span>;
    const m = members.get(a.assigned_member_id);
    const name = m?.full_name ?? "—";
    if (a.status === "returned") return <span className="text-ink-muted">{fmt(s.lastHolder, { name })}</span>;
    return (
      <span className="min-w-0">
        <span className="block font-bold text-ink">{name}</span>
        {m?.email && <span className="block text-[11.5px] text-ink-muted break-all">{m.email}</span>}
      </span>
    );
  };

  const dates = (a: AssetDto) =>
    [a.issued_on ? fmt(s.issued, { date: fmtDay(a.issued_on) }) : null, a.returned_on ? fmt(s.returnedShort, { date: fmtDay(a.returned_on) }) : null]
      .filter(Boolean)
      .join(" · ");

  const actions = (a: AssetDto) => (
    <div role="group" aria-label={fmt(s.actionsFor, { asset: assetName(a) })} className="flex flex-wrap gap-1.5">
      <Button variant="ghost" className="!px-2 !py-1" onClick={() => setModal({ kind: "edit", asset: a })}>
        {s.edit}
      </Button>
      {a.status !== "issued" && (
        <Button variant="ghost" className="!px-2 !py-1" onClick={() => setModal({ kind: "assign", asset: a })}>
          {s.assign}
        </Button>
      )}
      {(a.status === "issued" || a.status === "lost") && (
        <Button variant="ghost" className="!px-2 !py-1" onClick={() => setModal({ kind: "return", asset: a })}>
          {s.markReturned}
        </Button>
      )}
      {a.status !== "lost" && a.status !== "returned" && (
        <Button
          variant="ghost"
          className="!px-2 !py-1 !text-red-700"
          onClick={() => {
            setLostError(null);
            setModal({ kind: "lost", asset: a });
          }}
        >
          {s.markLost}
        </Button>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-3 min-w-0">
      <SectionTitle
        title={s.title}
        body={s.subtitle}
        action={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setModal({ kind: "import" })}>{s.import}</Button>
            <Button variant="primary" onClick={() => setModal({ kind: "add" })}>
              {s.add}
            </Button>
          </div>
        }
      />
      {notice && <Notice message={notice} />}

      {total > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={s.status}>
          {ASSET_STATUSES.map((st) => (
            <li key={st}>
              <button
                type="button"
                aria-pressed={status === st}
                onClick={() => setStatus(status === st ? "" : st)}
                className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                  status === st ? "border-brand bg-brand-wash" : "border-border bg-surface hover:bg-page"
                }`}
              >
                <span className="block text-[11.5px] font-bold text-ink-muted">{s.statuses[st]}</span>
                <span className="block text-[20px] font-bold text-ink tabular-nums">{counts[st]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Card className="!p-3 sm:!p-4">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <Field label={s.search} className="col-span-2 sm:col-span-1">
            {(id) => (
              <input id={id} type="search" className={inputCls} placeholder={s.searchPlaceholder} value={q} onChange={(e) => setQ(e.target.value)} />
            )}
          </Field>
          <Field label={s.status}>
            {(id) => (
              <select id={id} className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as "" | AssetStatus)}>
                <option value="">{s.allStatuses}</option>
                {ASSET_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {s.statuses[st]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={s.kind}>
            {(id) => (
              <select id={id} className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as "" | AssetKind)}>
                <option value="">{s.allKinds}</option>
                {ASSET_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {s.kinds[k]}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <p role="status" aria-live="polite" className="mt-2 text-[12px] text-ink-muted">
          {filtered.length === 1 ? s.countOne : fmt(s.count, { n: filtered.length })}
        </p>
      </Card>

      {total === 0 ? (
        <Card>
          <Empty title={s.emptyTitle} body={s.emptyBody} />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <Empty title={s.noMatchTitle} body={s.noMatchBody} />
        </Card>
      ) : (
        <>
          {/* Wide screens: inventory table */}
          <div className="hidden lg:block overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-left text-[12.5px]">
              <caption className="sr-only">{s.title}</caption>
              <thead className="bg-page text-[11.5px] uppercase tracking-wide text-ink-muted">
                <tr>
                  <th scope="col" className="px-3 py-2.5 font-bold">{s.col.asset}</th>
                  <th scope="col" className="px-3 py-2.5 font-bold">{s.col.serial}</th>
                  <th scope="col" className="px-3 py-2.5 font-bold">{s.col.status}</th>
                  <th scope="col" className="px-3 py-2.5 font-bold">{s.col.assignedTo}</th>
                  <th scope="col" className="px-3 py-2.5 font-bold">{s.col.dates}</th>
                  <th scope="col" className="px-3 py-2.5 font-bold">{s.col.notes}</th>
                  <th scope="col" className="px-3 py-2.5 font-bold">
                    <span className="sr-only">{s.col.actions}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((a) => (
                  <tr key={a.id} className="align-top hover:bg-page/60">
                    <th scope="row" className="px-3 py-2.5 font-normal">
                      <span className="block font-bold text-ink">{s.kinds[a.kind]}</span>
                      {a.model && <span className="block text-ink-2">{a.model}</span>}
                    </th>
                    <td className="px-3 py-2.5 font-mono text-[12px] text-ink-2 break-all">{a.serial ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone={STATUS_TONE[a.status]}>{s.statuses[a.status]}</Badge>
                    </td>
                    <td className="px-3 py-2.5 max-w-[220px]">{holder(a)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-ink-2">{dates(a) || "—"}</td>
                    <td className="px-3 py-2.5 max-w-[220px] text-ink-2 break-words">{a.notes ?? ""}</td>
                    <td className="px-3 py-2">{actions(a)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Narrow screens: cards */}
          <ul className="flex flex-col gap-2 lg:hidden">
            {filtered.map((a) => (
              <li key={a.id}>
                <Card className="!p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-ink break-words">{assetName(a)}</p>
                      {a.serial && <p className="font-mono text-[11.5px] text-ink-muted break-all">{a.serial}</p>}
                    </div>
                    <Badge tone={STATUS_TONE[a.status]}>{s.statuses[a.status]}</Badge>
                  </div>
                  <div className="mt-2 text-[12.5px]">{holder(a)}</div>
                  {dates(a) && <p className="mt-1 text-[11.5px] text-ink-2">{dates(a)}</p>}
                  {a.notes && <p className="mt-1 text-[11.5px] text-ink-muted break-words">{a.notes}</p>}
                  <div className="mt-2 border-t border-border pt-2">{actions(a)}</div>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}

      <Dialog open={modal?.kind === "add" || modal?.kind === "edit"} title={modal?.kind === "edit" ? s.editTitle : s.addTitle} onClose={() => setModal(null)}>
        {(modal?.kind === "add" || modal?.kind === "edit") && (
          <AssetForm
            key={modal.kind === "edit" ? modal.asset.id : "new"}
            asset={modal.kind === "edit" ? modal.asset : null}
            members={activeMembers}
            onCancel={() => setModal(null)}
            onDone={done}
          />
        )}
      </Dialog>

      <Dialog
        open={modal?.kind === "assign"}
        title={modal?.kind === "assign" ? fmt(s.assignTitle, { asset: assetName(modal.asset) }) : s.assign}
        onClose={() => setModal(null)}
      >
        {modal?.kind === "assign" && <AssignForm asset={modal.asset} members={activeMembers} onCancel={() => setModal(null)} onDone={done} />}
      </Dialog>

      <Dialog
        open={modal?.kind === "return"}
        title={modal?.kind === "return" ? fmt(s.returnTitle, { asset: assetName(modal.asset) }) : s.markReturned}
        onClose={() => setModal(null)}
      >
        {modal?.kind === "return" && <ReturnForm asset={modal.asset} onCancel={() => setModal(null)} onDone={done} />}
      </Dialog>

      <ConfirmDialog
        open={modal?.kind === "lost"}
        title={modal?.kind === "lost" ? fmt(s.lostTitle, { asset: assetName(modal.asset) }) : s.markLost}
        body={lostError ? `${s.lostBody} ${lostError}` : s.lostBody}
        confirmLabel={s.markLost}
        cancelLabel={s.cancel}
        danger
        busy={busy}
        onConfirm={() => {
          if (modal?.kind === "lost") void markLost(modal.asset);
        }}
        onClose={() => setModal(null)}
      />

      <Dialog open={modal?.kind === "import"} title={s.importTitle} onClose={() => setModal(null)}>
        {modal?.kind === "import" && (
          <ImportForm
            onClose={() => setModal(null)}
            onImported={(n) => {
              setNotice(fmt(s.importDone, { n }));
              void data.reload();
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

function FormActions({ busy, onCancel, label }: { busy: boolean; onCancel: () => void; label: string }) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <Button onClick={onCancel}>{s.cancel}</Button>
      <Button type="submit" variant="primary" busy={busy}>
        {label}
      </Button>
    </div>
  );
}

function useSubmit(onDone: (msg: string) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (url: string, method: "POST" | "PATCH", body: unknown, msg: string) => {
    setBusy(true);
    setError(null);
    try {
      await api(url, { method, body: JSON.stringify(body) });
      onDone(msg);
    } catch (e) {
      setError(errorText(e, s.error));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, submit };
}

function AssetForm({
  asset,
  members,
  onCancel,
  onDone,
}: {
  asset: AssetDto | null;
  members: AssetMemberDto[];
  onCancel: () => void;
  onDone: (msg: string) => void;
}) {
  const [kind, setKind] = useState<AssetKind>(asset?.kind ?? "laptop");
  const [model, setModel] = useState(asset?.model ?? "");
  const [serial, setSerial] = useState(asset?.serial ?? "");
  const [notes, setNotes] = useState(asset?.notes ?? "");
  const [memberId, setMemberId] = useState("");
  const [issuedOn, setIssuedOn] = useState(asset?.issued_on ?? todayIso());
  const [returnedOn, setReturnedOn] = useState(asset?.returned_on ?? "");
  const { busy, error, submit } = useSubmit(onDone);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (asset) {
          const body: Record<string, unknown> = { action: "edit", kind, model, serial, notes };
          if (asset.issued_on || asset.status === "issued") body.issued_on = issuedOn || null;
          if (asset.status === "returned") body.returned_on = returnedOn || null;
          void submit(`${API}/${asset.id}`, "PATCH", body, s.saved);
        } else {
          void submit(API, "POST", { kind, model, serial, notes, assigned_member_id: memberId || null, issued_on: memberId ? issuedOn : null }, s.created);
        }
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={s.kind}>
          {(id) => (
            <select id={id} className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as AssetKind)}>
              {ASSET_KINDS.map((k) => (
                <option key={k} value={k}>
                  {s.kinds[k]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={s.model}>{(id) => <input id={id} maxLength={200} className={inputCls} value={model} onChange={(e) => setModel(e.target.value)} />}</Field>
        <Field label={s.serial} className="sm:col-span-2">
          {(id) => <input id={id} maxLength={120} className={`${inputCls} font-mono`} value={serial} onChange={(e) => setSerial(e.target.value)} />}
        </Field>
        {!asset && (
          <>
            <Field label={s.member}>
              {(id) => (
                <select id={id} className={inputCls} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
                  <option value="">{s.noMember}</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            {memberId && (
              <Field label={s.issuedOn}>
                {(id) => <input id={id} type="date" required className={inputCls} value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />}
              </Field>
            )}
          </>
        )}
        {asset && (asset.issued_on || asset.status === "issued") && (
          <Field label={s.issuedOn}>
            {(id) => <input id={id} type="date" className={inputCls} value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />}
          </Field>
        )}
        {asset?.status === "returned" && (
          <Field label={s.returnedOn}>
            {(id) => <input id={id} type="date" className={inputCls} value={returnedOn} onChange={(e) => setReturnedOn(e.target.value)} />}
          </Field>
        )}
        <Field label={s.notes} className="sm:col-span-2">
          {(id) => <textarea id={id} rows={2} maxLength={2000} className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />}
        </Field>
      </div>
      {error && <ErrorBox message={error} />}
      <FormActions busy={busy} onCancel={onCancel} label={s.save} />
    </form>
  );
}

function AssignForm({
  asset,
  members,
  onCancel,
  onDone,
}: {
  asset: AssetDto;
  members: AssetMemberDto[];
  onCancel: () => void;
  onDone: (msg: string) => void;
}) {
  const [memberId, setMemberId] = useState("");
  const [issuedOn, setIssuedOn] = useState(todayIso());
  const { busy, error, submit } = useSubmit(onDone);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(`${API}/${asset.id}`, "PATCH", { action: "assign", member_id: memberId, issued_on: issuedOn }, s.assigned);
      }}
    >
      <Field label={s.member}>
        {(id) => (
          <select id={id} required className={inputCls} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            <option value="">—</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name} ({m.email})
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label={s.issuedOn}>
        {(id) => <input id={id} type="date" required className={inputCls} value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />}
      </Field>
      {error && <ErrorBox message={error} />}
      <FormActions busy={busy} onCancel={onCancel} label={s.assign} />
    </form>
  );
}

function ReturnForm({ asset, onCancel, onDone }: { asset: AssetDto; onCancel: () => void; onDone: (msg: string) => void }) {
  const [returnedOn, setReturnedOn] = useState(todayIso());
  const { busy, error, submit } = useSubmit(onDone);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(`${API}/${asset.id}`, "PATCH", { action: "return", returned_on: returnedOn }, s.returned);
      }}
    >
      <Field label={s.returnedOn}>
        {(id) => (
          <input
            id={id}
            type="date"
            required
            min={asset.issued_on ?? undefined}
            className={inputCls}
            value={returnedOn}
            onChange={(e) => setReturnedOn(e.target.value)}
          />
        )}
      </Field>
      {error && <ErrorBox message={error} />}
      <FormActions busy={busy} onCancel={onCancel} label={s.markReturned} />
    </form>
  );
}

const TEMPLATE = "kind,model,serial,assigned_email,issued_on,notes\nlaptop,MacBook Air 13 M3,C02XXXXXXX,name@example.com,2026-10-01,Charger included\n";

function ImportForm({ onClose, onImported }: { onClose: () => void; onImported: (n: number) => void }) {
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AssetImportResult | null>(null);

  const run = async () => {
    if (!csv.trim()) {
      setError(s.importEmpty);
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await api<AssetImportResult>(`${API}/import`, { method: "POST", body: JSON.stringify({ csv }) });
      setResult(r);
      if (r.created > 0) onImported(r.created);
    } catch (e) {
      setError(errorText(e, s.error));
    } finally {
      setBusy(false);
    }
  };

  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void run();
      }}
    >
      <p className="text-[12px] text-ink-2">{s.importHelp}</p>
      <a href={templateHref} download="assets-template.csv" className="self-start text-[12px] font-bold text-brand-dark hover:underline rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
        {s.template}
      </a>
      <Field label={s.importFile} hint={fileName || undefined}>
        {(id, h) => (
          <input
            id={id}
            aria-describedby={h}
            type="file"
            accept=".csv,text/csv"
            className="block w-full text-[12.5px] text-ink-2 file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-[12px] file:font-bold file:text-ink hover:file:bg-page"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              setResult(null);
              if (!f) return;
              setFileName(f.name);
              setCsv(await f.text());
            }}
          />
        )}
      </Field>
      <Field label={s.importPaste}>
        {(id) => (
          <textarea
            id={id}
            rows={5}
            spellCheck={false}
            className={`${inputCls} font-mono text-[11.5px]`}
            value={csv}
            placeholder={TEMPLATE.split("\n")[0]}
            onChange={(e) => {
              setCsv(e.target.value);
              setResult(null);
            }}
          />
        )}
      </Field>
      {error && <ErrorBox message={error} />}
      {result && (
        <div className="flex flex-col gap-2">
          <Notice message={result.created ? fmt(s.importDone, { n: result.created }) : s.importNone} tone={result.created ? "ok" : "warn"} />
          {result.errors.length > 0 && (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-[12.5px] font-bold text-red-800">{fmt(s.importErrors, { n: result.errors.length })}</p>
              <ul className="mt-1 max-h-48 overflow-y-auto text-[12px] text-red-800">
                {result.errors.map((er) => (
                  <li key={er.row} className="py-0.5">
                    <span className="font-bold">{fmt(s.importErrorRow, { row: er.row })}:</span> {er.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <Button onClick={onClose}>{result ? s.close : s.cancel}</Button>
        <Button type="submit" variant="primary" busy={busy}>
          {busy ? s.importing : s.importRun}
        </Button>
      </div>
    </form>
  );
}
