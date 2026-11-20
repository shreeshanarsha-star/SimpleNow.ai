"use client";
// Presenter Studio — list of shows and past events.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, jsonInit } from "@/lib/studio/client";

type Row = {
  id: string;
  title: string;
  event_date: string | null;
  status: string;
  code: string | null;
  legacy_session_id: string | null;
  created_at: string;
  updated_at: string;
  deck: { pages: number } | null;
  message: string | null;
  stats: { people: number; answers: number; questions: number };
};

const STATUS: Record<string, string> = { draft: "Draft", ready: "Ready", live: "Live", done: "Done", archived: "Past event" };
const fmtDate = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "No date");

export default function StudioHome() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<{ shows: Row[] }>("/api/studio/shows");
      setRows(d.shows);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not load");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const create = async (fromId?: string) => {
    setBusy(true);
    try {
      const d = await api<{ id: string }>("/api/studio/shows", jsonInit("POST", { fromId }));
      window.location.href = `/tools/presenter/studio/${d.id}`;
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not create");
      setBusy(false);
    }
  };
  const remove = async (r: Row) => {
    if (!confirm(`Delete "${r.title}"? Its slides, script and audience answers will be removed.`)) return;
    try {
      await api(`/api/studio/shows/${r.id}`, { method: "DELETE" });
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const mine = (rows || []).filter((r) => r.status !== "archived");
  const past = (rows || []).filter((r) => r.status === "archived" || r.status === "done");

  return (
    <div className="space-y-6 p-1">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-5">
        <div>
          <div className="text-lg font-semibold">Presenter Studio</div>
          <div className="text-sm text-ink-muted">Upload a deck, choose what to include, approve the script. Your AI co-presenter presents and interacts; you stay in control.</div>
        </div>
        <button disabled={busy} onClick={() => create()} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          + New presentation
        </button>
      </div>
      {msg && <div className="rounded-lg bg-critical-wash px-3 py-2 text-sm">{msg}</div>}
      {!rows && <div className="text-sm text-ink-muted">Loading…</div>}

      {rows && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">My presentations</h2>
          {!mine.filter((r) => r.status !== "done").length && <div className="rounded-xl border border-dashed border-border p-6 text-sm text-ink-muted">No presentations yet. Click “New presentation” to start.</div>}
          <div className="grid gap-3 md:grid-cols-2">
            {mine
              .filter((r) => r.status !== "done")
              .map((r) => (
                <div key={r.id} className="rounded-2xl border border-border bg-surface p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{r.title}</div>
                      <div className="text-xs text-ink-muted">
                        {fmtDate(r.event_date)} · {STATUS[r.status] || r.status} · {r.deck?.pages ? `${r.deck.pages} slides` : "no slides yet"} · code {r.code}
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${r.status === "ready" ? "bg-good-wash text-good-text" : r.status === "live" ? "bg-warning-wash" : "bg-page"}`}>{STATUS[r.status] || r.status}</span>
                  </div>
                  {r.message && <div className="mt-2 line-clamp-2 text-sm text-ink-2">“{r.message}”</div>}
                  <div className="mt-3 flex flex-wrap gap-2 text-sm">
                    <Link href={`/tools/presenter/studio/${r.id}`} className="rounded-lg border border-border px-3 py-1.5">Edit</Link>
                    <a href={`/presenter/show/${r.id}`} target="_blank" className="rounded-lg border border-border px-3 py-1.5">TV screen</a>
                    <a href={`/presenter/show/${r.id}/remote`} target="_blank" className="rounded-lg border border-border px-3 py-1.5">Remote</a>
                    <button onClick={() => create(r.id)} className="rounded-lg border border-border px-3 py-1.5">Use as template</button>
                    <button onClick={() => remove(r)} className="rounded-lg px-3 py-1.5 text-critical">Delete</button>
                  </div>
                </div>
              ))}
          </div>
        </section>
      )}

      {rows && past.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">Past events</h2>
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            {past.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4 last:border-0">
                <div>
                  <div className="font-medium">{r.title}</div>
                  <div className="text-xs text-ink-muted">
                    {fmtDate(r.event_date)} · {r.stats.people} joined · {r.stats.answers} answers · {r.stats.questions} questions
                  </div>
                </div>
                <div className="flex gap-2 text-sm">
                  {r.legacy_session_id ? (
                    <a href={`/presenter/control?s=${r.legacy_session_id}`} target="_blank" className="rounded-lg border border-border px-3 py-1.5">Open (first Presenter)</a>
                  ) : (
                    <a href={`/presenter/show/${r.id}/remote`} target="_blank" className="rounded-lg border border-border px-3 py-1.5">Results</a>
                  )}
                  <button onClick={() => create(r.id)} className="rounded-lg border border-border px-3 py-1.5">Use as template</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
