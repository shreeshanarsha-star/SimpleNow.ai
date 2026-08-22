"use client";

import { useState } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function AppShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex w-full h-screen lg:h-screen p-2 sm:p-4 gap-2 sm:gap-4 overflow-hidden">
      <Sidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className="flex-1 min-w-0 flex flex-col bg-surface rounded-[20px] sm:rounded-[28px] shadow-soft overflow-hidden">
        <Topbar title={title} onMenuClick={() => setMobileNavOpen(true)} />
        <main className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-[26px] max-w-[1180px] w-full mx-auto flex flex-col">
          {children}
        </main>
      </div>
    </div>
  );
}
