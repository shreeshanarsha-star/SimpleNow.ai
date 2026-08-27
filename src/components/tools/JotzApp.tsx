"use client";

import { useCallback, useRef, useState } from "react";
import Icon from "@/components/Icon";

type JotzCategory =
  | "contacts"
  | "documents"
  | "receipts"
  | "photos"
  | "places"
  | "memories"
  | "products"
  | "notes"
  | "tasks"
  | "others";

const CATEGORIES: { key: JotzCategory; label: string; icon: string }[] = [
  { key: "contacts", label: "Contacts", icon: "users" },
  { key: "documents", label: "Documents", icon: "book" },
  { key: "receipts", label: "Receipts", icon: "receipt" },
  { key: "photos", label: "Photos", icon: "image" },
  { key: "places", label: "Places", icon: "mapPin" },
  { key: "memories", label: "Memories", icon: "sparkle" },
  { key: "products", label: "Products", icon: "gift" },
  { key: "notes", label: "Notes", icon: "penSignature" },
  { key: "tasks", label: "Tasks", icon: "check" },
  { key: "others", label: "Others", icon: "boxArchive" },
];

const LABEL_BY_KEY: Record<JotzCategory, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c.label])
) as Record<JotzCategory, string>;

type JotzItem = {
  id: string;
  category: JotzCategory;
  item_type: string | null;
  title: string;
  ai_summary: string | null;
  extracted_data: Record<string, unknown>;
  tags: string[];
  file_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  ai_status: "pending" | "processing" | "done" | "failed";
  ai_confidence: "high" | "medium" | "low" | null;
  task_done: boolean;
  created_at: string;
};

type FeedEntry = {
  key: string;
  fileName: string;
  status: "understanding" | "done" | "error";
  category?: JotzCategory;
  message?: string;
};

const MAX_BATCH = 10;
const ACCEPT = "image/*,.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function newKey() {
  return Math.random().toString(36).slice(2);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function prettyLabel(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function prettyValue(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) {
    return v
      .map((item) => (typeof item === "object" && item !== null ? Object.values(item).filter(Boolean).join(" · ") : String(item)))
      .filter(Boolean)
      .join(", ");
  }
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).filter(Boolean).join(" · ");
  return String(v);
}

export default function JotzApp() {
  const [dragOver, setDragOver] = useState(false);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [category, setCategory] = useState<JotzCategory | "">("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<JotzItem[] | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const loadItems = useCallback(async (cat: JotzCategory | "", q: string) => {
    if (!cat && !q.trim()) {
      setItems(null);
      return;
    }
    setListLoading(true);
    setListError(null);
    try {
      const params = new URLSearchParams();
      if (cat) params.set("category", cat);
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/jotz/items?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't load that.");
      setItems(data.items || []);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Couldn't load that.");
      setItems([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  function selectCategory(cat: JotzCategory | "") {
    setCategory(cat);
    setExpandedId(null);
    loadItems(cat, query);
  }

  function runSearch(q: string) {
    setQuery(q);
    if (q.trim() || category) loadItems(category, q);
    else setItems(null);
  }

  const refreshIfViewing = useCallback(
    (savedCategory: JotzCategory) => {
      if (category === savedCategory || query.trim()) loadItems(category, query);
    },
    [category, query, loadItems]
  );

  async function captureOne(file: File) {
    const key = newKey();
    setFeed((f) => [{ key, fileName: file.name, status: "understanding" as const }, ...f].slice(0, 6));

    if (file.size > 20 * 1024 * 1024) {
      setFeed((f) => f.map((e) => (e.key === key ? { ...e, status: "error", message: "That file is too large (max 20MB)." } : e)));
      return;
    }

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/jotz/capture", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 207) throw new Error(data.error || "Couldn't capture that.");

      const savedCategory: JotzCategory = data.item?.category || "others";
      setFeed((f) =>
        f.map((e) =>
          e.key === key
            ? {
                ...e,
                status: "done",
                category: savedCategory,
                message: data.item?.ai_status === "failed" ? data.item.ai_summary : undefined,
              }
            : e
        )
      );
      refreshIfViewing(savedCategory);
    } catch (err) {
      setFeed((f) =>
        f.map((e) =>
          e.key === key ? { ...e, status: "error", message: err instanceof Error ? err.message : "Couldn't capture that." } : e
        )
      );
    }
  }

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const files = Array.from(list).slice(0, MAX_BATCH);
    for (const file of files) {
      // Sequential on purpose: keeps AI calls from piling up and keeps the
      // "Jotz.ai is understanding this..." feed readable one at a time.
      // eslint-disable-next-line no-await-in-loop
      await captureOne(file);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  async function getFileUrl(
    id: string,
    opts: { download?: boolean } = {}
  ): Promise<{ url: string; fileName: string | null } | null> {
    const res = await fetch(`/api/jotz/items/${id}/file${opts.download ? "?download=1" : ""}`);
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Could not open that file.");
      return null;
    }
    return data;
  }

  async function handleView(id: string) {
    // No download=1 here -- the signed URL stays "inline" so images/PDFs
    // open and render directly in the new tab instead of downloading.
    const r = await getFileUrl(id);
    if (r) window.open(r.url, "_blank", "noopener,noreferrer");
  }

  async function handleDownload(id: string) {
    const r = await getFileUrl(id, { download: true });
    if (!r) return;
    const a = document.createElement("a");
    a.href = r.url;
    a.download = r.fileName || "jotz-file";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function handleShare(id: string) {
    const r = await getFileUrl(id);
    if (!r) return;
    if (navigator.share) {
      try {
        await navigator.share({ url: r.url, title: r.fileName || "Jotz item" });
        return;
      } catch {
        // fall through to clipboard
      }
    }
    await navigator.clipboard.writeText(r.url).catch(() => null);
    alert("Link copied -- it stays valid for a few minutes.");
  }

  async function patchItem(id: string, patch: Record<string, unknown>) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/jotz/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't update that.");
      setItems((prev) => (prev ? prev.map((it) => (it.id === id ? data.item : it)) : prev));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Couldn't update that.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this item and its original file?")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/jotz/items/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't delete that.");
      setItems((prev) => (prev ? prev.filter((it) => it.id !== id) : prev));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Couldn't delete that.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="m-0 text-[20px] font-bold flex items-center gap-2">
          <Icon name="boxArchive" className="w-5 h-5 text-brand" />
          Jotz
        </h1>
        <p className="m-0 mt-1 text-[13px] text-ink-muted">Jotz it. We&rsquo;ll sort it. You&rsquo;ll find it later.</p>
      </div>

      {/* Capture */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => uploadInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl px-6 py-10 text-center cursor-pointer transition-colors ${
          dragOver ? "border-brand bg-brand-wash" : "border-border bg-surface hover:bg-page"
        }`}
      >
        <Icon name="boxArchive" className="w-8 h-8 mx-auto mb-3 text-brand" />
        <p className="m-0 text-[15px] font-bold">Click / drop &middot; Jotz.ai</p>
        <p className="m-0 mt-1.5 text-[12.5px] text-ink-muted max-w-sm mx-auto">
          We&rsquo;ll analyse, sort and keep it so you can access it later.
        </p>

        <div
          className="flex flex-wrap items-center justify-center gap-2 mt-5"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => cameraInputRef.current?.click()}
            className="flex items-center gap-1.5 text-[12.5px] font-bold px-3.5 py-2 rounded-full border border-border bg-page hover:border-brand transition-colors"
          >
            <Icon name="camera" className="w-4 h-4" /> Take a photo
          </button>
          <button
            onClick={() => uploadInputRef.current?.click()}
            className="flex items-center gap-1.5 text-[12.5px] font-bold px-3.5 py-2 rounded-full border border-border bg-page hover:border-brand transition-colors"
          >
            <Icon name="upload" className="w-4 h-4" /> Upload
          </button>
          <span className="flex items-center gap-1.5 text-[12.5px] font-semibold px-3.5 py-2 rounded-full text-ink-muted">
            <Icon name="chevronUp" className="w-4 h-4" /> Drag &amp; drop
          </span>
        </div>

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={uploadInputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* Processing feed -- transient status only, never a dashboard */}
      {feed.length > 0 && (
        <div className="flex flex-col gap-1.5 -mt-2">
          {feed.map((entry) => (
            <div
              key={entry.key}
              className={`text-[12.5px] rounded-md px-3 py-2 flex items-center gap-2 ${
                entry.status === "error" ? "bg-critical-wash text-critical" : "bg-page text-ink-2"
              }`}
            >
              {entry.status === "understanding" && (
                <span className="w-3 h-3 rounded-full border-2 border-brand border-t-transparent animate-spin flex-shrink-0" />
              )}
              {entry.status === "done" && <Icon name="check" className="w-3.5 h-3.5 text-good-text flex-shrink-0" />}
              {entry.status === "error" && <Icon name="x" className="w-3.5 h-3.5 flex-shrink-0" />}
              <span className="truncate flex-1">{entry.fileName}</span>
              <span className="font-semibold whitespace-nowrap">
                {entry.status === "understanding" && "Jotz.ai is understanding this…"}
                {entry.status === "done" && `Done. Saved to ${LABEL_BY_KEY[entry.category || "others"]}.`}
                {entry.status === "error" && (entry.message || "Couldn't save this.")}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* View + search */}
      <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-border">
        <div className="pt-4 flex flex-col sm:flex-row gap-2 flex-1">
          <select
            value={category}
            onChange={(e) => selectCategory(e.target.value as JotzCategory | "")}
            className="text-[13px] font-semibold border border-border rounded-md px-3 py-2 bg-surface flex-shrink-0"
          >
            <option value="">View ▾</option>
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            value={query}
            onChange={(e) => runSearch(e.target.value)}
            placeholder="Search — a name, a merchant, “things I need to follow up on”…"
            className="text-[13px] border border-border rounded-md px-3 py-2 bg-surface flex-1 min-w-0"
          />
        </div>
      </div>

      {/* Results */}
      {(category || query.trim()) && (
        <div className="flex flex-col gap-2">
          {listLoading && <p className="text-[12.5px] text-ink-muted">Loading…</p>}
          {listError && <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2">{listError}</div>}
          {!listLoading && items && items.length === 0 && (
            <p className="text-[12.5px] text-ink-muted border border-dashed border-border rounded-md px-4 py-6 text-center">
              Nothing here yet.
            </p>
          )}
          {items?.map((it) => (
            <JotzRow
              key={it.id}
              item={it}
              expanded={expandedId === it.id}
              busy={busyId === it.id}
              onToggle={() => setExpandedId(expandedId === it.id ? null : it.id)}
              onView={() => handleView(it.id)}
              onDownload={() => handleDownload(it.id)}
              onShare={() => handleShare(it.id)}
              onDelete={() => handleDelete(it.id)}
              onRecategorize={(cat) => patchItem(it.id, { category: cat })}
              onToggleTaskDone={() => patchItem(it.id, { task_done: !it.task_done })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function JotzRow({
  item,
  expanded,
  busy,
  onToggle,
  onView,
  onDownload,
  onShare,
  onDelete,
  onRecategorize,
  onToggleTaskDone,
}: {
  item: JotzItem;
  expanded: boolean;
  busy: boolean;
  onToggle: () => void;
  onView: () => void;
  onDownload: () => void;
  onShare: () => void;
  onDelete: () => void;
  onRecategorize: (cat: JotzCategory) => void;
  onToggleTaskDone: () => void;
}) {
  const data = item.extracted_data || {};
  const phone = typeof data.phone === "string" ? data.phone : "";
  const email = typeof data.email === "string" ? data.email : "";
  const waDigits = phone.replace(/[^\d]/g, "");

  return (
    <div className="border border-border rounded-md bg-surface overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-3.5 py-3 text-left">
        {item.category === "tasks" && (
          <span
            role="checkbox"
            aria-checked={item.task_done}
            onClick={(e) => {
              e.stopPropagation();
              onToggleTaskDone();
            }}
            className={`w-4.5 h-4.5 rounded-full border flex items-center justify-center flex-shrink-0 ${
              item.task_done ? "bg-good-wash border-good-text text-good-text" : "border-border"
            }`}
          >
            {item.task_done && <Icon name="check" className="w-3 h-3" />}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className={`m-0 text-[13.5px] font-bold truncate ${item.task_done ? "line-through text-ink-muted" : ""}`}>
            {item.title}
          </p>
          {item.ai_summary && <p className="m-0 text-[12px] text-ink-muted truncate">{item.ai_summary}</p>}
        </div>
        {item.ai_status === "failed" && (
          <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-warning-wash text-[#8a5a00] flex-shrink-0">
            Needs review
          </span>
        )}
        <span className="text-[11px] text-ink-muted flex-shrink-0 hidden sm:block">{fmtDate(item.created_at)}</span>
        <Icon name={expanded ? "chevronUp" : "chevronDown"} className="w-4 h-4 text-ink-muted flex-shrink-0" />
      </button>

      {expanded && (
        <div className="px-3.5 pb-3.5 flex flex-col gap-3 border-t border-border pt-3">
          {Object.keys(data).length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
              {Object.entries(data)
                .filter(([, v]) => prettyValue(v))
                .map(([k, v]) => (
                  <div key={k} className="text-[12.5px]">
                    <span className="text-ink-muted">{prettyLabel(k)}: </span>
                    <span className="text-ink-2 font-medium">{prettyValue(v)}</span>
                  </div>
                ))}
            </div>
          )}

          {item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.tags.map((t) => (
                <span key={t} className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-wash text-brand">
                  {t}
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {item.file_path && (
              <>
                <ActionButton icon="image" label="View" onClick={onView} />
                <ActionButton icon="download" label="Download" onClick={onDownload} />
                <ActionButton icon="share" label="Share" onClick={onShare} />
              </>
            )}
            {item.category === "contacts" && waDigits && (
              <ActionButton icon="whatsapp" label="WhatsApp" href={`https://wa.me/${waDigits}`} />
            )}
            {item.category === "contacts" && phone && <ActionButton icon="phone" label="Call" href={`tel:${phone}`} />}
            {item.category === "contacts" && email && <ActionButton icon="mail" label="Email" href={`mailto:${email}`} />}
            {item.category === "products" && typeof data.product_name === "string" && (
              <ActionButton
                icon="search"
                label="Research"
                href={`https://www.google.com/search?q=${encodeURIComponent(data.product_name)}`}
              />
            )}
            {item.category === "notes" && (
              <ActionButton icon="check" label="Convert to Task" onClick={() => onRecategorize("tasks")} disabled={busy} />
            )}

            <div className="flex items-center gap-1.5 ml-auto">
              <label className="text-[11.5px] text-ink-muted flex items-center gap-1.5">
                Move to
                <select
                  value={item.category}
                  disabled={busy}
                  onChange={(e) => onRecategorize(e.target.value as JotzCategory)}
                  className="text-[11.5px] border border-border rounded-sm px-1.5 py-1 bg-page"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                onClick={onDelete}
                disabled={busy}
                className="text-critical hover:bg-critical-wash rounded-sm p-1.5 disabled:opacity-50"
                aria-label="Delete"
              >
                <Icon name="trash" className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  href,
  disabled,
}: {
  icon: string;
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
}) {
  const cls =
    "flex items-center gap-1.5 text-[11.5px] font-bold px-2.5 py-1.5 rounded-full border border-border bg-page hover:border-brand transition-colors disabled:opacity-50";
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        <Icon name={icon} className="w-3.5 h-3.5" /> {label}
      </a>
    );
  }
  return (
    <button onClick={onClick} disabled={disabled} className={cls}>
      <Icon name={icon} className="w-3.5 h-3.5" /> {label}
    </button>
  );
}
