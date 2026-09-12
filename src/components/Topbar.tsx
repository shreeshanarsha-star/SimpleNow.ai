"use client";

import Link from "next/link";
import Icon from "./Icon";
import Logo from "./Logo";
import TopbarStatus from "./TopbarStatus";
import { useToolHomeHandler } from "./ToolHomeContext";

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

      {toolHome ? (
        <button
          type="button"
          onClick={toolHome}
          title={`Back to ${title} home`}
          className="m-0 text-[14px] sm:text-[15px] font-semibold text-ink flex-shrink-0 truncate hover:text-brand transition-colors"
        >
          {title}
        </button>
      ) : (
        <h1 className="m-0 text-[14px] sm:text-[15px] font-semibold text-ink flex-shrink-0 truncate">{title}</h1>
      )}
      <div className="flex-1" />
      <TopbarStatus />
    </header>
  );
}
