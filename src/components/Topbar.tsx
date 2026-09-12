"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Icon from "./Icon";
import Logo from "./Logo";
import TopbarStatus from "./TopbarStatus";
import { useToolHomeHandler } from "./ToolHomeContext";
import { createClient } from "@/lib/supabase/client";
import { getLicensedToolsForUser, LicensedTool, PERSONAL_TOOL_DEFS } from "@/lib/licensedTools";

export default function Topbar({
  title,
  onMenuClick,
  alwaysShowMenu = false,
}: {
  title: string;
  onMenuClick?: () => void;
  /** true on tool/feature pages, where the sidebar is a drawer at every
   *  breakpoint -- so the hamburger has to stay visible on desktop too,
   *  not just hide below lg like it does on the Home page. */
  alwaysShowMenu?: boolean;
}) {
  const toolHome = useToolHomeHandler();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownTab, setDropdownTab] = useState<"personal" | "enterprise">("personal");
  const [dropdownPage, setDropdownPage] = useState(0);
  const [licensedTools, setLicensedTools] = useState<LicensedTool[]>(PERSONAL_TOOL_DEFS);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load tools for Option 3 Topbar Switcher
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        getLicensedToolsForUser(supabase, user.id).then((tools) => {
          setLicensedTools(tools);
        });
      }
    });
  }, []);

  // Close on outside click or Escape
  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDropdownOpen(false);
    };
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleDown);
      document.addEventListener("keydown", handleKey);
    }
    return () => {
      document.removeEventListener("mousedown", handleDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [dropdownOpen]);

  const personalTools = licensedTools.filter((t) => t.group === "personal");
  const enterpriseTools = licensedTools.filter((t) => t.group === "licensed");

  return (
    <header className="flex-shrink-0 bg-surface px-4 sm:px-[26px] py-3 flex items-center gap-2 sm:gap-2.5">
      <button
        type="button"
        aria-label="Open menu"
        onClick={onMenuClick}
        className={`${alwaysShowMenu ? "" : "lg:hidden"} w-8 h-8 rounded-full border border-border bg-surface flex items-center justify-center text-ink-2 flex-shrink-0`}
      >
        <Icon name="menu" className="w-[16px] h-[16px]" />
      </button>

      {/* SimpleNow Logo */}
      <Link
        href="/"
        aria-label="SimpleNow Home"
        title="SimpleNow Home"
        className="flex items-center gap-2 hover:opacity-85 transition-opacity flex-shrink-0"
      >
        <Logo height={22} />
      </Link>

      <span className="text-border-strong text-[14px] select-none flex-shrink-0">/</span>

      {/* Option 3: Interactive Topbar Tool Switcher */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          title="Switch tool (Option 3: Topbar Switcher)"
          aria-expanded={dropdownOpen}
          className="group flex items-center gap-1.5 px-2 py-1 -ml-1 rounded-xl hover:bg-page transition-colors text-ink hover:text-brand"
        >
          <span className="m-0 text-[14px] sm:text-[15px] font-semibold truncate">{title}</span>
          <Icon
            name="chevronDown"
            className={`w-3.5 h-3.5 text-ink-muted transition-transform duration-150 ${
              dropdownOpen ? "rotate-180 text-brand" : "group-hover:text-brand"
            }`}
          />
        </button>

        {/* Dropdown Menu */}
        {dropdownOpen && (
          <div className="absolute left-0 top-full mt-2 z-50 w-72 sm:w-80 rounded-2xl bg-surface/95 backdrop-blur-2xl border border-border shadow-2xl p-3 space-y-2.5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-1.5 border-b border-border/70 text-[11px] font-bold text-ink-muted uppercase tracking-wider">
              <span>Quick Tool Switcher</span>
              <span className="text-[10px] lowercase text-brand font-semibold">Option 3</span>
            </div>

            {/* Category Segmented Selector */}
            {enterpriseTools.length > 0 && (
              <div className="flex items-center gap-1 p-0.5 rounded-xl bg-page border border-border/70 text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setDropdownTab("personal");
                    setDropdownPage(0);
                  }}
                  className={`flex-1 py-1 rounded-lg transition ${
                    dropdownTab === "personal"
                      ? "bg-surface text-ink font-bold shadow-soft-sm"
                      : "text-ink-muted hover:text-ink"
                  }`}
                >
                  Personal ({personalTools.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDropdownTab("enterprise");
                    setDropdownPage(0);
                  }}
                  className={`flex-1 py-1 rounded-lg transition ${
                    dropdownTab === "enterprise"
                      ? "bg-surface text-ink font-bold shadow-soft-sm"
                      : "text-ink-muted hover:text-ink"
                  }`}
                >
                  Enterprise ({enterpriseTools.length})
                </button>
              </div>
            )}

            {/* Zero-Scrollbar Tool Grid */}
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-1.5">
                {(dropdownTab === "personal"
                  ? personalTools
                  : enterpriseTools.slice(dropdownPage * 8, (dropdownPage + 1) * 8)
                ).map((t) => {
                  const isActive =
                    title.toLowerCase().includes(t.name.toLowerCase()) ||
                    t.name.toLowerCase().includes(title.toLowerCase());
                  return (
                    <Link
                      key={t.href}
                      href={t.href}
                      onClick={() => setDropdownOpen(false)}
                      className={`flex items-center gap-2 p-1.5 rounded-xl transition text-left border ${
                        isActive
                          ? "bg-brand-wash border-brand/40 text-brand font-bold shadow-soft-sm"
                          : "bg-surface hover:bg-page border-border/70 text-ink-2 hover:text-ink"
                      }`}
                    >
                      <Icon name={t.icon} className="w-3.5 h-3.5 flex-shrink-0 text-brand" />
                      <span className="text-[11.5px] truncate">{t.name}</span>
                    </Link>
                  );
                })}
              </div>

              {/* Discrete Paging for Enterprise AI (No Scrollbar) */}
              {dropdownTab === "enterprise" && enterpriseTools.length > 8 && (
                <div className="flex items-center justify-between pt-1 border-t border-border/50 text-[10px]">
                  <button
                    type="button"
                    disabled={dropdownPage === 0}
                    onClick={() => setDropdownPage((p) => Math.max(0, p - 1))}
                    className="px-2 py-0.5 rounded border border-border bg-page text-ink disabled:opacity-30"
                  >
                    ‹ Prev
                  </button>
                  <span className="text-ink-muted">
                    Page {dropdownPage + 1} of {Math.ceil(enterpriseTools.length / 8)}
                  </span>
                  <button
                    type="button"
                    disabled={dropdownPage >= Math.ceil(enterpriseTools.length / 8) - 1}
                    onClick={() => setDropdownPage((p) => p + 1)}
                    className="px-2 py-0.5 rounded border border-border bg-page text-ink disabled:opacity-30"
                  >
                    Next ›
                  </button>
                </div>
              )}
            </div>

            {/* Catalog Link */}
            <div className="pt-2 border-t border-border/70 flex items-center justify-between text-[11px]">
              <Link
                href="/departments/widgets"
                onClick={() => setDropdownOpen(false)}
                className="text-brand font-semibold hover:underline"
              >
                All Departments &rarr;
              </Link>
              <span className="text-[10px] text-ink-muted">Esc to close</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1" />
      <TopbarStatus />
    </header>
  );
}
