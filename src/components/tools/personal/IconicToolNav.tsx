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

const STORAGE_KEY_DOCK_MODE = "simplenow_tool_dock_mode";

export default function IconicToolNav({
  currentHref,
  tools = PERSONAL_TOOL_DEFS,
  className = "",
}: {
  currentHref: string;
  tools?: LicensedTool[];
  className?: string;
}) {
  // Option 2: Floating vs Header Dock Mode
  const [dockMode, setDockMode] = useState<"header" | "floating">("header");
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);

  // Load dock preference
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_DOCK_MODE);
      if (saved === "floating" || saved === "header") {
        setDockMode(saved);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const toggleDockMode = () => {
    const next = dockMode === "header" ? "floating" : "header";
    setDockMode(next);
    try {
      localStorage.setItem(STORAGE_KEY_DOCK_MODE, next);
    } catch {
      /* ignore */
    }
  };

  // Close popover on click outside or Escape
  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setLauncherOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLauncherOpen(false);
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
  const otherLicensedTools = tools.filter(
    (t) => !corePersonalTools.some((c) => c.href === t.href)
  );

  // Filter tools in launcher search
  const filteredTools = tools.filter((t) =>
    t.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );
  const personalFiltered = filteredTools.filter((t) => t.group === "personal");
  const enterpriseFiltered = filteredTools.filter((t) => t.group === "licensed");

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

  const dockContent = (
    <div
      className={`flex items-center gap-1.5 p-1 rounded-2xl transition-all duration-300 ${
        dockMode === "floating"
          ? "bg-surface/90 backdrop-blur-2xl border border-border/80 shadow-2xl ring-1 ring-black/5"
          : "bg-surface border border-border/80 shadow-soft-sm"
      }`}
    >
      {/* 1. Core Personal Tools (Zero horizontal scrollbars) */}
      <div className="flex items-center gap-1">
        {corePersonalTools.map(renderDockItem)}
      </div>

      <div className="w-px h-4.5 bg-border mx-0.5" />

      {/* 2. Option 1: 9-Dots / App Launcher Popover Trigger */}
      <div className="relative" ref={popoverRef}>
        <button
          type="button"
          onClick={() => {
            setLauncherOpen(!launcherOpen);
            setSearchQuery("");
          }}
          title="All Licensed Tools & Apps (Option 1 Launcher)"
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

        {/* 9-Dots Flyout Popover */}
        {launcherOpen && (
          <div className="absolute right-0 bottom-full mb-3 sm:bottom-auto sm:top-full sm:mt-3 z-50 w-80 sm:w-96 rounded-2xl bg-surface/95 backdrop-blur-2xl border border-border shadow-2xl p-3.5 space-y-3 animate-in fade-in zoom-in-95 duration-150">
            {/* Popover Header & Search */}
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/70">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-brand-wash text-brand flex items-center justify-center font-bold text-xs">
                  <Icon name="waffle" className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-ink leading-tight">Tools & AI Systems</h3>
                  <p className="text-[10px] text-ink-muted">Licensed to your workspace</p>
                </div>
              </div>

              {/* Option 2 Mode Toggle inside Popover */}
              <button
                type="button"
                onClick={toggleDockMode}
                title={dockMode === "header" ? "Switch to Floating Island Dock" : "Pin Dock to Header"}
                className="px-2 py-1 rounded-lg text-[10px] font-semibold border border-border bg-page text-ink-2 hover:text-brand hover:border-brand/40 transition flex items-center gap-1"
              >
                <span>{dockMode === "header" ? "🛸 Float Dock" : "📌 Pin Dock"}</span>
              </button>
            </div>

            {/* Quick Search */}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tools & features..."
                autoFocus
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-page border border-border focus:outline-none focus:border-brand text-ink"
              />
              <Icon
                name="search"
                className="w-3.5 h-3.5 text-ink-muted absolute left-2.5 top-1/2 -translate-y-1/2"
              />
            </div>

            {/* Tool Sections */}
            <div className="max-h-72 overflow-y-auto pr-1 space-y-3">
              {/* Personal Everyday Tools */}
              {personalFiltered.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-ink-muted px-1">
                    Personal Utilities
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {personalFiltered.map((t) => {
                      const isActive = currentHref === t.href;
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
                          className={`flex items-center gap-2 p-2 rounded-xl transition text-left ${
                            isActive
                              ? `${accent.bg} ${accent.text} font-bold ring-1 ${accent.ring}`
                              : "bg-page/50 hover:bg-page text-ink hover:text-brand"
                          }`}
                        >
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${accent.bg} ${accent.text}`}
                          >
                            <Icon name={t.icon} className="w-3.5 h-3.5" />
                          </div>
                          <span className="text-[11.5px] truncate font-medium">{t.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Enterprise Licensed Systems */}
              {enterpriseFiltered.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-ink-muted px-1">
                    Licensed Enterprise AI
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {enterpriseFiltered.map((t) => {
                      const isActive = currentHref === t.href;
                      return (
                        <Link
                          key={t.href}
                          href={t.href}
                          onClick={() => setLauncherOpen(false)}
                          className={`flex items-center gap-2 p-2 rounded-xl transition text-left ${
                            isActive
                              ? "bg-brand-wash text-brand font-bold ring-1 ring-brand/30"
                              : "bg-page/50 hover:bg-page text-ink hover:text-brand"
                          }`}
                        >
                          <div className="w-7 h-7 rounded-lg bg-surface border border-border flex items-center justify-center flex-shrink-0 text-brand">
                            <Icon name={t.icon} className="w-3.5 h-3.5" />
                          </div>
                          <span className="text-[11.5px] truncate font-medium">{t.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}

              {filteredTools.length === 0 && (
                <div className="py-6 text-center text-xs text-ink-muted">
                  No tools found matching &ldquo;{searchQuery}&rdquo;.
                </div>
              )}
            </div>

            {/* Catalog Link Footer */}
            <div className="pt-2 border-t border-border/70 flex items-center justify-between text-[11px]">
              <Link
                href="/departments/widgets"
                onClick={() => setLauncherOpen(false)}
                className="text-brand font-semibold hover:underline flex items-center gap-1"
              >
                <span>Browse All Departments &rarr;</span>
              </Link>
              <span className="text-[10px] text-ink-muted">Esc to close</span>
            </div>
          </div>
        )}
      </div>

      {/* 3. Option 2: Quick Floating / Pinned Toggle Icon */}
      <button
        type="button"
        onClick={toggleDockMode}
        title={dockMode === "header" ? "Option 2: Float as Glass Island Dock" : "Option 1: Pin Dock to Header"}
        className="flex items-center justify-center w-7 h-7 rounded-lg text-ink-muted hover:text-ink hover:bg-page transition"
      >
        <span className="text-xs select-none">{dockMode === "header" ? "🛸" : "📌"}</span>
      </button>
    </div>
  );

  // If Option 2 (Floating Dock) is enabled, render the floating island at bottom center
  if (dockMode === "floating") {
    return (
      <>
        {/* Placeholder in header to allow clicking to re-float */}
        <div className={`flex items-center gap-2 ${className}`}>
          <button
            type="button"
            onClick={toggleDockMode}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-border bg-surface text-xs font-semibold text-ink-muted hover:text-brand hover:border-brand transition"
          >
            <span>🛸 Floating Dock Active</span>
            <span className="text-[10px] text-brand underline">(Pin to Header)</span>
          </button>
        </div>

        {/* Floating Island Dock (Option 2) */}
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-in fade-in slide-in-from-bottom-5 duration-200">
          {dockContent}
        </div>
      </>
    );
  }

  // Otherwise, render in-header dock (Option 1)
  return <nav aria-label="Tool Navigation" className={className}>{dockContent}</nav>;
}
