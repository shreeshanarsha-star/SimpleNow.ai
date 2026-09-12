"use client";

import Link from "next/link";
import Icon from "@/components/Icon";
import { LicensedTool, PERSONAL_TOOL_DEFS } from "@/lib/licensedTools";

export default function IconicToolNav({
  currentHref,
  tools = PERSONAL_TOOL_DEFS,
  className = "",
}: {
  currentHref: string;
  tools?: LicensedTool[];
  className?: string;
}) {
  const personalTools = tools.filter((t) => t.group === "personal");
  const enterpriseTools = tools.filter((t) => t.group === "licensed");

  const renderToolIcon = (tool: LicensedTool) => {
    const isActive =
      currentHref === tool.href || (tool.href !== "/" && currentHref.startsWith(tool.href + "?"));

    return (
      <Link
        key={tool.href}
        href={tool.href}
        title={tool.name}
        aria-label={tool.name}
        className={`group relative flex items-center justify-center w-8 h-8 sm:w-8.5 sm:h-8.5 rounded-xl transition-all duration-150 flex-shrink-0 ${
          isActive
            ? "bg-brand-wash text-brand shadow-sm ring-1 ring-brand/30"
            : "text-ink-muted hover:text-ink hover:bg-page hover:scale-105"
        }`}
      >
        <Icon name={tool.icon} className="w-4 h-4 transition-transform group-hover:scale-110" />

        {/* Active Dot Indicator */}
        {isActive && (
          <span className="absolute -bottom-0.5 w-1.5 h-1.5 rounded-full bg-brand" />
        )}

        {/* Hover Tooltip Popup */}
        <span className="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 z-50 whitespace-nowrap rounded-md bg-ink px-2 py-0.5 text-[10px] font-semibold text-white opacity-0 shadow-soft transition-opacity group-hover:opacity-100">
          {tool.name}
        </span>
      </Link>
    );
  };

  return (
    <nav
      aria-label="Quick Tool Navigation"
      className={`flex items-center gap-1 p-1 bg-surface border border-border/80 rounded-2xl shadow-soft-sm max-w-full overflow-x-auto no-scrollbar ${className}`}
    >
      {/* Back to Personal Tools Catalog */}
      <Link
        href="/departments/widgets"
        title="Personal Tools Catalog"
        aria-label="Personal Tools Catalog"
        className="group relative flex items-center justify-center w-8 h-8 sm:w-8.5 sm:h-8.5 rounded-xl text-ink-muted hover:text-brand hover:bg-page transition-all flex-shrink-0"
      >
        <Icon name="grid" className="w-4 h-4 transition-transform group-hover:scale-110" />
        <span className="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 z-50 whitespace-nowrap rounded-md bg-ink px-2 py-0.5 text-[10px] font-semibold text-white opacity-0 shadow-soft transition-opacity group-hover:opacity-100">
          All Tools
        </span>
      </Link>

      <div className="w-px h-4 bg-border/80 mx-0.5 flex-shrink-0" />

      {/* Personal Tools */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {personalTools.map(renderToolIcon)}
      </div>

      {/* Enterprise Licensed Tools */}
      {enterpriseTools.length > 0 && (
        <>
          <div className="w-px h-4 bg-border/80 mx-0.5 flex-shrink-0" />
          <div className="flex items-center gap-1 flex-shrink-0">
            {enterpriseTools.map(renderToolIcon)}
          </div>
        </>
      )}
    </nav>
  );
}
