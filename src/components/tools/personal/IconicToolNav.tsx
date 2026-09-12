"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { LicensedTool, PERSONAL_TOOL_DEFS } from "@/lib/licensedTools";

// Subtle visual accent per tool for immediate recognition without monochrome confusion
const TOOL_ACCENTS: Record<string, { bg: string; text: string; ring: string }> = {
  Calculator: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", ring: "ring-blue-500/30" },
  "Quick Notes": { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", ring: "ring-amber-500/30" },
  "To-Do List": { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", ring: "ring-emerald-500/30" },
  Calendar: { bg: "bg-violet-500/10", text: "text-violet-600 dark:text-violet-400", ring: "ring-violet-500/30" },
  Clock: { bg: "bg-teal-500/10", text: "text-teal-600 dark:text-teal-400", ring: "ring-teal-500/30" },
  "Timer / Stopwatch": { bg: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-400", ring: "ring-rose-500/30" },
  "Unit Converter": { bg: "bg-indigo-500/10", text: "text-indigo-600 dark:text-indigo-400", ring: "ring-indigo-500/30" },
  Jotz: { bg: "bg-orange-500/10", text: "text-orange-600 dark:text-orange-400", ring: "ring-orange-500/30" },
  "Intelexa.ai": { bg: "bg-cyan-500/10", text: "text-cyan-600 dark:text-cyan-400", ring: "ring-cyan-500/30" },
};

export default function IconicToolNav({
  currentHref,
  tools = PERSONAL_TOOL_DEFS,
  className = "",
}: {
  currentHref: string;
  tools?: LicensedTool[];
  className?: string;
}) {
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "personal" | "enterprise">("all");
  const [pageIndex, setPageIndex] = useState(0);
  const popoverRef = useRef<HTMLDivElement>(null);

  const PAGE_SIZE = 8; // 2 columns x 4 rows = crisp, zero-scroll layout

  // Close popover on click outside or Escape, and arrow-key pagination
  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setLauncherOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLauncherOpen(false);
      if (e.key === "ArrowLeft") setPageIndex((p) => Math.max(0, p - 1));
      if (e.key === "ArrowRight") setPageIndex((p) => p + 1);
    };
    if (launcherOpen) {
      document.addEventListener("mousedown", handleDown);
      document.addEventListener("keydown", handleKey);
    }
    return () => {
      document.removeEventListener("mousedown", handleDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [launcherOpen]);

  // Separate the 7 core everyday tools from other licensed tools
  const corePersonalTools = tools.filter((t) => t.group === "personal").slice(0, 7);

  // Filter tools in launcher search
  const filteredTools = tools.filter((t) =>
    t.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );
  const personalFiltered = filteredTools.filter((t) => t.group === "personal");
  const enterpriseFiltered = filteredTools.filter((t) => t.group === "licensed");

  // Determine which list to display based on activeTab
  const displayedTools =
    activeTab === "personal"
      ? personalFiltered
      : activeTab === "enterprise"
      ? enterpriseFiltered
      : filteredTools;

  // Discrete Page Slicing (Alternative to Scrollbar: 8 items per page)
  const totalPages = Math.ceil(displayedTools.length / PAGE_SIZE) || 1;
  const currentSlice = displayedTools.slice(
    pageIndex * PAGE_SIZE,
    (pageIndex + 1) * PAGE_SIZE
  );

  const renderDockItem = (tool: LicensedTool) => {
    const isActive =
      currentHref === tool.href || (tool.href !== "/" && currentHref.startsWith(tool.href + "?"));
    const accent = TOOL_ACCENTS[tool.name] || {
      bg: "bg-brand/10",
      text: "text-brand",
      ring: "ring-brand/30",
    };

    return (
      <Link
        key={tool.href}
        href={tool.href}
        aria-label={tool.name}
        className={`group relative flex items-center justify-center w-8.5 h-8.5 rounded-xl transition-all duration-200 flex-shrink-0 ${
          isActive
            ? `${accent.bg} ${accent.text} ring-1.5 ${accent.ring} shadow-sm scale-105 font-bold`
            : "text-ink-muted hover:text-ink hover:bg-page hover:scale-105"
        }`}
      >
        <Icon name={tool.icon} className="w-4 h-4 transition-transform group-hover:scale-110" />

        {/* Active Pill Indicator */}
        {isActive && (
          <span className="absolute -bottom-0.5 w-2 h-1 rounded-full bg-current opacity-80" />
        )}

        {/* Floating Tooltip with Smooth Fade & Slide */}
        <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 z-50 whitespace-nowrap rounded-lg bg-ink px-2 py-0.5 text-[11px] font-medium text-white opacity-0 shadow-lg transition-all duration-150 group-hover:opacity-100 group-hover:-translate-y-0.5">
          {tool.name}
        </span>
      </Link>
    );
  };

  return (
    <nav aria-label="Tool Navigation" className={className}>
      <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-surface border border-border/80 shadow-soft-sm">
        {/* 1. Core Personal Tools (Zero horizontal scrollbars) */}
        <div className="flex items-center gap-1">
          {corePersonalTools.map(renderDockItem)}
        </div>

        <div className="w-px h-4.5 bg-border mx-0.5" />

        {/* 2. 9-Dots / App Launcher Popover Trigger */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setLauncherOpen(!launcherOpen);
              setSearchQuery("");
            }}
            title="All Licensed Tools & Systems"
            aria-label="All Tools Launcher"
            className={`group relative flex items-center gap-1 px-2.5 h-8.5 rounded-xl transition-all duration-150 ${
              launcherOpen
                ? "bg-brand text-white shadow-sm"
                : "bg-page/70 text-ink-2 hover:text-brand hover:bg-page border border-border/50"
            }`}
          >
            <Icon name="waffle" className="w-4 h-4 transition-transform group-hover:scale-110" />
            <span className="text-[11px] font-bold">All</span>
            <span
              className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full ${
                launcherOpen
                  ? "bg-white/20 text-white"
                  : "bg-brand/10 text-brand"
              }`}
            >
              {tools.length}
            </span>
          </button>

          {/* Waffle / App Launcher Modal — Zero-Scrollbar Architecture */}
          {launcherOpen && (
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/30 backdrop-blur-sm animate-in fade-in duration-150"
              onClick={(e) => {
                if (e.target === e.currentTarget) setLauncherOpen(false);
              }}
            >
              <div
                ref={popoverRef}
                className="relative w-full max-w-[540px] rounded-3xl bg-surface/95 dark:bg-surface/90 backdrop-blur-2xl border border-border shadow-2xl p-4 sm:p-5 space-y-3.5 animate-in zoom-in-95 duration-150 overflow-hidden"
              >
                {/* Header */}
                <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-border/70">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-brand-wash text-brand flex items-center justify-center font-bold shadow-soft-sm">
                      <Icon name="waffle" className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-[14px] font-bold text-ink leading-tight">Workspace Systems & Tools</h3>
                        <span className="text-[10px] font-bold text-brand bg-brand-wash px-2 py-0.5 rounded-full">
                          {tools.length} Apps
                        </span>
                      </div>
                      <p className="text-[11px] text-ink-muted">Quick access to all licensed features</p>
                    </div>
                  </div>

                  {/* Close button */}
                  <button
                    type="button"
                    onClick={() => setLauncherOpen(false)}
                    aria-label="Close launcher"
                    className="w-7 h-7 rounded-xl flex items-center justify-center text-ink-muted hover:text-ink hover:bg-page transition"
                  >
                    <Icon name="x" className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Quick Search Input */}
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setPageIndex(0);
                    }}
                    placeholder="Type to find any tool or AI feature..."
                    autoFocus
                    className="w-full pl-9 pr-8 py-2 text-[12.5px] rounded-xl bg-page border border-border focus:outline-none focus:border-brand text-ink placeholder:text-ink-muted transition-colors shadow-soft-sm"
                  />
                  <Icon
                    name="search"
                    className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery("");
                        setPageIndex(0);
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink text-xs p-1"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Category Segmented Control */}
                <div className="flex items-center gap-1 p-1 rounded-xl bg-page border border-border/70 text-[11.5px] font-semibold">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("all");
                      setPageIndex(0);
                    }}
                    className={`flex-1 py-1 px-2.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                      activeTab === "all"
                        ? "bg-surface text-ink font-bold shadow-soft-sm"
                        : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    <span>All Systems</span>
                    <span className="text-[10px] opacity-70">({filteredTools.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("personal");
                      setPageIndex(0);
                    }}
                    className={`flex-1 py-1 px-2.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                      activeTab === "personal"
                        ? "bg-surface text-ink font-bold shadow-soft-sm"
                        : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    <span>⚡ Personal</span>
                    <span className="text-[10px] opacity-70">({personalFiltered.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("enterprise");
                      setPageIndex(0);
                    }}
                    className={`flex-1 py-1 px-2.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                      activeTab === "enterprise"
                        ? "bg-surface text-ink font-bold shadow-soft-sm"
                        : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    <span>🏢 Enterprise AI</span>
                    <span className="text-[10px] opacity-70">({enterpriseFiltered.length})</span>
                  </button>
                </div>

                {/* Zero-Scrollbar Discrete Card Grid Matrix */}
                <div className="min-h-[190px] flex flex-col justify-between overflow-hidden">
                  {currentSlice.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {currentSlice.map((t) => {
                        const isActive =
                          currentHref === t.href ||
                          (t.href !== "/" && currentHref.startsWith(t.href + "?"));
                        const accent = TOOL_ACCENTS[t.name] || {
                          bg: "bg-brand/10",
                          text: "text-brand",
                          ring: "ring-brand/30",
                        };

                        return (
                          <Link
                            key={t.href}
                            href={t.href}
                            onClick={() => setLauncherOpen(false)}
                            className={`group flex items-center gap-2.5 p-2 rounded-2xl transition-all duration-150 border ${
                              isActive
                                ? "bg-brand-wash border-brand/40 text-brand font-bold shadow-soft-sm"
                                : "bg-surface hover:bg-page/80 border-border/80 text-ink hover:border-brand/30 hover:scale-[1.01]"
                            }`}
                          >
                            <div
                              className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105 ${
                                t.group === "personal"
                                  ? `${accent.bg} ${accent.text}`
                                  : "bg-brand-wash text-brand"
                              }`}
                            >
                              <Icon name={t.icon} className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-[12.5px] font-semibold truncate leading-tight">
                                {t.name}
                              </div>
                              <div className="text-[10px] text-ink-muted truncate">
                                {t.group === "personal" ? "Everyday Utility" : "Enterprise System"}
                              </div>
                            </div>
                            {isActive && (
                              <span className="text-[10px] font-semibold text-brand bg-surface px-1.5 py-0.5 rounded-md flex-shrink-0">
                                Active
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-12 text-center text-xs text-ink-muted">
                      No tools found matching &ldquo;{searchQuery}&rdquo;.
                    </div>
                  )}

                  {/* Discrete Page Navigation Stepper */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-border/60">
                      <button
                        type="button"
                        disabled={pageIndex === 0}
                        onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-border bg-page text-ink disabled:opacity-30 disabled:pointer-events-none hover:bg-surface hover:border-brand/40 transition flex items-center gap-1"
                      >
                        <span>‹</span>
                        <span>Previous</span>
                      </button>

                      {/* Dot Stepper Affordance */}
                      <div className="flex items-center gap-1.5">
                        {Array.from({ length: totalPages }).map((_, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setPageIndex(i)}
                            aria-label={`Go to page ${i + 1}`}
                            className={`transition-all duration-200 rounded-full ${
                              i === pageIndex
                                ? "w-5 h-2 bg-brand"
                                : "w-2 h-2 bg-border hover:bg-ink-muted"
                            }`}
                          />
                        ))}
                      </div>

                      <button
                        type="button"
                        disabled={pageIndex >= totalPages - 1}
                        onClick={() => setPageIndex((p) => Math.min(totalPages - 1, p + 1))}
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-border bg-page text-ink disabled:opacity-30 disabled:pointer-events-none hover:bg-surface hover:border-brand/40 transition flex items-center gap-1"
                      >
                        <span>Next</span>
                        <span>›</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="pt-2 border-t border-border/70 flex items-center justify-between text-[11px]">
                  <Link
                    href="/departments/widgets"
                    onClick={() => setLauncherOpen(false)}
                    className="text-brand font-semibold hover:underline flex items-center gap-1"
                  >
                    <span>Browse All Departments &rarr;</span>
                  </Link>
                  <div className="flex items-center gap-2 text-[10px] text-ink-muted">
                    <span>Use ‹ › to page</span>
                    <span>•</span>
                    <span>Esc to close</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
