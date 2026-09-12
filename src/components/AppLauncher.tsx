"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { createClient } from "@/lib/supabase/client";
import {
  getLicensedToolsForUser,
  LicensedTool,
  PERSONAL_TOOL_DEFS,
  BUNDLED_TOOLS,
} from "@/lib/licensedTools";

// Harmonious visual accents for app icons in the launcher grid (Google Workspace style)
const TOOL_ACCENTS: Record<string, { bg: string }> = {
  Calculator: { bg: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  "Quick Notes": { bg: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  "To-Do List": { bg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  Calendar: { bg: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  Clock: { bg: "bg-teal-500/10 text-teal-600 dark:text-teal-400" },
  "Timer / Stopwatch": { bg: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
  "Unit Converter": { bg: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" },
  Jotz: { bg: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
  "Intelexa.ai": { bg: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400" },
  "Team Chat": { bg: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400" },
  "Contracts & eSign": { bg: "bg-slate-500/10 text-slate-600 dark:text-slate-400" },
  "Gauri.ai": { bg: "bg-purple-500/10 text-purple-600 dark:text-purple-400" },
};

export default function AppLauncher({
  isOpen,
  onToggle,
  onClose,
}: {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const [tools, setTools] = useState<LicensedTool[]>([
    ...PERSONAL_TOOL_DEFS,
    ...BUNDLED_TOOLS,
  ]);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "personal" | "enterprise">("all");

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (cancelled) return;
      if (user) {
        const userTools = await getLicensedToolsForUser(supabase, user.id);
        if (!cancelled && userTools.length > 0) {
          setTools(userTools);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setSearch("");
      setActiveTab("all");
      return;
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  const personalTools = tools.filter((t) => t.group === "personal");
  const enterpriseTools = tools.filter((t) => t.group === "licensed");

  const query = search.trim().toLowerCase();
  const filtered = tools.filter((t) => {
    if (activeTab === "personal" && t.group !== "personal") return false;
    if (activeTab === "enterprise" && t.group !== "licensed") return false;
    if (query) {
      return t.name.toLowerCase().includes(query);
    }
    return true;
  });

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Tools and Apps"
        title="Tools & Apps (9 dots)"
        onClick={onToggle}
        className={`relative w-7 h-7 rounded-full flex items-center justify-center transition-colors flex-shrink-0 ${
          isOpen
            ? "bg-brand text-white shadow-soft-sm"
            : "text-ink-2 hover:text-ink hover:bg-surface"
        }`}
      >
        {/* 9-Dots Waffle Grid */}
        <svg viewBox="0 0 24 24" className="w-[14px] h-[14px]" fill="currentColor">
          <circle cx="5" cy="5" r="1.9" />
          <circle cx="12" cy="5" r="1.9" />
          <circle cx="19" cy="5" r="1.9" />
          <circle cx="5" cy="12" r="1.9" />
          <circle cx="12" cy="12" r="1.9" />
          <circle cx="19" cy="12" r="1.9" />
          <circle cx="5" cy="19" r="1.9" />
          <circle cx="12" cy="19" r="1.9" />
          <circle cx="19" cy="19" r="1.9" />
        </svg>
      </button>

      {isOpen && (
        <>
          {/* Transparent click overlay to dismiss */}
          <button
            type="button"
            aria-label="Close apps menu"
            onClick={onClose}
            className="fixed inset-0 z-30 cursor-default"
          />

          {/* Launcher Popover */}
          <div className="absolute right-0 top-[calc(100%+8px)] w-[330px] sm:w-[360px] bg-surface/98 dark:bg-surface/95 backdrop-blur-2xl border border-border rounded-2xl shadow-2xl z-40 p-3.5 sm:p-4 space-y-3 animate-in fade-in zoom-in-95 duration-150">
            {/* Popover Header */}
            <div className="flex items-center justify-between pb-2 border-b border-border/70">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-bold text-ink">My Tools & Apps</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand-wash text-brand">
                  {tools.length}
                </span>
              </div>

              {enterpriseTools.length > 0 && (
                <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-page border border-border text-[10.5px]">
                  <button
                    type="button"
                    onClick={() => setActiveTab("all")}
                    className={`px-2 py-0.5 rounded-md font-semibold transition ${
                      activeTab === "all"
                        ? "bg-surface text-ink shadow-soft-sm"
                        : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("personal")}
                    className={`px-2 py-0.5 rounded-md font-semibold transition ${
                      activeTab === "personal"
                        ? "bg-surface text-ink shadow-soft-sm"
                        : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    Personal
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("enterprise")}
                    className={`px-2 py-0.5 rounded-md font-semibold transition ${
                      activeTab === "enterprise"
                        ? "bg-surface text-ink shadow-soft-sm"
                        : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    Enterprise
                  </button>
                </div>
              )}
            </div>

            {/* Quick Search */}
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tools..."
                className="w-full text-[12px] pl-7 pr-7 py-1.5 rounded-xl bg-page border border-border text-ink placeholder:text-ink-muted focus:outline-none focus:border-brand/50 transition"
              />
              <Icon
                name="search"
                className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="w-4 h-4 rounded-full flex items-center justify-center absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink hover:bg-surface"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Apps Grid (Google Workspace Style 3 columns) */}
            <div className="max-h-[300px] overflow-y-auto pr-0.5">
              {filtered.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {filtered.map((tool) => {
                    const accent = TOOL_ACCENTS[tool.name] || {
                      bg: "bg-brand/10 text-brand",
                    };
                    return (
                      <Link
                        key={tool.href}
                        href={tool.href}
                        onClick={onClose}
                        title={tool.name}
                        className="group flex flex-col items-center justify-center p-2 rounded-xl hover:bg-page transition-all border border-transparent hover:border-border/70 text-center"
                      >
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center mb-1.5 transition-transform group-hover:scale-110 shadow-soft-sm ${accent.bg}`}
                        >
                          <Icon name={tool.icon} className="w-5 h-5" />
                        </div>
                        <span className="text-[11px] font-medium text-ink group-hover:text-brand truncate w-full text-center leading-tight">
                          {tool.name}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-ink-muted">
                  No tools found matching &ldquo;{search}&rdquo;.
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="pt-2 border-t border-border/70 flex items-center justify-between text-[11px]">
              <Link
                href="/departments/widgets"
                onClick={onClose}
                className="text-brand font-semibold hover:underline flex items-center gap-1"
              >
                <span>Browse All Departments &rarr;</span>
              </Link>
              <span className="text-[10px] text-ink-muted">Esc to close</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
