"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "@/components/Icon";
import { t } from "@/lib/nrs/i18n/en";
import { NRS_DESKS } from "@/lib/nrs/tabs";

type DeskKey = (typeof NRS_DESKS)[number]["key"];

const LABEL = { support: "nav.deskSupport", travel: "nav.deskTravel" } as const;

// Sub-tabs for the Desk tab. Which desks appear is decided on the server.
export default function DeskNav({ allowed }: { allowed: DeskKey[] }) {
  const pathname = usePathname() ?? "";
  const desks = NRS_DESKS.filter((d) => allowed.includes(d.key));
  if (desks.length < 2) return null;
  return (
    <nav aria-label={t("nav.deskLabel")}>
      <ul className="inline-flex items-center gap-1 rounded-md border border-border bg-surface p-1">
        {desks.map((d) => {
          const active = pathname === d.href || pathname.startsWith(`${d.href}/`);
          return (
            <li key={d.key}>
              <Link
                href={d.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-sm px-3 py-1.5 text-[12.5px] font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                  active ? "bg-brand-wash text-brand-dark" : "text-ink-2 hover:bg-page hover:text-ink"
                }`}
              >
                <Icon name={d.icon} className="w-4 h-4" />
                <span>{t(LABEL[d.key])}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
