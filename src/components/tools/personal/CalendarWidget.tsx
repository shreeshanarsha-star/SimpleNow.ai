"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";

type Ev = { id: string; event_date: string; title: string };

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function dateKey(y: number, m: number, day: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function todayKey() {
  const t = new Date();
  return dateKey(t.getFullYear(), t.getMonth(), t.getDate());
}

export default function CalendarWidget() {
  const [cursor, setCursor] = useState(() => new Date());
  const [events, setEvents] = useState<Ev[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>(todayKey());
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    load(cursor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor.getFullYear(), cursor.getMonth()]);

  async function load(d: Date) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/personal/events?month=${monthKey(d)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load events.");
      setEvents(data.events || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load events.");
    } finally {
      setLoading(false);
    }
  }

  async function addEvent(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    setAdding(true);
    try {
      const res = await fetch("/api/personal/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventDate: selected, title }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not add event.");
      setEvents((prev) => [...prev, data.event]);
      setNewTitle("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add event.");
    } finally {
      setAdding(false);
    }
  }

  async function removeEvent(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    try {
      await fetch(`/api/personal/events/${id}`, { method: "DELETE" });
    } catch {
      /* ignore */
    }
  }

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const eventsByDay = new Map<string, Ev[]>();
  for (const ev of events) {
    if (!eventsByDay.has(ev.event_date)) eventsByDay.set(ev.event_date, []);
    eventsByDay.get(ev.event_date)!.push(ev);
  }
  const selectedEvents = eventsByDay.get(selected) || [];

  return (
    <div className="flex flex-col sm:flex-row gap-4">
      <div className="border border-border rounded-lg bg-surface shadow-soft-sm p-4 w-full sm:w-80 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="p-1 text-ink-muted hover:text-brand">
            <Icon name="chevronLeft" className="w-4 h-4" />
          </button>
          <div className="text-[13.5px] font-bold text-ink">
            {cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </div>
          <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="p-1 text-ink-muted hover:text-brand">
            <Icon name="chevronRight" className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center mb-1">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <div key={i} className="text-[10px] font-bold text-ink-muted">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day == null) return <div key={i} />;
            const key = dateKey(year, month, day);
            const isToday = key === todayKey();
            const isSelected = key === selected;
            const hasEvents = eventsByDay.has(key);
            return (
              <button
                key={i}
                onClick={() => setSelected(key)}
                className={`relative text-[12px] rounded-md py-1.5 ${
                  isSelected ? "bg-brand text-white font-bold" : isToday ? "bg-brand-wash text-brand font-bold" : "hover:bg-page text-ink"
                }`}
              >
                {day}
                {hasEvents && !isSelected && (
                  <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 border border-border rounded-lg bg-surface shadow-soft-sm p-4 flex flex-col gap-3">
        <div className="text-[12.5px] font-bold text-ink">
          {new Date(selected + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" })}
        </div>
        {error && <div className="bg-critical-wash text-critical text-[11.5px] rounded-sm px-2.5 py-1.5">{error}</div>}
        {loading ? (
          <div className="text-[12px] text-ink-muted">Loading…</div>
        ) : selectedEvents.length === 0 ? (
          <div className="text-[12px] text-ink-muted">No reminders for this day.</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {selectedEvents.map((ev) => (
              <div key={ev.id} className="flex items-center justify-between gap-2 border border-border rounded-md px-2.5 py-1.5">
                <span className="text-[12.5px] text-ink">{ev.title}</span>
                <button onClick={() => removeEvent(ev.id)} className="text-ink-muted hover:text-critical flex-shrink-0">
                  <Icon name="x" className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={addEvent} className="flex gap-2 mt-auto pt-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Add a reminder for this day…"
            className="flex-1 border border-border rounded-md px-3 py-2 text-[12.5px] bg-surface outline-none focus:border-brand"
          />
          <button
            type="submit"
            disabled={adding || !newTitle.trim()}
            className="text-[12px] font-bold text-white bg-brand px-3 py-2 rounded-md disabled:opacity-50"
          >
            Add
          </button>
        </form>
      </div>
    </div>
  );
}
