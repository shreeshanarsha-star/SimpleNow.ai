"use client";

import Link from "next/link";
import Icon from "./Icon";
import TopbarStatus from "./TopbarStatus";

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
  return (
    <header className="flex-shrink-0 bg-surface px-4 sm:px-[26px] py-3 flex items-center gap-2">
      <button
        type="button"
        aria-label="Open menu"
        onClick={onMenuClick}
        className={`${alwaysShowMenu ? "" : "lg:hidden"} w-8 h-8 rounded-full border border-border bg-surface flex items-center justify-center text-ink-2 flex-shrink-0`}
      >
        <Icon name="menu" className="w-[16px] h-[16px]" />
      </button>
      <Link
        href="/"
        aria-label="Home"
        title="Home"
        className="w-8 h-8 rounded-full border border-border bg-surface flex items-center justify-center text-ink-2 hover:text-ink hover:border-border-strong flex-shrink-0"
      >
        <Icon name="home" className="w-[15px] h-[15px]" />
      </Link>
      <h1 className="m-0 ml-1 text-[15px] sm:text-[16px] font-semibold text-ink flex-shrink-0 truncate">{title}</h1>
      <div className="flex-1" />
      <TopbarStatus />
    </header>
  );
}
