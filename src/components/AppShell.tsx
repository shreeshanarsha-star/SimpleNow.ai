"use client";

import { useState } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { VScroller } from "./Scroller";

export default function AppShell({
  title,
  children,
  sidebarMode = "tool",
}: {
  title: string;
  children: React.ReactNode;
  /**
   * "tool" (default) -- every feature/tool page (Talent.ai, Offer.ai,
   *   department pages, admin, etc). Sidebar starts collapsed and stays
   *   a drawer at every screen size, including desktop, so the tool gets
   *   full width; reopen via the hamburger in Topbar.
   * "home" -- the Overview page only. Classic layout: full sidebar
   *   always visible in-flow on desktop, drawer only below the lg
   *   breakpoint (phones/tablets).
   */
  sidebarMode?: "tool" | "home";
}) {
  const [navOpen, setNavOpen] = useState(false);
  const alwaysDrawer = sidebarMode === "tool";

  return (
    <div className="flex w-full h-screen lg:h-screen p-2 sm:p-4 gap-2 sm:gap-4 overflow-hidden">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} alwaysDrawer={alwaysDrawer} />
      <div className="flex-1 min-w-0 flex flex-col bg-surface rounded-[20px] sm:rounded-[28px] shadow-soft overflow-hidden">
        <Topbar title={title} onMenuClick={() => setNavOpen(true)} alwaysShowMenu={alwaysDrawer} />
        <main className="flex-1 min-h-0 flex flex-col max-w-[1180px] w-full mx-auto">
          <VScroller className="flex-1 min-h-0" trackClassName="h-full p-4 sm:p-[26px]">
            {children}
          </VScroller>
        </main>
      </div>
    </div>
  );
}
