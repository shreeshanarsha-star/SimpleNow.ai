"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import Calculator from "./Calculator";
import QuickNotes from "./QuickNotes";
import CalendarWidget from "./CalendarWidget";
import ClockWidget from "./ClockWidget";
import TimerStopwatch from "./TimerStopwatch";
import TodoList from "./TodoList";
import UnitConverter from "./UnitConverter";

const TOOLS = [
  { key: "calculator", label: "Calculator", icon: "grid", Component: Calculator },
  { key: "notes", label: "Quick Notes", icon: "book", Component: QuickNotes },
  { key: "todo", label: "To-Do List", icon: "check", Component: TodoList },
  { key: "calendar", label: "Calendar", icon: "home", Component: CalendarWidget },
  { key: "clock", label: "Clock", icon: "sun", Component: ClockWidget },
  { key: "timer", label: "Timer / Stopwatch", icon: "megaphone", Component: TimerStopwatch },
  { key: "converter", label: "Unit Converter", icon: "chart", Component: UnitConverter },
] as const;

export default function PersonalToolsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initial = TOOLS.find((t) => t.key === searchParams.get("tool"))?.key || "calculator";
  const [active, setActive] = useState<string>(initial);

  const current = TOOLS.find((t) => t.key === active) || TOOLS[0];
  const Active = current.Component;

  function select(key: string) {
    setActive(key);
    router.replace(`/tools/widgets-ai?tool=${key}`, { scroll: false });
  }

  return (
    <div className="flex flex-col sm:flex-row gap-5">
      <div className="flex sm:flex-col gap-1 overflow-x-auto sm:overflow-visible sm:w-48 flex-shrink-0">
        {TOOLS.map((t) => (
          <button
            key={t.key}
            onClick={() => select(t.key)}
            className={`flex items-center gap-2.5 text-[12.5px] font-semibold px-3 py-2.5 rounded-md whitespace-nowrap flex-shrink-0 text-left ${
              active === t.key ? "bg-brand-wash text-brand" : "text-ink-2 hover:bg-page"
            }`}
          >
            <Icon name={t.icon} className="w-4 h-4 flex-shrink-0" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-w-0">
        <Active />
      </div>
    </div>
  );
}
