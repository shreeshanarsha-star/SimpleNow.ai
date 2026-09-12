"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Calculator from "./Calculator";
import QuickNotes from "./QuickNotes";
import CalendarWidget from "./CalendarWidget";
import ClockWidget from "./ClockWidget";
import TimerStopwatch from "./TimerStopwatch";
import TodoList from "./TodoList";
import UnitConverter from "./UnitConverter";

const TOOLS = [
  { key: "calculator", label: "Calculator", href: "/tools/calculator", Component: Calculator },
  { key: "notes", label: "Quick Notes", href: "/tools/notes", Component: QuickNotes },
  { key: "todo", label: "To-Do List", href: "/tools/todo", Component: TodoList },
  { key: "calendar", label: "Calendar", href: "/tools/calendar", Component: CalendarWidget },
  { key: "clock", label: "Clock", href: "/tools/clock", Component: ClockWidget },
  { key: "timer", label: "Timer / Stopwatch", href: "/tools/timer", Component: TimerStopwatch },
  { key: "converter", label: "Unit Converter", href: "/tools/converter", Component: UnitConverter },
] as const;

export default function PersonalToolsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toolParam = searchParams.get("tool");
  const initial = TOOLS.find((t) => t.key === toolParam)?.key || "calculator";
  const [active, setActive] = useState<string>(initial);

  const current = TOOLS.find((t) => t.key === active) || TOOLS[0];
  const Active = current.Component;

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex items-center justify-between pb-3 border-b border-border/70">
        <h2 className="text-base font-bold text-ink">{current.label}</h2>
      </div>

      <div className="w-full min-w-0">
        <Active />
      </div>
    </div>
  );
}
