"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Icon from "./Icon";
import { ALL_ITEMS } from "@/lib/departments";

// Persistent command bar, sticky to the viewport bottom in the main
// column -- lands on the exact same horizontal line as Sidebar's bottom
// profile/settings row (both are pinned to the bottom of a `h-screen`
// column), so the two together read as one continuous bottom strip
// across the whole app, on every page, not just Overview.
export default function GlobalSearchBar() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [notFoundMsg, setNotFoundMsg] = useState<string | null>(null);

  function runSearch() {
    const query = q.trim().toLowerCase();
    if (!query) return;
    setNotFoundMsg(null);

    for (const dept of ALL_ITEMS) {
      const tool = dept.tools.find((t) => t.n.toLowerCase().includes(query));
      if (tool && tool.s === "live" && tool.href) {
        router.push(tool.href);
        return;
      }
      if (tool) {
        router.push(`/departments/${dept.id}?tool=${encodeURIComponent(tool.n)}`);
        return;
      }
      if (dept.name.toLowerCase().includes(query)) {
        router.push(`/departments/${dept.id}`);
        return;
      }
    }

    setNotFoundMsg(`No department or tool matches "${q.trim()}".`);
  }

  return (
    <div className="px-[26px] pb-8 pt-2">
      <div className="w-full max-w-[680px] mx-auto relative">
        {notFoundMsg && (
          <p className="absolute bottom-[calc(100%+8px)] left-0 right-0 text-center text-[12px] text-ink-muted">
            {notFoundMsg}
          </p>
        )}
        <div className="flex items-center gap-2.5 bg-gradient-to-b from-[var(--search-bg-1)] to-[var(--search-bg-2)] border border-brand/[0.18] rounded-full pl-5 pr-2 py-2.5 shadow-soft focus-within:border-brand/40 transition-colors">
          <Icon name="search" className="w-4 h-4 text-ink-muted flex-shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="Search departments or tools…"
            className="border-none outline-none bg-transparent text-[13.5px] w-full py-1 text-ink placeholder:text-ink-muted"
          />
          <button
            type="button"
            aria-label="Ask Shree"
            className="w-8 h-8 rounded-full border border-border bg-page flex items-center justify-center text-ink-2 hover:border-border-strong hover:text-ink flex-shrink-0 transition-colors"
          >
            <Icon name="mic" className="w-[14px] h-[14px]" />
          </button>
          <button
            onClick={runSearch}
            aria-label="Search"
            className="w-8 h-8 rounded-full bg-[radial-gradient(circle_at_35%_30%,var(--accent-btn-1),var(--accent-btn-2))] text-white border-none flex items-center justify-center flex-shrink-0 shadow-button hover:brightness-110 transition-all"
          >
            <Icon name="arrowUp" className="w-[14px] h-[14px]" />
          </button>
        </div>
      </div>
    </div>
  );
}
