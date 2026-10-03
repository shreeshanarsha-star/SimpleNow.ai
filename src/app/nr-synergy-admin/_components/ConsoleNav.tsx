"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import Icon from "@/components/Icon";
import { admin as s } from "@/lib/nrs/i18n/en/admin";
import { ADMIN_SECTIONS } from "@/lib/nrs/adminConsole";
import { NRS_ADMIN_BASE } from "@/lib/nrs/tabs";

function isActive(pathname: string, href: string): boolean {
  if (href === NRS_ADMIN_BASE) return pathname === NRS_ADMIN_BASE || pathname === `${NRS_ADMIN_BASE}/`;
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Admin Console navigation. A vertical sidebar from md (768px) up; below
// that it collapses into a horizontally scrolling bar under the header,
// with the active section kept in view.
export default function ConsoleNav() {
  const pathname = usePathname() ?? NRS_ADMIN_BASE;
  const activeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);

  return (
    <nav aria-label={s.console.navLabel} className="min-w-0">
      <ul className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {ADMIN_SECTIONS.map((sec) => {
          const active = isActive(pathname, sec.href);
          return (
            <li key={sec.key} className="shrink-0">
              <Link
                href={sec.href}
                ref={active ? activeRef : undefined}
                aria-current={active ? "page" : undefined}
                className={`group flex items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-[12.5px] font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                  active
                    ? "bg-brand-wash text-brand-dark md:shadow-soft-sm"
                    : "text-ink-2 hover:bg-page hover:text-ink"
                }`}
              >
                <Icon
                  name={sec.icon}
                  className={`w-4 h-4 shrink-0 ${active ? "text-brand" : "text-ink-muted group-hover:text-ink-2"}`}
                />
                <span>{s.console.nav[sec.key]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
