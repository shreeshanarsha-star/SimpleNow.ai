"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Small per-project drop box for Smart Source.ai's My Projects table.
// One box handles both file types -- the server works out whether a file is
// a JD or a CV:
//  - a JD becomes the project's active JD (replacing any earlier one) and
//    every candidate in the project is re-scored against it;
//  - CVs are parsed and added to the project as new candidates.

const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPT = ".pdf,.docx,.txt,.md,.rtf,.csv,image/*";
const FILE_CONCURRENCY = 3;
const SCORE_CONCURRENCY = 3;
const SCORE_CHUNK = 6;

type FileResult = {
  status: "saved" | "added" | "duplicate" | "rejected" | "failed";
  kind?: "jd" | "cv";
  fileName?: string;
  name?: string | null;
  replaced?: boolean;
  error?: string;
};

type Toast = { tone: "ok" | "warn" | "err"; text: string; detail?: string };

async function runPool<T>(items: T[], limit: number, worker: (item: T, index: number) => Promise<void>) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

function newDropId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export default function ProjectDropBox({
  projectId,
  jdFileName,
  jdUpdatedAt,
  onChanged,
}: {
  projectId: string;
  jdFileName?: string | null;
  jdUpdatedAt?: string | null;
  onChanged: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const showToast = useCallback((t: Toast) => {
    setToast(t);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 12_000);
  }, []);

  const processFiles = useCallback(
    async (picked: File[]) => {
      if (!picked.length || busyLabel) return;
      setToast(null);

      // Same file dropped twice in one go -> once.
      const seen = new Set<string>();
      const files: File[] = [];
      for (const f of picked) {
        const key = `${f.name}|${f.size}|${f.lastModified}`;
        if (!seen.has(key)) {
          seen.add(key);
          files.push(f);
        }
      }

      const dropId = newDropId();
      const results: FileResult[] = [];
      let done = 0;
      setBusyLabel(files.length > 1 ? `Reading 0/${files.length}…` : "Reading file…");

      await runPool(files, FILE_CONCURRENCY, async (file) => {
        let result: FileResult;
        if (file.size > MAX_BYTES) {
          result = { status: "failed", fileName: file.name, error: "Too large (max 4MB)." };
        } else {
          try {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("dropId", dropId);
            const res = await fetch(`/api/smart-source/projects/${projectId}/drop`, { method: "POST", body: fd });
            const data = await res.json().catch(() => null);
            result = data && data.status ? data : { status: "failed", fileName: file.name, error: data?.error || "Upload failed." };
            if (!result.fileName) result.fileName = file.name;
          } catch {
            result = { status: "failed", fileName: file.name, error: "Network error." };
          }
        }
        results.push(result);
        done++;
        if (files.length > 1) setBusyLabel(`Reading ${done}/${files.length}…`);
      });

      // A JD landed in this drop -> re-score everyone against it (this also
      // covers CVs from the same drop that were filed before the JD arrived).
      const jdSaved = results.find((r) => r.status === "saved" && r.kind === "jd");
      let rescored = 0;
      let rescoreFailed = false;
      if (jdSaved) {
        try {
          setBusyLabel("Scoring profiles…");
          const planRes = await fetch(`/api/smart-source/projects/${projectId}/rescore`);
          const plan = await planRes.json();
          const ids: string[] = Array.isArray(plan?.memberIds) ? plan.memberIds : [];
          const chunks: string[][] = [];
          for (let i = 0; i < ids.length; i += SCORE_CHUNK) chunks.push(ids.slice(i, i + SCORE_CHUNK));
          let chunksDone = 0;
          await runPool(chunks, SCORE_CONCURRENCY, async (chunk) => {
            try {
              const res = await fetch(`/api/smart-source/projects/${projectId}/rescore`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ memberIds: chunk }),
              });
              const data = await res.json().catch(() => null);
              if (res.ok && typeof data?.scored === "number") rescored += data.scored;
              else rescoreFailed = true;
            } catch {
              rescoreFailed = true;
            }
            chunksDone++;
            setBusyLabel(`Scoring ${Math.min(chunksDone * SCORE_CHUNK, ids.length)}/${ids.length}…`);
          });
        } catch {
          rescoreFailed = true;
        }
      }

      const added = results.filter((r) => r.status === "added").length;
      const dupes = results.filter((r) => r.status === "duplicate").length;
      const failed = results.filter((r) => r.status === "failed" || r.status === "rejected");

      const parts: string[] = [];
      if (jdSaved) parts.push(jdSaved.replaced ? "JD updated" : "JD added");
      if (jdSaved && (rescored > 0 || rescoreFailed)) {
        parts.push(rescoreFailed ? `scored ${rescored} (some failed)` : `scored ${rescored}`);
      }
      if (added) parts.push(`${added} CV${added === 1 ? "" : "s"} added`);
      if (dupes) parts.push(`${dupes} skipped (duplicate)`);
      if (failed.length) parts.push(`${failed.length} couldn't be added`);

      const detail = failed.map((r) => `${r.fileName || "file"}: ${r.error || "failed"}`).join("\n") || undefined;
      if (parts.length === 0) parts.push("Nothing was added");

      showToast({
        tone: failed.length || rescoreFailed ? (added || jdSaved ? "warn" : "err") : "ok",
        text: parts.join(" · "),
        detail,
      });
      setBusyLabel(null);
      onChanged();
    },
    [busyLabel, projectId, onChanged, showToast]
  );

  const busy = busyLabel !== null;

  const boxTone = dragging
    ? "border-brand bg-brand-wash scale-[1.03] shadow-soft-sm"
    : busy
    ? "border-brand/50 bg-brand-wash/60"
    : "border-border hover:border-brand/60 hover:bg-brand-wash/40";

  return (
    <div className="mt-2.5" onClick={(e) => e.stopPropagation()}>
      <div
        role="button"
        tabIndex={busy ? -1 : 0}
        aria-label="Drop a JD or CVs for this project, or browse for files"
        aria-busy={busy}
        title={
          jdFileName
            ? "Drop a new JD to replace the current one and re-score everyone, or drop CVs to add candidates"
            : "Drop a JD to score this project's candidates, or drop CVs to add candidates"
        }
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!busy && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy && !dragging) setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (busy) return;
          void processFiles(Array.from(e.dataTransfer.files || []));
        }}
        className={`flex items-center gap-2 rounded-lg border border-dashed px-2 py-1.5 select-none transition-all duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-brand ${
          busy ? "cursor-progress" : "cursor-pointer"
        } ${boxTone}`}
      >
        <span
          className={`w-6 h-6 shrink-0 rounded-md flex items-center justify-center bg-brand/10 text-brand transition-transform ${
            dragging ? "-translate-y-0.5" : ""
          }`}
        >
          {busy ? (
            <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
              <path d="M14 3v5h5" />
              <path d="M12 17v-5" />
              <path d="m9.5 14 2.5-2.5 2.5 2.5" />
            </svg>
          )}
        </span>
        <span className="leading-tight min-w-0">
          <span className="block text-[11px] font-bold text-ink truncate">
            {busy ? busyLabel : dragging ? "Release to add" : "Drop JD / CVs"}
          </span>
          {!busy && (
            <span className="block text-[10.5px] text-ink-muted">
              {dragging ? "PDF, DOCX, TXT, images" : (
                <>
                  or <span className="text-brand font-semibold underline decoration-dotted underline-offset-2">Browse</span>
                </>
              )}
            </span>
          )}
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const list = Array.from(e.target.files || []);
            e.target.value = "";
            void processFiles(list);
          }}
        />
      </div>

      {jdFileName && (
        <div
          className="mt-1 text-[10.5px] text-ink-muted truncate"
          title={`Active JD: ${jdFileName}${jdUpdatedAt ? ` (updated ${new Date(jdUpdatedAt).toLocaleDateString()})` : ""}`}
        >
          <span className="font-semibold text-ink-2">JD</span> · {jdFileName}
        </div>
      )}

      {toast && (
        <div
          role="status"
          title={toast.detail}
          className={`mt-1 text-[10.5px] font-semibold leading-snug ${
            toast.tone === "ok" ? "text-good-text" : toast.tone === "warn" ? "text-ink" : "text-critical"
          }`}
        >
          {toast.text}
          {toast.detail && <span className="block font-normal text-ink-muted whitespace-pre-line">{toast.detail}</span>}
        </div>
      )}
    </div>
  );
}
