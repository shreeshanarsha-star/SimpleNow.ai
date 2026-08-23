"use client";

import { useEffect, useRef, useState } from "react";

type Note = { id: string; title: string | null; body: string; created_at: string; updated_at: string };

function fmt(s: string) {
  return new Date(s).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export default function QuickNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/personal/notes");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load notes.");
      setNotes(data.notes || []);
      if (!activeId && data.notes?.length) selectNote(data.notes[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load notes.");
    } finally {
      setLoading(false);
    }
  }

  function selectNote(n: Note) {
    setActiveId(n.id);
    setTitle(n.title || "");
    setBody(n.body || "");
  }

  async function createNote() {
    setSaving(true);
    try {
      const res = await fetch("/api/personal/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "", body: "" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create note.");
      setNotes((prev) => [data.note, ...prev]);
      selectNote(data.note);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create note.");
    } finally {
      setSaving(false);
    }
  }

  function scheduleSave(nextTitle: string, nextBody: string) {
    if (!activeId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        const res = await fetch(`/api/personal/notes/${activeId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: nextTitle, body: nextBody }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not save note.");
        setNotes((prev) => prev.map((n) => (n.id === activeId ? data.note : n)).sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save note.");
      } finally {
        setSaving(false);
      }
    }, 600);
  }

  async function deleteNote(id: string) {
    try {
      const res = await fetch(`/api/personal/notes/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not delete note.");
      }
      const remaining = notes.filter((n) => n.id !== id);
      setNotes(remaining);
      if (activeId === id) {
        if (remaining.length) selectNote(remaining[0]);
        else {
          setActiveId(null);
          setTitle("");
          setBody("");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete note.");
    }
  }

  if (loading) return <div className="text-[13px] text-ink-muted">Loading notes…</div>;

  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      {error && <div className="bg-critical-wash text-critical text-[12px] rounded-sm px-3 py-2">{error}</div>}
      <div className="flex gap-3 h-[420px]">
        <div className="w-52 flex-shrink-0 border border-border rounded-lg bg-surface flex flex-col overflow-hidden">
          <button
            onClick={createNote}
            disabled={saving}
            className="text-[12px] font-semibold text-brand px-3 py-2.5 border-b border-border hover:bg-brand-wash text-left disabled:opacity-50"
          >
            + New note
          </button>
          <div className="flex-1 overflow-y-auto">
            {notes.length === 0 && <div className="text-[11.5px] text-ink-muted px-3 py-4">No notes yet.</div>}
            {notes.map((n) => (
              <button
                key={n.id}
                onClick={() => selectNote(n)}
                className={`w-full text-left px-3 py-2.5 border-b border-border last:border-0 ${
                  activeId === n.id ? "bg-brand-wash" : "hover:bg-page"
                }`}
              >
                <div className="text-[12.5px] font-semibold text-ink truncate">{n.title || "Untitled"}</div>
                <div className="text-[11px] text-ink-muted truncate">{n.body || "Empty note"}</div>
                <div className="text-[10px] text-ink-muted mt-0.5">{fmt(n.updated_at)}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 border border-border rounded-lg bg-surface flex flex-col overflow-hidden">
          {!activeId ? (
            <div className="flex-1 flex items-center justify-center text-[12.5px] text-ink-muted">
              Select a note, or create a new one.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <input
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    scheduleSave(e.target.value, body);
                  }}
                  placeholder="Title"
                  className="flex-1 text-[13.5px] font-semibold bg-transparent outline-none text-ink placeholder:text-ink-muted"
                />
                <span className="text-[10.5px] text-ink-muted flex-shrink-0">{saving ? "Saving…" : "Saved"}</span>
                <button onClick={() => deleteNote(activeId)} className="text-[11px] font-semibold text-critical flex-shrink-0">
                  Delete
                </button>
              </div>
              <textarea
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  scheduleSave(title, e.target.value);
                }}
                placeholder="Start typing…"
                className="flex-1 resize-none bg-transparent outline-none px-3 py-2.5 text-[13px] text-ink-2 leading-relaxed"
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
