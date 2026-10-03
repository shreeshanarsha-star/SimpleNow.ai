"use client";

import Link from "next/link";
import { useState } from "react";
import Icon from "@/components/Icon";
import { admin as s } from "@/lib/nrs/i18n/en/admin";
import type { ContentKind, DocumentVersionDto } from "@/lib/nrs/invoice/adminTypes";
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
  Tabs,
  api,
  errorText,
  fmt,
  inputCls,
  openSignedUrl,
  todayIso,
  useLoad,
} from "@/app/tools/nr-synergy/money/_components/ui";

type Item = Record<string, unknown> & { id: string };
type FieldType = "text" | "textarea" | "select" | "checkbox" | "datetime" | "lines" | "number";

interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: { value: string; label: string }[];
  required?: boolean;
}

const C = s.content;
const opts = (o: Record<string, string>) => Object.entries(o).map(([value, label]) => ({ value, label }));

const FIELDS: Record<ContentKind, FieldDef[]> = {
  posts: [
    { key: "kind", label: C.kind, type: "select", options: opts(C.postKinds), required: true },
    { key: "title", label: C.title, type: "text", required: true },
    { key: "body", label: C.body, type: "textarea", required: true },
    { key: "pinned", label: C.pinned, type: "checkbox" },
  ],
  events: [
    { key: "kind", label: C.kind, type: "select", options: opts(C.eventKinds), required: true },
    { key: "title", label: C.title, type: "text", required: true },
    { key: "starts_at", label: C.startsAt, type: "datetime", required: true },
    { key: "location", label: C.location, type: "text" },
    { key: "link", label: C.link, type: "text" },
  ],
  documents: [
    { key: "title", label: C.title, type: "text", required: true },
    { key: "category", label: C.category, type: "select", options: opts(C.docCategories), required: true },
    { key: "country_code", label: C.country, type: "text" },
    { key: "audience", label: C.audience, type: "select", options: opts(C.audiences), required: true },
    { key: "requires_ack", label: C.requiresAck, type: "checkbox" },
  ],
  values: [
    { key: "name", label: C.name, type: "text", required: true },
    { key: "meaning", label: C.meaning, type: "textarea", required: true },
    { key: "behaviours", label: C.behaviours, type: "lines" },
    { key: "not_this", label: C.notThis, type: "lines" },
    { key: "leader_message", label: C.leaderMessage, type: "textarea" },
    { key: "sort", label: C.sort, type: "number" },
  ],
  quick_links: [
    { key: "title", label: C.title, type: "text", required: true },
    { key: "url", label: C.url, type: "text", required: true },
    { key: "description", label: C.description, type: "text" },
    { key: "sort", label: C.sort, type: "number" },
  ],
};

function toLocalInput(iso: unknown): string {
  if (typeof iso !== "string" || !iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function initialValues(kind: ContentKind, item: Item | null): Record<string, string | boolean> {
  const v: Record<string, string | boolean> = {};
  for (const f of FIELDS[kind]) {
    const raw = item?.[f.key];
    if (f.type === "checkbox") v[f.key] = raw === true;
    else if (f.type === "lines") v[f.key] = Array.isArray(raw) ? raw.join("\n") : "";
    else if (f.type === "datetime") v[f.key] = toLocalInput(raw);
    else if (f.type === "select") v[f.key] = typeof raw === "string" ? raw : (f.options?.[0]?.value ?? "");
    else v[f.key] = raw == null ? "" : String(raw);
  }
  return v;
}

function ItemForm({ kind, item, onSaved, onCancel }: { kind: ContentKind; item: Item | null; onSaved: () => void; onCancel: () => void }) {
  const [v, setV] = useState(() => initialValues(kind, item));
  const [publish, setPublish] = useState(kind === "posts" ? (item ? !!item.published_at : true) : false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = item ? { id: item.id } : {};
    for (const f of FIELDS[kind]) {
      const x = v[f.key];
      if (f.type === "lines") body[f.key] = String(x).split("\n").map((l) => l.trim()).filter(Boolean);
      else if (f.type === "datetime") body[f.key] = x ? new Date(String(x)).toISOString() : "";
      else if (f.type === "number") body[f.key] = x === "" ? null : Number(x);
      else if (f.type === "checkbox") body[f.key] = x === true;
      else body[f.key] = x;
    }
    if (kind === "posts") body.publish = publish;
    try {
      await api(`/api/nr-synergy/admin/content/${kind}`, { method: item ? "PATCH" : "POST", body: JSON.stringify(body) });
      onSaved();
    } catch (e) {
      setError(errorText(e, s.common.error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FIELDS[kind].map((f) =>
            f.type === "checkbox" ? (
              <label key={f.key} className="inline-flex items-center gap-2 text-[12.5px] text-ink-2 sm:col-span-2">
                <input type="checkbox" checked={v[f.key] === true} onChange={(e) => setV({ ...v, [f.key]: e.target.checked })} />
                {f.label}
              </label>
            ) : (
              <Field key={f.key} label={f.required ? f.label : `${f.label} (${s.common.optional})`} className={f.type === "textarea" || f.type === "lines" ? "sm:col-span-2" : ""}>
                {(id) =>
                  f.type === "select" ? (
                    <select id={id} className={inputCls} value={String(v[f.key])} onChange={(e) => setV({ ...v, [f.key]: e.target.value })}>
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : f.type === "textarea" || f.type === "lines" ? (
                    <textarea id={id} required={f.required} rows={f.type === "lines" ? 3 : 5} className={inputCls} value={String(v[f.key])} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />
                  ) : (
                    <input
                      id={id}
                      required={f.required}
                      type={f.type === "datetime" ? "datetime-local" : f.type === "number" ? "number" : "text"}
                      className={inputCls}
                      value={String(v[f.key])}
                      onChange={(e) => setV({ ...v, [f.key]: e.target.value })}
                    />
                  )
                }
              </Field>
            )
          )}
          {kind === "posts" && (
            <label className="inline-flex items-center gap-2 text-[12.5px] text-ink-2 sm:col-span-2">
              <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
              {C.publishNow}
            </label>
          )}
        </div>
        {error && <ErrorBox message={error} />}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            {s.common.cancel}
          </Button>
          <Button type="submit" variant="primary" busy={busy}>
            {s.common.save}
          </Button>
        </div>
      </form>
    </Card>
  );
}

type VersionDto = DocumentVersionDto & { has_file?: boolean };

const PDF_MAX = 15 * 1024 * 1024;
const BLANK_VERSION = { version: "", effective_from: "", summary: "", body_markdown: "" };

/** Client-side check before upload (the server re-checks size and magic bytes). */
function pdfProblem(f: File): string | null {
  const isPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
  if (!isPdf) return C.notPdf;
  if (f.size > PDF_MAX) return C.tooLarge;
  return null;
}

function fileSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** The published version in force today (same rule as the employee Library). */
function inForceId(versions: VersionDto[]): string | null {
  const today = todayIso();
  const pub = versions
    .filter((v) => v.published_at)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from) || String(b.published_at).localeCompare(String(a.published_at)));
  return (pub.find((v) => v.effective_from <= today) ?? pub[0])?.id ?? null;
}

function PdfPicker({ file, onChange, label }: { file: File | null; onChange: (f: File | null, problem: string | null) => void; label: string }) {
  return (
    <Field label={label} hint={C.fileHint} className="sm:col-span-2">
      {(id, describedBy) => (
        <div className="flex flex-wrap items-center gap-2">
          <input
            id={id}
            type="file"
            accept="application/pdf,.pdf"
            aria-describedby={describedBy}
            className="block w-full min-w-0 text-[12.5px] text-ink-2 file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-[12px] file:font-bold file:text-ink hover:file:bg-page sm:w-auto"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              const problem = f ? pdfProblem(f) : null;
              if (problem) e.target.value = "";
              onChange(problem ? null : f, problem);
            }}
          />
          {file && (
            <span className="text-[11.5px] text-ink-muted">
              {file.name} · {fileSize(file.size)}
            </span>
          )}
        </div>
      )}
    </Field>
  );
}

function Versions({ doc }: { doc: Item }) {
  const list = useLoad(() => api<{ versions: VersionDto[] }>(`/api/nr-synergy/admin/versions?document_id=${doc.id}`), [doc.id]);
  const requiresAck = doc.requires_ack === true;
  const [adding, setAdding] = useState(false);
  const [v, setV] = useState(() => ({ ...BLANK_VERSION, effective_from: todayIso() }));
  const [file, setFile] = useState<File | null>(null);
  const [publish, setPublish] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmPublish, setConfirmPublish] = useState<VersionDto | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<VersionDto | null>(null);

  const published = (notified: number | undefined) =>
    setNotice(requiresAck && notified ? fmt(C.publishedNotified, { count: notified }) : C.publishedOnly);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError(errorText(e, s.common.error));
    } finally {
      setBusy(null);
    }
  };

  const add = () =>
    run("add", async () => {
      if (!file && !v.body_markdown.trim()) throw new Error(C.fileOrText);
      const form = new FormData();
      form.set("document_id", doc.id);
      for (const [k, val] of Object.entries(v)) form.set(k, val);
      form.set("publish", String(publish));
      if (file) form.set("file", file);
      const r = await api<{ id: string; notified?: number }>("/api/nr-synergy/admin/versions", { method: "POST", body: form });
      setAdding(false);
      setV({ ...BLANK_VERSION, effective_from: todayIso() });
      setFile(null);
      if (publish) published(r.notified);
      else setNotice(s.common.saved);
      await list.reload();
    });

  const doPublish = (ver: VersionDto) =>
    run(ver.id, async () => {
      setConfirmPublish(null);
      const r = await api<{ notified?: number }>("/api/nr-synergy/admin/versions", { method: "PATCH", body: JSON.stringify({ id: ver.id, publish: true }) });
      published(r.notified);
      await list.reload();
    });

  const attach = (ver: VersionDto, f: File) =>
    run(`file-${ver.id}`, async () => {
      const problem = pdfProblem(f);
      if (problem) throw new Error(problem);
      const form = new FormData();
      form.set("id", ver.id);
      form.set("file", f);
      await api("/api/nr-synergy/admin/versions", { method: "PATCH", body: form });
      setNotice(s.common.saved);
      await list.reload();
    });

  const removeFile = (ver: VersionDto) =>
    run(`file-${ver.id}`, async () => {
      await api("/api/nr-synergy/admin/versions", { method: "PATCH", body: JSON.stringify({ id: ver.id, remove_file: true }) });
      setNotice(s.common.saved);
      await list.reload();
    });

  const removeDraft = (ver: VersionDto) =>
    run(`del-${ver.id}`, async () => {
      setConfirmDelete(null);
      await api(`/api/nr-synergy/admin/versions?id=${ver.id}`, { method: "DELETE" });
      setNotice(s.common.deleted);
      await list.reload();
    });

  const viewPdf = (ver: VersionDto) => run(`view-${ver.id}`, () => openSignedUrl(`/api/nr-synergy/admin/versions/${ver.id}/file`));

  const versions = list.data?.versions ?? [];
  const current = inForceId(versions);
  const today = todayIso();

  return (
    <div className="mt-3 border-t border-border pt-3 flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[12.5px] font-bold text-ink">{C.versionHistory}</h4>
        <div className="flex flex-wrap gap-1.5">
          {requiresAck && (
            <Link
              href="/nr-synergy-admin/policies"
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[12.5px] font-bold text-brand-dark hover:bg-page focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Icon name="check" className="w-3.5 h-3.5" />
              {C.trackAcks}
            </Link>
          )}
          {!adding && <Button onClick={() => setAdding(true)}>{C.addVersion}</Button>}
        </div>
      </div>
      {notice && <Notice message={notice} />}
      {error && <ErrorBox message={error} />}
      {adding && (
        <form
          className="flex flex-col gap-2 rounded-md border border-border bg-page/60 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Field label={C.version}>{(id) => <input id={id} required maxLength={20} placeholder="1.0" className={inputCls} value={v.version} onChange={(e) => setV({ ...v, version: e.target.value })} />}</Field>
            <Field label={C.effectiveFrom}>
              {(id) => <input id={id} type="date" required className={inputCls} value={v.effective_from} onChange={(e) => setV({ ...v, effective_from: e.target.value })} />}
            </Field>
            <Field label={`${C.summary} (${s.common.optional})`} className="sm:col-span-2">
              {(id) => <input id={id} maxLength={1000} className={inputCls} value={v.summary} onChange={(e) => setV({ ...v, summary: e.target.value })} />}
            </Field>
            <PdfPicker
              file={file}
              label={`${C.file} (${s.common.optional})`}
              onChange={(f, problem) => {
                setFile(f);
                setError(problem);
              }}
            />
            <Field label={`${C.markdown} (${s.common.optional})`} hint={C.fileOrText} className="sm:col-span-2">
              {(id, describedBy) => (
                <textarea
                  id={id}
                  rows={6}
                  aria-describedby={describedBy}
                  className={`${inputCls} font-mono text-[12px]`}
                  value={v.body_markdown}
                  onChange={(e) => setV({ ...v, body_markdown: e.target.value })}
                />
              )}
            </Field>
          </div>
          <label className="inline-flex items-center gap-2 text-[12.5px] text-ink-2">
            <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
            {C.publishOnSave}
            {publish && requiresAck && <span className="text-ink-muted">· {C.publishConfirmAck}</span>}
          </label>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setFile(null);
                setError(null);
              }}
            >
              {s.common.cancel}
            </Button>
            <Button type="submit" variant="primary" busy={busy === "add"}>
              {publish ? C.publish : s.common.save}
            </Button>
          </div>
        </form>
      )}
      {list.loading && !list.data ? (
        <Loading label={s.common.loading} />
      ) : list.error ? (
        <ErrorBox message={list.error} onRetry={list.reload} retryLabel={s.common.retry} />
      ) : !versions.length ? (
        <p className="text-[12px] text-ink-muted">{C.versionsEmpty}</p>
      ) : (
        <ol className="flex flex-col gap-1.5" aria-label={C.versionHistory}>
          {versions.map((ver) => {
            const isDraft = !ver.published_at;
            const hasText = !!ver.body_markdown?.trim();
            const fileBusy = busy === `file-${ver.id}`;
            return (
              <li key={ver.id} className={`rounded-md border px-3 py-2 text-[12.5px] ${ver.id === current ? "border-brand/40 bg-brand-wash/40" : "border-border bg-page"}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5">
                      <strong className="text-ink">v{ver.version}</strong>
                      {isDraft ? (
                        <Badge tone="draft">{C.draftVersion}</Badge>
                      ) : ver.id === current ? (
                        <Badge tone="approved">{C.inForce}</Badge>
                      ) : ver.effective_from > today ? (
                        <Badge tone="pending">{C.scheduled}</Badge>
                      ) : (
                        <Badge tone="superseded">{C.published}</Badge>
                      )}
                      {ver.has_file && <Badge tone="submitted">{C.pdf}</Badge>}
                      {hasText && <Badge tone="draft">{C.textOnly}</Badge>}
                      {!ver.has_file && !hasText && <Badge tone="warn">{C.noContent}</Badge>}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-ink-muted break-words">
                      {fmt(C.effectiveShort, { date: ver.effective_from })}
                      {ver.published_at ? ` · ${fmt(C.publishedOn, { date: ver.published_at.slice(0, 10) })}` : ""}
                      {ver.summary ? ` · ${ver.summary}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {ver.has_file && (
                      <Button variant="ghost" busy={busy === `view-${ver.id}`} onClick={() => void viewPdf(ver)}>
                        <Icon name="externalLink" className="w-3.5 h-3.5" />
                        {C.viewPdf}
                      </Button>
                    )}
                    {isDraft && (
                      <>
                        <label
                          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-[12.5px] font-bold text-ink hover:bg-page focus-within:ring-2 focus-within:ring-brand ${fileBusy ? "pointer-events-none opacity-60" : ""}`}
                        >
                          <Icon name="upload" className="w-3.5 h-3.5" />
                          {ver.has_file ? C.replaceFile : C.attachPdf}
                          <input
                            type="file"
                            accept="application/pdf,.pdf"
                            className="sr-only"
                            disabled={fileBusy}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              e.target.value = "";
                              if (f) void attach(ver, f);
                            }}
                          />
                        </label>
                        {ver.has_file && hasText && (
                          <Button variant="ghost" busy={fileBusy} onClick={() => void removeFile(ver)}>
                            {C.removeFile}
                          </Button>
                        )}
                        <Button variant="danger" busy={busy === `del-${ver.id}`} onClick={() => setConfirmDelete(ver)}>
                          {C.deleteDraft}
                        </Button>
                        <Button variant="primary" busy={busy === ver.id} disabled={!ver.has_file && !hasText} onClick={() => setConfirmPublish(ver)}>
                          {C.publish}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <ConfirmDialog
        open={!!confirmPublish}
        title={confirmPublish ? fmt(C.publishConfirmTitle, { version: confirmPublish.version }) : ""}
        body={`${C.publishConfirmBody}${requiresAck ? ` ${C.publishConfirmAck}` : ""}`}
        confirmLabel={C.publish}
        cancelLabel={s.common.cancel}
        busy={!!confirmPublish && busy === confirmPublish.id}
        onConfirm={() => confirmPublish && void doPublish(confirmPublish)}
        onClose={() => setConfirmPublish(null)}
      />
      <ConfirmDialog
        open={!!confirmDelete}
        title={C.deleteDraft}
        body={confirmDelete ? fmt(C.deleteDraftConfirm, { version: confirmDelete.version }) : ""}
        confirmLabel={C.deleteDraft}
        cancelLabel={s.common.cancel}
        danger
        onConfirm={() => confirmDelete && void removeDraft(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
      />
    </div>
  );
}

function title(kind: ContentKind, it: Item): string {
  return String(kind === "values" ? it.name : it.title);
}

function subtitle(kind: ContentKind, it: Item): string {
  switch (kind) {
    case "posts":
      return `${C.postKinds[it.kind as keyof typeof C.postKinds] ?? ""} · ${it.published_at ? C.published : C.draft}${it.pinned ? ` · ${C.pinned}` : ""}`;
    case "events":
      return `${C.eventKinds[it.kind as keyof typeof C.eventKinds] ?? ""} · ${typeof it.starts_at === "string" ? new Date(it.starts_at).toLocaleString() : ""}${it.location ? ` · ${it.location}` : ""}`;
    case "documents":
      return `${C.docCategories[it.category as keyof typeof C.docCategories] ?? ""} · ${it.country_code ?? C.global} · ${C.audiences[it.audience as keyof typeof C.audiences] ?? ""}${it.requires_ack ? ` · ${C.requiresAck}` : ""}`;
    case "values":
      return String(it.meaning ?? "");
    case "quick_links":
      return String(it.url ?? "");
  }
}

function KindPanel({ kind }: { kind: ContentKind }) {
  const list = useLoad(() => api<{ items: Item[] }>(`/api/nr-synergy/admin/content/${kind}`), [kind]);
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [openDoc, setOpenDoc] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    if (!toDelete) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/nr-synergy/admin/content/${kind}?id=${toDelete.id}`, { method: "DELETE" });
      setToDelete(null);
      setNotice(s.common.deleted);
      await list.reload();
    } catch (e) {
      setError(errorText(e, s.common.error));
      setToDelete(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap justify-end gap-1.5">
        {kind === "documents" && (
          <Link
            href="/nr-synergy-admin/policies"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-[12.5px] font-bold text-ink hover:bg-page focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Icon name="check" className="w-3.5 h-3.5" />
            {C.trackAcks}
          </Link>
        )}
        {!editing && (
          <Button variant="primary" onClick={() => setEditing("new")}>
            {C.add}
          </Button>
        )}
      </div>
      {notice && <Notice message={notice} />}
      {error && <ErrorBox message={error} />}
      {editing && (
        <ItemForm
          key={editing === "new" ? "new" : editing.id}
          kind={kind}
          item={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setNotice(s.common.saved);
            void list.reload();
          }}
        />
      )}
      {list.loading && !list.data ? (
        <Loading label={s.common.loading} />
      ) : list.error ? (
        <ErrorBox message={list.error} onRetry={list.reload} retryLabel={s.common.retry} />
      ) : !list.data?.items.length ? (
        <Card>
          <Empty title={C.emptyTitle} body={C.emptyBody} />
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.data.items.map((it) => (
            <li key={it.id}>
              <Card className="!p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-ink break-words">
                      {title(kind, it)} {it.is_demo === true && <Badge tone="draft">{s.common.demo}</Badge>}
                    </p>
                    <p className="text-[12px] text-ink-muted break-words line-clamp-2">{subtitle(kind, it)}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {kind === "documents" && (
                      <Button variant="ghost" aria-expanded={openDoc === it.id} onClick={() => setOpenDoc(openDoc === it.id ? null : it.id)}>
                        {C.versions}
                      </Button>
                    )}
                    <Button onClick={() => setEditing(it)}>{s.common.edit}</Button>
                    <Button variant="danger" onClick={() => setToDelete(it)}>
                      {kind === "documents" ? C.archive : s.common.delete}
                    </Button>
                  </div>
                </div>
                {kind === "documents" && openDoc === it.id && <Versions doc={it} />}
              </Card>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!toDelete}
        title={kind === "documents" ? C.archive : s.common.delete}
        body={toDelete ? `${title(kind, toDelete)}. ${s.common.deleteConfirm}` : ""}
        confirmLabel={kind === "documents" ? C.archive : s.common.delete}
        cancelLabel={s.common.cancel}
        danger
        busy={busy}
        onConfirm={() => void remove()}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}

interface JoeDto {
  md_message_title: string | null;
  md_video_url: string | null;
  md_transcript: string | null;
}

function JoePanel() {
  const data = useLoad(() => api<{ joe: JoeDto | null }>("/api/nr-synergy/admin/joe"), []);
  const [form, setForm] = useState<JoeDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const v = form ?? data.data?.joe ?? { md_message_title: "", md_video_url: "", md_transcript: "" };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/nr-synergy/admin/joe", { method: "PUT", body: JSON.stringify(v) });
      setNotice(s.common.saved);
    } catch (e) {
      setError(errorText(e, s.common.error));
    } finally {
      setBusy(false);
    }
  };

  if (data.loading && !data.data) return <Loading label={s.common.loading} />;
  if (data.error) return <ErrorBox message={data.error} onRetry={data.reload} retryLabel={s.common.retry} />;
  const set = (k: keyof JoeDto, val: string) => setForm({ ...v, [k]: val });
  return (
    <Card>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label={C.joeTitle}>{(id) => <input id={id} className={inputCls} value={v.md_message_title ?? ""} onChange={(e) => set("md_message_title", e.target.value)} />}</Field>
        <Field label={C.joeVideo}>{(id) => <input id={id} type="url" className={inputCls} value={v.md_video_url ?? ""} onChange={(e) => set("md_video_url", e.target.value)} />}</Field>
        <Field label={C.joeTranscript}>
          {(id) => <textarea id={id} rows={8} className={inputCls} value={v.md_transcript ?? ""} onChange={(e) => set("md_transcript", e.target.value)} />}
        </Field>
        {notice && <Notice message={notice} />}
        {error && <ErrorBox message={error} />}
        <div className="flex justify-end">
          <Button type="submit" variant="primary" busy={busy}>
            {s.common.save}
          </Button>
        </div>
      </form>
    </Card>
  );
}

type TabKey = ContentKind | "joe";
const TAB_KEYS: TabKey[] = ["posts", "events", "documents", "values", "quick_links", "joe"];

export default function ContentSection() {
  const [tab, setTab] = useState<TabKey>("posts");
  return (
    <div className="flex flex-col gap-3">
      <SectionTitle title={s.sections.content} />
      <Tabs tabs={TAB_KEYS.map((k) => ({ key: k, label: C.tabs[k] }))} active={tab} onChange={setTab} label={s.sections.content} />
      <div role="tabpanel" aria-label={C.tabs[tab]}>
        {tab === "joe" ? <JoePanel /> : <KindPanel key={tab} kind={tab} />}
      </div>
    </div>
  );
}
