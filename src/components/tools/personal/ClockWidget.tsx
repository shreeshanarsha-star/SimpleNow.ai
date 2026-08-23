"use client";

import { useEffect, useState } from "react";

const ZONES = [
  { label: "Local", tz: undefined as string | undefined },
  { label: "Mumbai / Bengaluru", tz: "Asia/Kolkata" },
  { label: "New York", tz: "America/New_York" },
  { label: "London", tz: "Europe/London" },
  { label: "Singapore", tz: "Asia/Singapore" },
  { label: "Tokyo", tz: "Asia/Tokyo" },
  { label: "Sydney", tz: "Australia/Sydney" },
];

export default function ClockWidget() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) return <div className="text-[13px] text-ink-muted">Loading…</div>;

  return (
    <div className="flex flex-col gap-4 max-w-md">
      <div className="border border-border rounded-lg bg-surface shadow-soft-sm p-6 text-center">
        <div className="text-[42px] font-bold tabular-nums text-ink leading-none">
          {now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}
        </div>
        <div className="text-[13px] text-ink-muted mt-2">
          {now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </div>
      </div>

      <div className="border border-border rounded-lg bg-surface divide-y divide-border overflow-hidden">
        {ZONES.slice(1).map((z) => (
          <div key={z.label} className="flex items-center justify-between px-4 py-2.5">
            <span className="text-[12.5px] text-ink-2">{z.label}</span>
            <span className="text-[13px] font-semibold tabular-nums text-ink">
              {now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: z.tz })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
