"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";

type Todo = { id: string; text: string; done: boolean; position: number; created_at: string };

export default function TodoList() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);
  const [hideDone, setHideDone] = useState(false);

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
        body: JSON.stringify({ text: t }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not add to-do.");
      setTodos((prev) => [...prev, data.todo]);
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add to-do.");
    } finally {
      setAdding(false);
    }
  }

  async function toggle(id: string, done: boolean) {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done } : t)));
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

  const visible = hideDone ? todos.filter((t) => !t.done) : todos;
  const doneCount = todos.filter((t) => t.done).length;

  if (loading) return <div className="text-[13px] text-ink-muted">Loading to-dos…</div>;

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
        <button
          type="submit"
          disabled={adding || !text.trim()}
          className="text-[12.5px] font-bold text-white bg-brand px-4 py-2 rounded-md disabled:opacity-50"
        >
          Add
        </button>
      </form>

      <div className="flex items-center justify-between text-[11.5px] text-ink-muted">
        <span>
          {doneCount} of {todos.length} done
        </span>
        <button onClick={() => setHideDone((v) => !v)} className="font-semibold text-brand">
          {hideDone ? "Show completed" : "Hide completed"}
        </button>
      </div>

      <div className="border border-border rounded-lg bg-surface divide-y divide-border overflow-hidden">
        {visible.length === 0 && (
          <div className="text-[12.5px] text-ink-muted text-center px-3 py-6">
            {todos.length === 0 ? "Nothing on your list yet." : "All caught up."}
          </div>
        )}
        {visible.map((t) => (
          <div key={t.id} className="flex items-center gap-2.5 px-3 py-2.5">
            <button
              onClick={() => toggle(t.id, !t.done)}
              className={`w-4.5 h-4.5 rounded-sm border flex-shrink-0 flex items-center justify-center ${
                t.done ? "bg-brand border-brand text-white" : "border-border-strong"
              }`}
              style={{ width: 18, height: 18 }}
              aria-label={t.done ? "Mark not done" : "Mark done"}
            >
              {t.done && <Icon name="check" className="w-3 h-3" />}
            </button>
            <span className={`flex-1 text-[13px] ${t.done ? "line-through text-ink-muted" : "text-ink"}`}>{t.text}</span>
            <button onClick={() => remove(t.id)} className="text-ink-muted hover:text-critical flex-shrink-0" aria-label="Delete">
              <Icon name="x" className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
