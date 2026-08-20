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
        <div className="flex gap-2.5 pt-5">
          <div className="flex-1 flex items-center gap-2 bg-surface border border-border rounded-md px-4 py-3 focus-within:border-brand">
            <Icon name="search" className="w-4 h-4 text-ink-muted flex-shrink-0" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="Search departments or tools…"
              className="border-none outline-none bg-transparent text-[13.5px] w-full"
            />
          </div>
          <button
            onClick={runSearch}
            className="bg-brand text-white border-none px-4 py-2.5 rounded-sm text-[13px] font-bold"
          >
            Search
          </button>
        </div>
      </div>
    </AppShell>
  );
}
