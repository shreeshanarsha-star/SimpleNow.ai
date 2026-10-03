"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import Icon from "@/components/Icon";
import { t } from "@/lib/nrs/i18n/en";
import { NRS_BASE, NRS_TABS, type NrsTabKey } from "@/lib/nrs/tabs";

export interface NrsNavItem {
  key: NrsTabKey;
  /** Shown to HR only while the module isn't built yet. */
  soon: boolean;
}

function isActive(pathname: string, href: string): boolean {
  if (href === NRS_BASE) return pathname === NRS_BASE || pathname === `${NRS_BASE}/`;
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Sub-navigation for NR Synergy. Which tabs appear is decided on the server
// (feature switches, roles, built state); this only renders them and marks
// the active one. On narrow screens the bar scrolls horizontally and the
// active tab is scrolled into view.
export default function NrsNav({ items }: { items: NrsNavItem[] }) {
  const pathname = usePathname() ?? NRS_BASE;
  const activeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);

  const keys = new Set(items.map((i) => i.key));
  const soon = new Set(items.filter((i) => i.soon).map((i) => i.key));
  const main = NRS_TABS.filter((tab) => keys.has(tab.key) && tab.key !== "admin");
  const admin = NRS_TABS.find((tab) => tab.key === "admin" && keys.has("admin"));

  const linkClass = (active: boolean) =>
    `flex items-center gap-1.5 shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-[12.5px] font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
      active ? "bg-brand-wash text-brand-dark" : "text-ink-2 hover:bg-page hover:text-ink"
    }`;

  return (
    <nav aria-label={t("nav.label")} className="flex items-center gap-2 border-b border-border pb-2">
      <ul className="flex flex-1 min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {main.map((tab) => {
          const active = isActive(pathname, tab.href);
          return (
            <li key={tab.key} className="shrink-0">
              <Link
                href={tab.href}
                ref={active ? activeRef : undefined}
                aria-current={active ? "page" : undefined}
                className={linkClass(active)}
              >
                <Icon name={tab.icon} className="w-4 h-4" />
                <span>{t(tab.label)}</span>
                {soon.has(tab.key) && (
                  <span className="ml-0.5 rounded-full bg-page px-1.5 text-[9.5px] font-semibold text-ink-muted">
                    {t("nav.soon")}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      {admin && (
        <Link
          href={admin.href}
          aria-current={isActive(pathname, admin.href) ? "page" : undefined}
          className={`${linkClass(isActive(pathname, admin.href))} border border-border`}
        >
          <Icon name={admin.icon} className="w-4 h-4" />
          <span>{t(admin.label)}</span>
        </Link>
      )}
    </nav>
  );
}
