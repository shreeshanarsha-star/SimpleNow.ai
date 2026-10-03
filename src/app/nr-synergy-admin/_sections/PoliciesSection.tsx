"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { admin as s } from "@/lib/nrs/i18n/en/admin";
import {
  ApiError,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Empty,
  ErrorBox,
  Loading,
  Notice,
  SectionTitle,
  Tabs,
  api,
  errorText,
  fmt,
  inputCls,
  useLoad,
} from "@/app/tools/nr-synergy/money/_components/ui";

const P = s.policies;
const C = s.content;
const API = "/api/nr-synergy/admin/policies";

interface VersionStat {
  id: string;
  version: string;
  effective_from: string;
  published_at: string;
  has_file: boolean;
  is_current: boolean;
  required: number;
  acknowledged: number;
}

interface PolicyDocDto {
  id: string;
  title: string;
  category: string;
  country_code: string | null;
  audience: string;
}

interface PolicyDto {
  document: PolicyDocDto;
  versions: VersionStat[];
}

interface RosterMember {
  id: string;
  full_name: string;
  email: string;
  home_country: string;
  department: string | null;
  designation: string | null;
  is_demo: boolean;
  acked_at: string | null;
}

interface Roster {
  is_current: boolean;
  members: RosterMember[];
}

type Filter = "pending" | "acknowledged" | "all";

function pct(done: number, total: number): number {
  return total ? Math.round((done / total) * 100) : 0;
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function Progress({ done, total, label }: { done: number; total: number; label: string }) {
  const p = pct(done, total);
  const tone = total === 0 ? "bg-border" : p === 100 ? "bg-emerald-500" : p >= 60 ? "bg-brand" : "bg-amber-500";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12.5px] text-ink-2">
          <strong className="text-[18px] text-ink tabular-nums">{done}</strong>
          <span className="tabular-nums"> / {total}</span> <span className="text-ink-muted">{P.acknowledged.toLowerCase()}</span>
        </p>
        <span className="text-[12.5px] font-bold text-ink-2 tabular-nums">{fmt(P.pct, { pct: p })}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={fmt(P.progress, { done, total })}
        className="h-2 w-full overflow-hidden rounded-full bg-page"
      >
        <div className={`h-full rounded-full transition-[width] duration-500 ${tone}`} style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

async function downloadCsv(versionId: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API}?version_id=${versionId}&format=csv`, { cache: "no-store" });
  } catch {
    throw new ApiError("Network error. Check your connection and try again.", 0);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? `Export failed (${res.status})`, res.status);
  }
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "acknowledgements.csv";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function People({ versionId, title }: { versionId: string; title: string }) {
  const roster = useLoad(() => api<Roster>(`${API}?version_id=${versionId}`), [versionId]);
  const [filter, setFilter] = useState<Filter>("pending");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchId = useId();

  const members = useMemo(() => roster.data?.members ?? [], [roster.data]);
  const counts = useMemo(
    () => ({
      pending: members.filter((m) => !m.acked_at).length,
      acknowledged: members.filter((m) => m.acked_at).length,
      all: members.length,
    }),
    [members]
  );
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return members
      .filter((m) => (filter === "all" ? true : filter === "pending" ? !m.acked_at : !!m.acked_at))
      .filter(
        (m) =>
          !needle ||
          [m.full_name, m.email, m.department ?? "", m.home_country].some((x) => x.toLowerCase().includes(needle))
      );
  }, [members, filter, q]);

  const remindOne = async (m: RosterMember) => {
    setBusy(m.id);
    setError(null);
    setNotice(null);
    try {
      const r = await api<{ reminded: number }>(API, {
        method: "POST",
        body: JSON.stringify({ version_id: versionId, action: "remind", member_ids: [m.id] }),
      });
      setNotice(fmt(P.reminded, { count: r.reminded }));
    } catch (e) {
      setError(errorText(e, s.common.error));
    } finally {
      setBusy(null);
    }
  };

  if (roster.loading && !roster.data) return <Loading label={s.common.loading} />;
  if (roster.error) return <ErrorBox message={roster.error} onRetry={roster.reload} retryLabel={s.common.retry} />;
  if (!members.length) return <p className="text-[12.5px] text-ink-muted">{P.nobodyInScope}</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <Tabs
          tabs={(["pending", "acknowledged", "all"] as Filter[]).map((k) => ({ key: k, label: `${P[k]} (${counts[k]})` }))}
          active={filter}
          onChange={setFilter}
          label={`${title}: ${P.status}`}
        />
        <div className="relative sm:w-64">
          <label htmlFor={searchId} className="sr-only">
            {P.search}
          </label>
          <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input id={searchId} type="search" className={`${inputCls} pl-8`} placeholder={P.search} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      {notice && <Notice message={notice} />}
      {error && <ErrorBox message={error} />}
      {!shown.length ? (
        <p className="py-4 text-center text-[12.5px] text-ink-muted">
          {filter === "pending" && !q ? P.nonePending : P.noMatches}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-md border border-border" aria-label={`${title}: ${P[filter]}`}>
          {shown.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-surface px-3 py-2.5">
              <span
                aria-hidden
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-wash text-[12px] font-bold text-brand-dark"
              >
                {m.full_name.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold text-ink">
                  {m.full_name} {m.is_demo && <Badge tone="draft">{s.common.demo}</Badge>}
                </p>
                <p className="truncate text-[11.5px] text-ink-muted">
                  {m.email}
                  {" · "}
                  {m.home_country}
                  {m.department ? ` · ${m.department}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 pl-11 sm:pl-0">
                {m.acked_at ? (
                  <span className="text-[11.5px] text-ink-2">
                    <Badge tone="approved">{P.acknowledged}</Badge>{" "}
                    <time dateTime={m.acked_at} className="ml-1 whitespace-nowrap">
                      {fmtDateTime(m.acked_at)}
                    </time>
                  </span>
                ) : (
                  <>
                    <Badge tone="warn">{P.pending}</Badge>
                    {roster.data?.is_current && (
                      <Button
                        variant="ghost"
                        className="!px-2 !py-1"
                        busy={busy === m.id}
                        disabled={!!busy}
                        aria-label={`${P.remind}: ${m.full_name}`}
                        onClick={() => void remindOne(m)}
                      >
                        <Icon name="bell" className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{P.remind}</span>
                      </Button>
                    )}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PolicyCard({ policy }: { policy: PolicyDto }) {
  const { document: doc, versions } = policy;
  const defaultId = (versions.find((v) => v.is_current) ?? versions[0])?.id ?? "";
  const [selected, setSelected] = useState(defaultId);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<"remind" | "csv" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectId = useId();
  const panelId = useId();

  const ver = versions.find((v) => v.id === selected) ?? versions[0];
  const pending = ver ? ver.required - ver.acknowledged : 0;
  const scopeLabel = `${doc.country_code ?? P.global} · ${C.audiences[doc.audience as keyof typeof C.audiences] ?? doc.audience}`;

  const remindAll = async () => {
    if (!ver) return;
    setBusy("remind");
    setError(null);
    setNotice(null);
    try {
      const r = await api<{ reminded: number }>(API, { method: "POST", body: JSON.stringify({ version_id: ver.id, action: "remind" }) });
      setConfirm(false);
      setNotice(fmt(P.reminded, { count: r.reminded }));
    } catch (e) {
      setConfirm(false);
      setError(errorText(e, s.common.error));
    } finally {
      setBusy(null);
    }
  };

  const exportCsv = async () => {
    if (!ver) return;
    setBusy("csv");
    setError(null);
    try {
      await downloadCsv(ver.id);
    } catch (e) {
      setError(errorText(e, s.common.error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <li>
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-[14px] font-bold text-ink break-words">{doc.title}</h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-ink-muted">
              <span>{C.docCategories[doc.category as keyof typeof C.docCategories] ?? doc.category}</span>
              <span aria-hidden>·</span>
              <span>{scopeLabel}</span>
            </p>
          </div>
          {ver &&
            (versions.length > 1 ? (
              <div className="flex items-center gap-2">
                <label htmlFor={selectId} className="text-[11.5px] font-bold text-ink-2">
                  {P.version}
                </label>
                <select
                  id={selectId}
                  className={`${inputCls} !w-auto !py-1.5`}
                  value={selected}
                  onChange={(e) => {
                    setSelected(e.target.value);
                    setNotice(null);
                    setError(null);
                  }}
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.version} · {v.is_current ? P.current : v.effective_from}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <span className="flex items-center gap-1.5">
                <Badge tone="approved">{P.current}</Badge>
                <span className="text-[12px] font-bold text-ink-2">v{ver.version}</span>
              </span>
            ))}
        </div>

        {!ver ? (
          <p className="text-[12.5px] text-ink-muted">{P.noVersion}</p>
        ) : (
          <>
            <Progress done={ver.acknowledged} total={ver.required} label={`${doc.title} v${ver.version}`} />
            {ver.required === 0 && <p className="text-[12px] text-ink-muted">{P.nobodyInScope}</p>}
            {!ver.is_current && <Notice tone="warn" message={P.olderHint} />}
            {notice && <Notice message={notice} />}
            {error && <ErrorBox message={error} />}
            <div className="flex flex-wrap gap-1.5">
              <Button aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
                <Icon name={open ? "chevronUp" : "users"} className="w-3.5 h-3.5" />
                {open ? P.hide : P.view}
              </Button>
              <Button busy={busy === "csv"} onClick={() => void exportCsv()} disabled={!ver.required}>
                <Icon name="download" className="w-3.5 h-3.5" />
                {busy === "csv" ? P.exporting : P.exportCsv}
              </Button>
              <Button variant="primary" disabled={!ver.is_current || pending <= 0} onClick={() => setConfirm(true)}>
                <Icon name="bell" className="w-3.5 h-3.5" />
                {pending > 0 ? fmt(P.remindAll, { count: pending }) : P.remind}
              </Button>
            </div>
            <div id={panelId} hidden={!open}>
              {open && <People key={ver.id} versionId={ver.id} title={doc.title} />}
            </div>
          </>
        )}
      </Card>
      <ConfirmDialog
        open={confirm}
        title={P.remindConfirmTitle}
        body={fmt(P.remindConfirmBody, { count: pending, title: doc.title })}
        confirmLabel={P.remind}
        cancelLabel={s.common.cancel}
        busy={busy === "remind"}
        onConfirm={() => void remindAll()}
        onClose={() => setConfirm(false)}
      />
    </li>
  );
}

export default function PoliciesSection() {
  const list = useLoad(() => api<{ policies: PolicyDto[] }>(API), []);
  const policies = useMemo(() => list.data?.policies ?? [], [list.data]);
  const totals = useMemo(() => {
    let required = 0;
    let acked = 0;
    for (const p of policies) {
      const cur = p.versions.find((v) => v.is_current);
      if (cur) {
        required += cur.required;
        acked += cur.acknowledged;
      }
    }
    return { required, acked, pending: required - acked };
  }, [policies]);

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle
        title={P.title}
        body={P.subtitle}
        action={
          list.data && policies.length ? (
            <Button variant="ghost" onClick={() => void list.reload()} busy={list.loading}>
              {P.refresh}
            </Button>
          ) : undefined
        }
      />
      {list.loading && !list.data ? (
        <Loading label={s.common.loading} />
      ) : list.error ? (
        <ErrorBox message={list.error} onRetry={list.reload} retryLabel={s.common.retry} />
      ) : !policies.length ? (
        <Card>
          <Empty title={P.emptyTitle} body={P.emptyBody} />
          <div className="flex justify-center pb-4">
            <Link
              href="/nr-synergy-admin/content"
              className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-2 text-[12.5px] font-bold text-white hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              {P.goToContent}
            </Link>
          </div>
        </Card>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-2">
            {[
              { k: P.statPolicies, v: policies.length },
              { k: P.acknowledged, v: totals.acked },
              { k: P.pending, v: totals.pending },
            ].map((x) => (
              <div key={x.k} className="rounded-lg border border-border bg-surface px-3 py-2.5 shadow-sm">
                <dt className="truncate text-[11px] font-bold uppercase tracking-wide text-ink-muted">{x.k}</dt>
                <dd className="text-[20px] font-bold text-ink tabular-nums">{x.v}</dd>
              </div>
            ))}
          </dl>
          <ul className="flex flex-col gap-3">
            {policies.map((p) => (
              <PolicyCard key={p.document.id} policy={p} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
