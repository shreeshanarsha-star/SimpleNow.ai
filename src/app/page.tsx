"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import { ALL_ITEMS } from "@/lib/departments";

export default function OverviewPage() {
  const router = useRouter();
  const [q, setQ] = useState("");

  function runSearch() {
    const query = q.trim().toLowerCase();
    if (!query) return;

    for (const dept of ALL_ITEMS) {
      if (dept.name.toLowerCase().includes(query)) {
        router.push(`/departments/${dept.id}`);
        return;
      }
      const tool = dept.tools.find((t) => t.n.toLowerCase().includes(query));
      if (tool) {
        router.push(`/departments/${dept.id}?tool=${encodeURIComponent(tool.n)}`);
        return;
      }
    }
  }

  return (
    <AppShell title="Overview">
      <div className="flex-1 flex flex-col min-h-0" id="overviewView">
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2.5">
          <Icon name="search" className="w-9 h-9 text-ink-muted mb-1" />
          <div className="text-[19px] font-bold">What do you need?</div>
          <p className="text-[12.5px] text-ink-muted max-w-[320px] leading-relaxed">
            Search for a department or tool below, or pick one from the sidebar.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-surface border border-border rounded-md pl-4 pr-2 py-2 mt-5 focus-within:border-brand">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="Search departments or tools…"
            className="border-none outline-none bg-transparent text-[13.5px] w-full"
          />
          <button
            type="button"
            aria-label="Ask Shree"
            className="w-[34px] h-[34px] rounded-sm border border-border bg-page flex items-center justify-center text-ink-2 hover:border-border-strong flex-shrink-0"
          >
            <Icon name="mic" className="w-[15px] h-[15px]" />
          </button>
          <button
            onClick={runSearch}
            aria-label="Search"
            className="w-[34px] h-[34px] rounded-sm bg-accent text-white border-none flex items-center justify-center flex-shrink-0"
          >
            <Icon name="arrowUp" className="w-[15px] h-[15px]" />
          </button>
        </div>
      </div>
    </AppShell>
  );
}
