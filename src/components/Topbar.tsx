"use client";

import Icon from "./Icon";
import TopbarStatus from "./TopbarStatus";

export default function Topbar({
  title,
  onMenuClick,
}: {
  title: string;
  onMenuClick?: () => void;
}) {
  return (
    <header className="flex-shrink-0 bg-surface px-4 sm:px-[26px] py-3 flex items-center gap-3">
      <button
        type="button"
        aria-label="Open menu"
        onClick={onMenuClick}
        className="lg:hidden w-8 h-8 rounded-full border border-border bg-surface flex items-center justify-center text-ink-2 flex-shrink-0"
      >
        <Icon name="menu" className="w-[16px] h-[16px]" />
      </button>
      <h1 className="m-0 text-[15px] sm:text-[16px] font-semibold text-ink flex-shrink-0 truncate">{title}</h1>
      <div className="flex-1" />
      <TopbarStatus />
    </header>
  );
}
