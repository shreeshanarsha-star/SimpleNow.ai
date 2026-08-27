"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";

type Todo = {
  id: string;
  text: string;
  done: boolean;
  position: number;
  created_at: string;
  due_date: string | null;
  completed_at: string | null;
};

export default function TodoList() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingDateId, setEditingDateId] = useState<string | null>(null);
  // Completed tasks live in their own folder, closed by default -- they're
  // meant to be out of the way, not just struck-through in the same list.
  const [showCompleted, setShowCompleted] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/personal/todos");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load to-dos.");
      setTodos(data.todos || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load to-dos.");
    } finally {
      setLoading(false);
    }
  }

  async function addTodo(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setAdding(true);
    try {
      const res = await fetch("/api/personal/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t, due_date: dueDate || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not add to-do.");
      setTodos((prev) => [...prev, data.todo]);
      setText("");
      setDueDate("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add to-do.");
    } finally {
      setAdding(false);
    }
  }

  async function setDue(id: string, value: string | null) {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, due_date: value } : t)));
    setEditingDateId(null);
    try {
      await fetch(`/api/personal/todos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ due_date: value }),
      });
    } catch {
      /* optimistic -- a failed update self-corrects on next load */
    }
  }

  async function toggle(id: string, done: boolean) {
    // Optimistic completed_at: mirrors what the server will actually
    // stamp on PATCH, so the Completed folder shows correct times
    // immediately instead of waiting on a refetch.
    const nowIso = new Date().toISOString();
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done, completed_at: done ? nowIso : null } : t)));
    try {
      await fetch(`/api/personal/todos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done }),
      });
    } catch {
      /* optimistic -- a failed toggle self-corrects on next load */
    }
  }

  async function remove(id: string) {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    try {
      await fetch(`/api/personal/todos/${id}`, { method: "DELETE" });
    } catch {
      /* ignore */
    }
  }

  const active = todos.filter((t) => !t.done);
  const completed = todos
    .filter((t) => t.done)
    .slice()
    .sort((a, b) => {
      const at = a.completed_at ? new Date(a.completed_at).getTime() : 0;
      const bt = b.completed_at ? new Date(b.completed_at).getTime() : 0;
      return bt - at; // most recently completed first
    });

  if (loading) return <div className="text-[13px] text-ink-muted">Loading to-dos…</div>;

  const todayStr = new Date().toISOString().slice(0, 10);
  function formatDue(iso: string) {
    // Parse as local date (not UTC midnight) so "today" compares correctly
    // regardless of the viewer's timezone offset from UTC.
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  function formatDateTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ", " +
      d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  function formatDuration(startIso: string, endIso: string) {
    const ms = Math.max(0, new Date(endIso).getTime() - new Date(startIso).getTime());
    const mins = Math.round(ms / 60000);
    if (mins < 1) return "< 1 min";
    if (mins < 60) return `${mins} min`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    if (hours < 24) return remMins ? `${hours} hr ${remMins} min` : `${hours} hr`;
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return remHours ? `${days} d ${remHours} hr` : `${days} d`;
  }

  return (
    <div className="flex flex-col gap-3 max-w-md">
      {error && <div className="bg-critical-wash text-critical text-[12px] rounded-sm px-3 py-2">{error}</div>}

      <form onSubmit={addTodo} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a task…"
          className="flex-1 border border-border rounded-md px-3 py-2 text-[13px] bg-surface outline-none focus:border-brand"
        />
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          aria-label="Due date"
          title="Due date (optional)"
          className="border border-border rounded-md px-2 py-2 text-[12.5px] text-ink-2 bg-surface outline-none focus:border-brand w-[124px] flex-shrink-0"
        />
        <button
          type="submit"
          disabled={adding || !text.trim()}
          className="text-[12.5px] font-bold text-white bg-brand px-4 py-2 rounded-md disabled:opacity-50 flex-shrink-0"
        >
          Add
        </button>
      </form>

      <div className="border border-border rounded-lg bg-surface divide-y divide-border overflow-hidden">
        {active.length === 0 && (
          <div className="text-[12.5px] text-ink-muted text-center px-3 py-6">
            {todos.length === 0 ? "Nothing on your list yet." : "All caught up."}
          </div>
        )}
        {active.map((t) => {
          const overdue = !!t.due_date && !t.done && t.due_date < todayStr;
          return (
            <div key={t.id} className="flex items-center gap-2.5 px-3 py-2.5">
              <button
                onClick={() => toggle(t.id, true)}
                className="w-4.5 h-4.5 rounded-sm border border-border-strong flex-shrink-0 flex items-center justify-center"
                style={{ width: 18, height: 18 }}
                aria-label="Mark done"
              />
              <span className="flex-1 text-[13px] text-ink">{t.text}</span>

              {editingDateId === t.id ? (
                <input
                  type="date"
                  autoFocus
                  defaultValue={t.due_date || ""}
                  onBlur={(e) => setDue(t.id, e.target.value || null)}
                  onChange={(e) => setDue(t.id, e.target.value || null)}
                  className="border border-border rounded-md px-1.5 py-1 text-[11.5px] bg-surface outline-none focus:border-brand w-[118px] flex-shrink-0"
                />
              ) : t.due_date ? (
                <button
                  onClick={() => setEditingDateId(t.id)}
                  title="Change due date"
                  className={`text-[11px] font-semibold px-2 py-1 rounded-full flex-shrink-0 whitespace-nowrap ${
                    overdue ? "bg-critical-wash text-critical" : "bg-page text-ink-muted"
                  }`}
                >
                  {overdue ? "Overdue" : formatDue(t.due_date)}
                </button>
              ) : (
                <button
                  onClick={() => setEditingDateId(t.id)}
                  title="Set due date"
                  aria-label="Set due date"
                  className="text-ink-muted hover:text-ink flex-shrink-0"
                >
                  <Icon name="calendar" className="w-3.5 h-3.5" />
                </button>
              )}

              <button onClick={() => remove(t.id)} className="text-ink-muted hover:text-critical flex-shrink-0" aria-label="Delete">
                <Icon name="x" className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Completed folder -- finished tasks are auto-saved here (with their
          created/completed timestamps and time-to-complete) and kept out of
          the active list, rather than just struck through above it. */}
      <div className="border border-border rounded-lg bg-surface overflow-hidden">
        <button
          onClick={() => setShowCompleted((v) => !v)}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-[12.5px] font-semibold text-ink-2"
        >
          <Icon name="boxArchive" className="w-3.5 h-3.5 text-ink-muted" />
          <span className="flex-1 text-left">Completed</span>
          <span className="text-ink-muted font-normal">{completed.length}</span>
          <Icon
            name="chevronDown"
            className={`w-3.5 h-3.5 text-ink-muted transition-transform ${showCompleted ? "rotate-180" : ""}`}
          />
        </button>
        {showCompleted && (
          <div className="border-t border-border divide-y divide-border">
            {completed.length === 0 && (
              <div className="text-[12.5px] text-ink-muted text-center px-3 py-6">
                Nothing completed yet.
              </div>
            )}
            {completed.map((t) => (
              <div key={t.id} className="flex items-start gap-2.5 px-3 py-2.5">
                <button
                  onClick={() => toggle(t.id, false)}
                  className="w-4.5 h-4.5 rounded-sm border bg-brand border-brand text-white flex-shrink-0 flex items-center justify-center mt-0.5"
                  style={{ width: 18, height: 18 }}
                  aria-label="Mark not done"
                >
                  <Icon name="check" className="w-3 h-3" />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-ink-muted line-through truncate">{t.text}</div>
                  <div className="text-[11px] text-ink-muted mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0.5">
                    <span>Created {formatDateTime(t.created_at)}</span>
                    {t.completed_at && <span>Completed {formatDateTime(t.completed_at)}</span>}
                    {t.completed_at && <span>Took {formatDuration(t.created_at, t.completed_at)}</span>}
                  </div>
                </div>
                <button onClick={() => remove(t.id)} className="text-ink-muted hover:text-critical flex-shrink-0" aria-label="Delete">
                  <Icon name="x" className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
