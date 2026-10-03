"use client";

import { useState } from "react";
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
  inputCls,
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

function Versions({ doc }: { doc: Item }) {
  const list = useLoad(() => api<{ versions: DocumentVersionDto[] }>(`/api/nr-synergy/admin/versions?document_id=${doc.id}`), [doc.id]);
  const [adding, setAdding] = useState(false);
  const [v, setV] = useState({ version: "", effective_from: todayIso(), summary: "", body_markdown: "" });
  const [publish, setPublish] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setBusy("add");
    setError(null);
    try {
      await api("/api/nr-synergy/admin/versions", { method: "POST", body: JSON.stringify({ ...v, document_id: doc.id, publish }) });
      setAdding(false);
      setV({ version: "", effective_from: todayIso(), summary: "", body_markdown: "" });
      await list.reload();
    } catch (e) {
      setError(errorText(e, s.common.error));
    } finally {
      setBusy(null);
    }
  };
  const doPublish = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      await api("/api/nr-synergy/admin/versions", { method: "PATCH", body: JSON.stringify({ id, publish: true }) });
      await list.reload();
    } catch (e) {
      setError(errorText(e, s.common.error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-3 border-t border-border pt-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[12.5px] font-bold text-ink">{C.versions}</h4>
        {!adding && <Button onClick={() => setAdding(true)}>{C.addVersion}</Button>}
      </div>
      {error && <ErrorBox message={error} />}
      {adding && (
        <form
          className="flex flex-col gap-2 rounded-md border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Field label={C.version}>{(id) => <input id={id} required maxLength={20} className={inputCls} value={v.version} onChange={(e) => setV({ ...v, version: e.target.value })} />}</Field>
            <Field label={C.effectiveFrom}>
              {(id) => <input id={id} type="date" required className={inputCls} value={v.effective_from} onChange={(e) => setV({ ...v, effective_from: e.target.value })} />}
            </Field>
            <Field label={C.summary} className="sm:col-span-2">
              {(id) => <input id={id} className={inputCls} value={v.summary} onChange={(e) => setV({ ...v, summary: e.target.value })} />}
            </Field>
            <Field label={C.markdown} className="sm:col-span-2">
              {(id) => <textarea id={id} rows={8} className={`${inputCls} font-mono text-[12px]`} value={v.body_markdown} onChange={(e) => setV({ ...v, body_markdown: e.target.value })} />}
            </Field>
          </div>
          <label className="inline-flex items-center gap-2 text-[12.5px] text-ink-2">
            <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
            {C.publishOnSave}
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAdding(false)}>
              {s.common.cancel}
            </Button>
            <Button type="submit" variant="primary" busy={busy === "add"}>
              {s.common.save}
            </Button>
          </div>
        </form>
      )}
      {list.loading && !list.data ? (
        <Loading label={s.common.loading} />
      ) : list.error ? (
        <ErrorBox message={list.error} onRetry={list.reload} retryLabel={s.common.retry} />
      ) : !list.data?.versions.length ? (
        <p className="text-[12px] text-ink-muted">{C.versionsEmpty}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {list.data.versions.map((ver) => (
            <li key={ver.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-page px-3 py-1.5 text-[12.5px]">
              <span className="min-w-0">
                <strong>v{ver.version}</strong> · {ver.effective_from}
                {ver.summary ? ` · ${ver.summary}` : ""}
              </span>
              {ver.published_at ? (
                <Badge tone="approved">{C.published}</Badge>
              ) : (
                <Button variant="primary" busy={busy === ver.id} onClick={() => void doPublish(ver.id)}>
                  {C.publish}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
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
      return `${C.docCategories[it.category as keyof typeof C.docCategories] ?? ""} · ${it.country_code ?? C.global} · ${C.audiences[it.audience as keyof typeof C.audiences] ?? ""}`;
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
      <div className="flex justify-end">
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
