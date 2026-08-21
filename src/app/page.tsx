"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import GoldSearchGlyph from "@/components/GoldSearchGlyph";
import { ALL_ITEMS } from "@/lib/departments";

export default function OverviewPage() {
  const router = useRouter();
  const [q, setQ] = useState("");

  const [notFoundMsg, setNotFoundMsg] = useState<string | null>(null);

  function runSearch() {
    const query = q.trim().toLowerCase();
    if (!query) return;
    setNotFoundMsg(null);

    for (const dept of ALL_ITEMS) {
      // A live tool with its own page is the actual result someone typed a
      // tool name for -- take them straight there instead of dropping them
      // on the department list and making them find it themselves again.
      const tool = dept.tools.find((t) => t.n.toLowerCase().includes(query));
      if (tool && tool.s === "live" && tool.href) {
        router.push(tool.href);
        return;
      }
      if (tool) {
        // Matched a real tool, but it's not live yet (no page to land on)
        // -- go to its department, scrolled/highlighted, not just the
        // param-less department page.
        router.push(`/departments/${dept.id}?tool=${encodeURIComponent(tool.n)}`);
        return;
      }
      if (dept.name.toLowerCase().includes(query)) {
        router.push(`/departments/${dept.id}`);
        return;
      }
    }

    // Never a silent no-op -- if nothing matched, say so instead of just
    // sitting there looking like the button didn't work.
    setNotFoundMsg(`No department or tool matches "${q.trim()}".`);
  }

  return (
    <AppShell title="Overview">
      <div className="flex-1 flex flex-col min-h-0" id="overviewView">
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
          <GoldSearchGlyph size={44} />
          <div className="text-[26px] font-semibold text-ink mt-2 tracking-tight">
            What do you need?
          </div>
          <p className="text-[13px] text-ink-muted max-w-[340px] leading-relaxed">
            Search for a department or tool below, or pick one from the sidebar.
          </p>
        </div>

        <div className="w-full max-w-[680px] mx-auto mb-10">
          <div className="flex items-center gap-2.5 bg-surface border border-border rounded-2xl pl-5 pr-2.5 py-3 shadow-soft focus-within:border-brand/50 transition-colors">
            <Icon name="search" className="w-4 h-4 text-ink-muted flex-shrink-0" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="Search departments or tools…"
              className="border-none outline-none bg-transparent text-[14px] w-full py-1"
            />
            <button
              type="button"
              aria-label="Ask Shree"
              className="w-9 h-9 rounded-full border border-border bg-page flex items-center justify-center text-ink-2 hover:border-border-strong hover:text-ink flex-shrink-0 transition-colors"
            >
              <Icon name="mic" className="w-[15px] h-[15px]" />
            </button>
            <button
              onClick={runSearch}
              aria-label="Search"
              className="w-9 h-9 rounded-full bg-ink text-white border-none flex items-center justify-center flex-shrink-0 hover:bg-ink/85 transition-colors"
            >
              <Icon name="arrowUp" className="w-[15px] h-[15px]" />
            </button>
          </div>
          {notFoundMsg && (
            <p className="text-[12px] text-ink-muted mt-2.5 text-center">{notFoundMsg}</p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
