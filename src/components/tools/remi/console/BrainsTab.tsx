"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { createClient } from "@/lib/supabase/client";
import { EVIDENCE_LABEL } from "../types";
import { api, areaCls, Btn, Card, Empty, Field, fmtDate, inputCls, canAdmin, type Role } from "./ui";

type Brain = {
  id: string;
  kind: string;
  title: string;
  source_url: string | null;
  file_name: string | null;
  summary: string | null;
  evidence_type: string | null;
  visibility: "public" | "internal";
  status: "processing" | "draft" | "approved" | "archived" | "failed";
  countries: string[];
  species: string[];
  tags: string[];
  priority: number;
  expires_at: string | null;
  error: string | null;
  chunk_count: number;
  char_count: number;
  version: number;
  last_synced_at: string | null;
  updated_at: string;
};

const KINDS: { v: string; label: string; icon: string; hint: string }[] = [
  { v: "document", label: "Product material", icon: "fileText", hint: "Catalogues, brochures, technical data sheets, labels, price lists" },
  { v: "research", label: "Research & trials", icon: "flask", hint: "Peer-reviewed papers, field trials, in-house studies" },
  { v: "faq", label: "FAQ", icon: "chat", hint: "Approved questions & answers" },
  { v: "pitch", label: "Sales pitch & objections", icon: "target", hint: "How to position, handle objections (usually Internal)" },
  { v: "competitor", label: "Competitor intel", icon: "shield", hint: "Comparisons — kept Internal, never quoted" },
  { v: "note", label: "Own notes", icon: "edit", hint: "Anything else the agent should know" },
  { v: "weblink", label: "Web page", icon: "link", hint: "Product pages, registrations, articles" },
];

const STATUS_STYLE: Record<string, string> = {
  approved: "bg-good-wash text-good-text border-good/30",
  draft: "bg-warning-wash text-[#8a5a00] border-warning/40",
  processing: "bg-brand-wash text-brand border-brand/20",
  failed: "bg-critical-wash text-critical border-critical/30",
  archived: "bg-page text-ink-muted border-border",
};

function MetaFields({ v, set }: { v: Record<string, unknown>; set: (k: string, val: unknown) => void }) {
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <Field label="Type">
        <select className={inputCls} value={String(v.kind || "document")} onChange={(e) => set("kind", e.target.value)}>
          {KINDS.map((k) => <option key={k.v} value={k.v}>{k.label}</option>)}
        </select>
      </Field>
      <Field label="Evidence type" hint="Shown to customers as the proof behind an answer">
        <select className={inputCls} value={String(v.evidence_type || "")} onChange={(e) => set("evidence_type", e.target.value || null)}>
          <option value="">Auto-detect</option>
          {Object.entries(EVIDENCE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </Field>
      <Field label="Visibility" hint="Internal = the agent uses it for reasoning but never quotes it">
        <select className={inputCls} value={String(v.visibility || "public")} onChange={(e) => set("visibility", e.target.value)}>
          <option value="public">Public — can be quoted to customers</option>
          <option value="internal">Internal — guidance only</option>
        </select>
      </Field>
      <Field label="Priority (0–5)" hint="Higher wins when sources overlap">
        <input type="number" min={0} max={5} className={inputCls} value={Number(v.priority || 0)} onChange={(e) => set("priority", Number(e.target.value))} />
      </Field>
      <Field label="Countries (comma separated)" hint="Where this applies / is registered">
        <input className={inputCls} value={Array.isArray(v.countries) ? (v.countries as string[]).join(", ") : String(v.countries || "")} onChange={(e) => set("countries", e.target.value)} />
      </Field>
      <Field label="Species / applications">
        <input className={inputCls} value={Array.isArray(v.species) ? (v.species as string[]).join(", ") : String(v.species || "")} onChange={(e) => set("species", e.target.value)} />
      </Field>
      <Field label="Expires on" hint="Expired sources are never used (e.g. old price lists)">
        <input type="date" className={inputCls} value={String(v.expires_at || "")} onChange={(e) => set("expires_at", e.target.value || null)} />
      </Field>
    </div>
  );
}

function AddBrain({ wsId, onAdded }: { wsId: string; onAdded: () => void }) {
  const [mode, setMode] = useState<"file" | "link" | "text">("file");
  const [meta, setMeta] = useState<Record<string, unknown>>({ kind: "document", visibility: "public", priority: 0 });
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [approve, setApprove] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const set = (k: string, v: unknown) => setMeta((m) => ({ ...m, [k]: v }));

  async function submit() {
    setLog([]);
    const base = { ...meta, approve, title: title || undefined };
    try {
      if (mode === "file") {
        if (!files.length) return;
        const supabase = createClient();
        for (const f of files) {
          setBusy(`Uploading ${f.name}…`);
          const up = await api<{ path: string; token: string }>(`/api/remi/w/${wsId}/brains/upload-url`, { method: "POST", json: { file_name: f.name, size: f.size } });
          const { error } = await supabase.storage.from("remi-brains").uploadToSignedUrl(up.path, up.token, f, { contentType: f.type || undefined });
          if (error) throw new Error(error.message);
          setBusy(`Reading & learning ${f.name}…`);
          const r = await api<{ ok: boolean; error: string | null }>(`/api/remi/w/${wsId}/brains`, {
            method: "POST",
            json: { ...base, title: files.length === 1 ? base.title : undefined, storage_path: up.path, file_name: f.name, mime: f.type },
          });
          setLog((l) => [...l, r.ok ? `✓ ${f.name}` : `✗ ${f.name}: ${r.error}`]);
        }
        setFiles([]);
      } else if (mode === "link") {
        setBusy("Reading the page…");
        const r = await api<{ ok: boolean; error: string | null }>(`/api/remi/w/${wsId}/brains`, { method: "POST", json: { ...base, kind: meta.kind === "document" ? "weblink" : meta.kind, url } });
        setLog([r.ok ? "✓ Page learned" : `✗ ${r.error}`]);
        setUrl("");
      } else {
        setBusy("Learning…");
        const r = await api<{ ok: boolean; error: string | null }>(`/api/remi/w/${wsId}/brains`, { method: "POST", json: { ...base, text } });
        setLog([r.ok ? "✓ Saved" : `✗ ${r.error}`]);
        setText("");
      }
      setTitle("");
      onAdded();
    } catch (e) {
      setLog((l) => [...l, `✗ ${(e as Error).message}`]);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card title="Add knowledge to Dr.Remi's brain" icon="brain">
      <div className="flex gap-1.5 mb-3">
        {([["file", "Upload files", "upload"], ["link", "Web link", "link"], ["text", "Write / paste", "edit"]] as const).map(([m, l, i]) => (
          <button key={m} onClick={() => setMode(m)} className={`h-8 px-3 rounded-xl text-[12px] font-semibold border inline-flex items-center gap-1.5 ${mode === m ? "bg-brand text-white border-brand" : "bg-surface border-border text-ink-2"}`}>
            <Icon name={i} className="w-3.5 h-3.5" /> {l}
          </button>
        ))}
      </div>
      <div className="grid sm:grid-cols-4 lg:grid-cols-7 gap-1.5 mb-3">
        {KINDS.filter((k) => mode === "link" || k.v !== "weblink").map((k) => (
          <button key={k.v} onClick={() => set("kind", k.v)} title={k.hint} className={`text-left p-2 rounded-xl border text-[11px] ${meta.kind === k.v ? "border-brand bg-brand-wash" : "border-border bg-page hover:border-brand/40"}`}>
            <Icon name={k.icon} className="w-4 h-4 text-brand" />
            <div className="font-semibold mt-1 leading-tight">{k.label}</div>
          </button>
        ))}
      </div>

      {mode === "file" && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            setFiles(Array.from(e.dataTransfer.files).slice(0, 20));
          }}
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-border rounded-2xl p-6 text-center cursor-pointer hover:border-brand/50 bg-page"
        >
          <input ref={fileRef} type="file" multiple hidden accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.md,.html,.htm,.json,.png,.jpg,.jpeg,.webp" onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 20))} />
          <Icon name="upload" className="w-6 h-6 text-brand mx-auto" />
          <div className="text-[12.5px] font-semibold mt-1">{files.length ? files.map((f) => f.name).join(", ") : "Drop files or click to choose"}</div>
          <div className="text-[11px] text-ink-muted">PDF, Word, Excel/CSV, text, HTML, images of brochures/labels · up to 40 MB each · any language</div>
        </div>
      )}
      {mode === "link" && <input className={inputCls} placeholder="https://… product page, registration, article or PDF link" value={url} onChange={(e) => setUrl(e.target.value)} />}
      {mode === "text" && <textarea rows={7} className={areaCls} placeholder={"e.g.\nQ: Can Product X be used in layers?\nA: Yes — 1 kg per tonne of feed… (source: label 2025)"} value={text} onChange={(e) => setText(e.target.value)} />}

      <div className="mt-3 grid sm:grid-cols-2 gap-3">
        <Field label="Title (optional)"><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Auto from file / page" /></Field>
      </div>
      <details className="mt-3">
        <summary className="text-[12px] font-semibold text-brand cursor-pointer">Evidence, visibility, countries, expiry…</summary>
        <div className="mt-3"><MetaFields v={meta} set={set} /></div>
      </details>
      <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
        <label className="text-[12px] flex items-center gap-1.5">
          <input type="checkbox" checked={approve} onChange={(e) => setApprove(e.target.checked)} /> Approve immediately (otherwise saved as Draft for review)
        </label>
        <Btn variant="primary" disabled={!!busy || (mode === "file" ? !files.length : mode === "link" ? !url.trim() : text.trim().length < 20)} onClick={submit}>
          {busy || "Add to brain"}
        </Btn>
      </div>
      {!!log.length && <ul className="mt-2 text-[11.5px] space-y-0.5">{log.map((l, i) => <li key={i} className={l.startsWith("✓") ? "text-good-text" : "text-critical"}>{l}</li>)}</ul>}
    </Card>
  );
}

function EditBrain({ wsId, brain, onClose, onSaved }: { wsId: string; brain: Brain; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState<Record<string, unknown>>({ ...brain });
  const [content, setContent] = useState<string | null>(null);
  const [download, setDownload] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editableText = !brain.file_name && !brain.source_url;
  useEffect(() => {
    api<{ brain: { content_text: string }; download: string | null }>(`/api/remi/w/${wsId}/brains/${brain.id}`).then((d) => {
      setContent(d.brain.content_text);
      setDownload(d.download);
    });
  }, [wsId, brain.id]);
  async function save() {
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        title: v.title, kind: v.kind, evidence_type: v.evidence_type, visibility: v.visibility, priority: v.priority,
        countries: v.countries, species: v.species, expires_at: v.expires_at,
      };
      if (editableText && content !== null) body.text = content;
      const r = await api<{ ok: boolean; error: string | null }>(`/api/remi/w/${wsId}/brains/${brain.id}`, { method: "PATCH", json: body });
      if (!r.ok) alert(r.error);
      onSaved();
      onClose();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl shadow-soft w-full max-w-3xl max-h-[90vh] overflow-y-auto p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="font-bold">Edit source · v{brain.version}</div>
          <button onClick={onClose} aria-label="Close"><Icon name="x" className="w-4 h-4" /></button>
        </div>
        <Field label="Title"><input className={inputCls} value={String(v.title || "")} onChange={(e) => setV({ ...v, title: e.target.value })} /></Field>
        <MetaFields v={v} set={(k, val) => setV((x) => ({ ...x, [k]: val }))} />
        <Field label={editableText ? "Content (editing re-trains this source)" : "Extracted text (read-only)"}>
          <textarea rows={10} readOnly={!editableText} className={`${areaCls} font-mono text-[11.5px]`} value={content ?? "Loading…"} onChange={(e) => setContent(e.target.value)} />
        </Field>
        <div className="flex justify-between items-center">
          {download ? <a href={download} target="_blank" rel="noreferrer" className="text-[12px] font-semibold text-brand inline-flex items-center gap-1"><Icon name="download" className="w-3.5 h-3.5" /> Original file</a> : <span />}
          <div className="flex gap-2"><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</Btn></div>
        </div>
      </div>
    </div>
  );
}

export default function BrainsTab({ wsId, role, onExtractProducts }: { wsId: string; role: Role; onExtractProducts: (brainId: string) => void }) {
  const [brains, setBrains] = useState<Brain[] | null>(null);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Brain | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const admin = canAdmin(role);

  const load = useCallback(() => {
    api<{ brains: Brain[] }>(`/api/remi/w/${wsId}/brains`).then((d) => setBrains(d.brains)).catch(() => setBrains([]));
  }, [wsId]);
  useEffect(load, [load]);

  async function act(b: Brain, action: string) {
    if (action === "delete") {
      if (!confirm(`Delete "${b.title}"? The agent will forget it.`)) return;
      setBusyId(b.id);
      await api(`/api/remi/w/${wsId}/brains/${b.id}`, { method: "DELETE" }).catch((e) => alert(e.message));
    } else {
      setBusyId(b.id);
      const r = await api<{ ok: boolean; error: string | null }>(`/api/remi/w/${wsId}/brains/${b.id}`, { method: "PATCH", json: { action } }).catch((e) => ({ ok: false, error: e.message }));
      if (!r.ok && r.error) alert(r.error);
    }
    setBusyId(null);
    load();
  }

  const list = (brains || []).filter((b) => (filter === "all" ? b.status !== "archived" : b.status === filter) && (!q || `${b.title} ${b.summary}`.toLowerCase().includes(q.toLowerCase())));
  const counts = (brains || []).reduce<Record<string, number>>((m, b) => ((m[b.status] = (m[b.status] || 0) + 1), m), {});

  return (
    <div className="space-y-4">
      {admin && <AddBrain wsId={wsId} onAdded={load} />}
      <Card
        title={`Brains (${(brains || []).length})`}
        icon="book"
        action={
          <div className="flex gap-1.5 items-center">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-8 w-36 rounded-xl border border-border bg-page px-2.5 text-[12px]" />
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="h-8 rounded-xl border border-border bg-page px-2 text-[12px]">
              <option value="all">Active</option>
              {["approved", "draft", "failed", "archived"].map((s) => <option key={s} value={s}>{s} ({counts[s] || 0})</option>)}
            </select>
          </div>
        }
      >
        <p className="text-[11.5px] text-ink-muted mb-3">
          Only <b>Approved</b> sources are used with customers. The agent answers in the customer&apos;s language from these sources — even when the source is in another language — and shows the evidence behind each claim.
        </p>
        {!brains ? (
          <div className="text-sm text-ink-muted">Loading…</div>
        ) : !list.length ? (
          <Empty icon="brain" title="No sources here yet">Upload your catalogue, technical data sheets and trial reports to start.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {list.map((b) => (
              <li key={b.id} className="py-3 flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-brand-wash text-brand flex items-center justify-center flex-shrink-0">
                  <Icon name={KINDS.find((k) => k.v === b.kind)?.icon || "fileText"} className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-[12.5px]">{b.title}</span>
                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full border ${STATUS_STYLE[b.status]}`}>{b.status}</span>
                    {b.visibility === "internal" && <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-border bg-page text-ink-muted">INTERNAL</span>}
                    {b.evidence_type && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-wash text-brand">{EVIDENCE_LABEL[b.evidence_type]}</span>}
                  </div>
                  {b.summary && <p className="text-[11.5px] text-ink-2 mt-0.5 line-clamp-2">{b.summary}</p>}
                  {b.error && <p className="text-[11.5px] text-critical mt-0.5">{b.error}</p>}
                  <div className="text-[10.5px] text-ink-muted mt-0.5">
                    {b.file_name || (b.source_url ? new URL(b.source_url).hostname : b.kind)} · {b.chunk_count} passages · {Math.round(b.char_count / 1000)}k chars · v{b.version} · {fmtDate(b.updated_at)}
                    {b.countries?.length ? ` · ${b.countries.join(", ")}` : ""}
                    {b.expires_at ? ` · expires ${b.expires_at}` : ""}
                  </div>
                </div>
                {admin && (
                  <div className="flex flex-wrap gap-1 justify-end flex-shrink-0 max-w-[260px]">
                    {b.status !== "approved" && b.status !== "failed" && <Btn variant="soft" disabled={busyId === b.id} onClick={() => act(b, "approve")}>Approve</Btn>}
                    {b.status === "approved" && <Btn disabled={busyId === b.id} onClick={() => act(b, "draft")}>Unpublish</Btn>}
                    {(b.source_url || b.status === "failed") && <Btn disabled={busyId === b.id} onClick={() => act(b, "resync")} title="Re-read and re-learn"><Icon name="refresh" className="w-3.5 h-3.5" /></Btn>}
                    {(b.kind === "document" || b.kind === "weblink") && b.status !== "failed" && <Btn onClick={() => onExtractProducts(b.id)} title="Draft product cards from this source"><Icon name="box" className="w-3.5 h-3.5" /></Btn>}
                    <Btn onClick={() => setEditing(b)} title="Edit"><Icon name="edit" className="w-3.5 h-3.5" /></Btn>
                    {b.status !== "archived" ? <Btn onClick={() => act(b, "archive")} title="Archive"><Icon name="boxArchive" className="w-3.5 h-3.5" /></Btn> : null}
                    <Btn variant="danger" onClick={() => act(b, "delete")} title="Delete"><Icon name="trash" className="w-3.5 h-3.5" /></Btn>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing && <EditBrain wsId={wsId} brain={editing} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  );
}
