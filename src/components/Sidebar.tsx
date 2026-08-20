"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DEPARTMENTS, PERSONAL_TOOLS } from "@/lib/departments";
import Icon from "./Icon";

export default function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="w-[252px] flex-shrink-0 bg-surface border-r border-border flex flex-col sticky top-0 h-screen">
      <div className="flex items-center gap-2.5 px-[18px] pt-5 pb-3.5">
        <div className="w-[26px] h-[26px] rounded-lg bg-brand flex-shrink-0" />
        <div>
          <div className="font-bold text-[15.5px] leading-tight">Askshree</div>
          <small className="block font-medium text-[10.5px] text-ink-muted tracking-wide">
            AI SYSTEMS
          </small>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 pb-2.5 pt-1">
        <SbLink href="/" icon="grid" name="Overview" active={pathname === "/"} />
        <SbLink
          href={`/departments/${PERSONAL_TOOLS.id}`}
          icon={PERSONAL_TOOLS.icon}
          name={PERSONAL_TOOLS.name}
          active={isActive(`/departments/${PERSONAL_TOOLS.id}`)}
        />

        <div className="text-[10.5px] font-bold tracking-wider uppercase text-ink-muted px-2 pt-3.5 pb-1.5">
          AI Systems — by department
        </div>
        {DEPARTMENTS.map((d) => (
          <SbLink
            key={d.id}
            href={`/departments/${d.id}`}
            icon={d.icon}
            name={d.name}
            active={isActive(`/departments/${d.id}`)}
            dotStatus={d.status}
          />
        ))}
      </nav>

      <div className="border-t border-border px-3.5 py-3 flex items-center gap-2.5">
        <div className="w-[30px] h-[30px] rounded-full bg-ink text-white text-[11.5px] font-bold flex items-center justify-center flex-shrink-0">
          SN
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-bold truncate">Shree</div>
          <div className="text-[11px] text-ink-muted">Owner</div>
        </div>
        <Link
          href="/admin"
          className="text-ink-muted hover:text-ink p-1"
          aria-label="Admin"
        >
          <Icon name="gear" className="w-[15px] h-[15px]" />
        </Link>
      </div>
    </aside>
  );
}

function SbLink({
  href,
  icon,
  name,
  active,
  dotStatus,
}: {
  href: string;
  icon: string;
  name: string;
  active: boolean;
  dotStatus?: "live" | "soon";
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 px-[9px] py-2 rounded-sm text-[13px] font-medium ${
        active
          ? "bg-brand-wash text-brand font-bold"
          : "text-ink-2 hover:bg-page"
      }`}
    >
      <span className="w-4 h-4 flex-shrink-0">
        <Icon name={icon} className="w-4 h-4" />
      </span>
      <span className="flex-1 truncate">{name}</span>
      {dotStatus && (
        <span
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
            dotStatus === "live" ? "bg-good" : "bg-border-strong"
          }`}
        />
      )}
    </Link>
  );
}
