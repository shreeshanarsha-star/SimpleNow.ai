"use client";
// Presenter.ai — Shree's Library: documents, links and notes Shree looks up live.
import { useCallback, useEffect, useState } from "react";
import { api, loadPdfJs } from "@/lib/presenter/client";

type Doc = { id: string; title: string; kind: string; source: string | null; status: string; chars: number; error: string | null; created_at: string };

/** Word: plain text of the document. */
async function docxText(file: File) {
  const mammoth = await import("mammoth");
  const r = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return r.value;
}

/** Excel / CSV: every sheet as rows, with the column headers repeated every 25 rows so each piece can be read on its own. */
async function sheetText(file: File) {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
  let out = "";
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, blankrows: false, defval: "" }) as unknown[][];
    if (!rows.length) continue;
    const line = (r: unknown[]) => r.map((c) => String(c ?? "").replace(/\s+/g, " ").trim()).join(" | ");
    const head = line(rows[0]);
    out += `\n\n[Sheet: ${name}] ${rows.length - 1} data rows. Columns: ${head}`;
    for (let i = 1; i < rows.length; i += 25) {
      out += `\n\n[Sheet: ${name}, rows ${i}–${Math.min(i + 24, rows.length - 1)}] Columns: ${head}\n` + rows.slice(i, i + 25).map(line).join("\n");
    }
  }
  return out;
}

/** PowerPoint: the text on every slide (and its notes). */
async function pptxText(file: File) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const num = (p: string) => Number(p.match(/(\d+)\.xml$/)?.[1] || 0);
  const grab = (xml: string) => Array.from(xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)).map((m) => m[1]).join(" ");
  const slides = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p)).sort((a, b) => num(a) - num(b));
  let out = "";
  for (const p of slides) {
    const n = num(p);
    out += `\n\n[Slide ${n}] ${grab(await zip.file(p)!.async("string"))}`;
    const notes = zip.file(`ppt/notesSlides/notesSlide${n}.xml`);
    if (notes) out += `\nNotes: ${grab(await notes.async("string"))}`;
  }
  return out;
}

async function fileText(file: File) {
  const n = file.name.toLowerCase();
  if (n.endsWith(".pdf")) return pdfFileText(file);
  if (n.endsWith(".docx")) return docxText(file);
  if (/\.(xlsx|xlsm|xls|csv)$/.test(n)) return sheetText(file);
  if (n.endsWith(".pptx")) return pptxText(file);
  if (/\.(doc|ppt)$/.test(n)) throw new Error("old Word/PowerPoint format: save it as .docx / .pptx or PDF first");
  return file.text();
}

async function pdfFileText(file: File) {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  let out = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    let t = "";
    for (const it of tc.items as Array<{ str?: string; hasEOL?: boolean }>) t += (it.str || "") + (it.hasEOL ? "\n" : " ");
    out += `\n\n[Page ${p}]\n${t}`;
  }
  return out;
}

export default function LibraryPanel({ sessionId }: { sessionId: string }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const d = await api<{ docs: Doc[] }>("/api/presenter/library");
    setDocs(d.docs || []);
  }, []);
  useEffect(() => {
    load().catch((e) => setMsg(e.message));
  }, [load]);

  const post = async (body: Record<string, unknown>, label: string) => {
    setBusy(label);
    setMsg("");
    try {
      const r = await api<{ status?: string; error?: string; slides?: number; unchanged?: boolean }>("/api/presenter/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setMsg(r.status === "failed" ? `Couldn't read it: ${r.error}` : r.unchanged ? "Deck already up to date." : "Added ✓");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy("");
    }
  };

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) {
      setBusy(`Reading ${f.name}…`);
      try {
        const text = await fileText(f);
        await post({ action: "add-text", kind: "file", title: f.name.replace(/\.[^.]+$/, ""), source: f.name, text }, `Adding ${f.name}…`);
      } catch (e) {
        setMsg(`${f.name}: ${e instanceof Error ? e.message : "could not read"}`);
      }
    }
    setBusy("");
  };

  const input = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm";
  const ready = docs.filter((d) => d.status === "ready");
  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <div>
        <div className="text-sm font-medium">Shree&apos;s Library ({ready.length} ready)</div>
        <div className="text-xs text-ink-muted">
          Documents, links and notes Shree reads in full and looks up when someone asks a question, at any moment of the show. Short answers first; more on follow-ups. Links are read once when you add them. Work files stay private to Shree: they are never used for answers on phones. Say &quot;Shree, remember that …&quot; (out loud or hold-to-speak) to add a note live.
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-[2fr_auto]">
        <input className={input} placeholder="Paste a link (web page)" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button disabled={!url.trim() || !!busy} onClick={async () => { await post({ action: "add-url", url: url.trim() }, "Reading link…"); setUrl(""); }} className="rounded-lg bg-ink px-3 py-2 text-sm text-surface disabled:opacity-40">Add link</button>
      </div>
      <div className="grid gap-2 md:grid-cols-[2fr_auto]">
        <input className={input} placeholder="A fact for Shree to remember" value={note} onChange={(e) => setNote(e.target.value)} />
        <button disabled={note.trim().length < 6 || !!busy} onClick={async () => { await post({ action: "add-text", kind: "note", title: `Note: ${note.trim().slice(0, 60)}`, text: note.trim() }, "Saving…"); setNote(""); }} className="rounded-lg bg-ink px-3 py-2 text-sm text-surface disabled:opacity-40">Add note</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="cursor-pointer rounded-lg border border-border px-3 py-2 text-sm">
          Upload files (PDF, Word, Excel, PowerPoint, CSV, text)
          <input type="file" multiple accept=".pdf,.docx,.xlsx,.xlsm,.xls,.csv,.pptx,.txt,.md,.json" className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
        </label>
        <button disabled={!!busy} onClick={() => post({ action: "sync-deck", sessionId }, "Syncing the deck…")} className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-40">Sync deck now</button>
        {busy && <span className="text-xs text-ink-muted">{busy}</span>}
        {!busy && msg && <span className="text-xs text-ink-muted">{msg}</span>}
      </div>
      <div className="space-y-1">
        {docs.map((d) => (
          <div key={d.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
            <span className={d.status === "ready" ? "text-emerald-600" : "text-rose-600"}>{d.status === "ready" ? "✓" : "✗"}</span>
            <span className="text-[11px] uppercase text-ink-muted">{d.kind}</span>
            <span className="flex-1 truncate" title={d.source || ""}>{d.title}</span>
            <span className="text-[11px] text-ink-muted">{d.status === "ready" ? `${Math.round(d.chars / 1000)}k chars` : d.error}</span>
            <button className="rounded border border-border px-2 py-0.5 text-xs" onClick={async () => { if (confirm(`Remove "${d.title}" from Shree's Library?`)) await post({ action: "delete", id: d.id }, "Removing…"); }}>Remove</button>
          </div>
        ))}
        {!docs.length && <div className="text-xs text-ink-muted">Nothing yet. The deck is added automatically when the TV page loads the slides.</div>}
      </div>
    </div>
  );
}
