"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DEPARTMENTS, PERSONAL_TOOLS } from "@/lib/departments";
import Icon from "./Icon";
import LogoMark from "./LogoMark";

export default function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="w-[256px] flex-shrink-0 bg-gradient-to-b from-surface to-brand-wash border-r border-border flex flex-col sticky top-0 h-screen z-10 shadow-panel-right">
      {/* Same vertical padding (py-3) as Topbar's px-[26px] py-3, so the
          brand block and the "Overview" title land on one continuous
          horizontal line across the sidebar/main-column seam. */}
      <div className="flex items-center gap-3 px-5 py-3">
        <LogoMark size={32} className="shadow-emblem" />
        <div>
          <div className="font-semibold text-[16px] leading-tight text-ink">Askshree</div>
          <small className="block font-semibold text-[10px] text-brand tracking-[0.08em] mt-0.5">
            AI SYSTEMS
          </small>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-3">
        <SbLink href="/" icon="grid" name="Overview" active={pathname === "/"} />
        <SbLink
          href={`/departments/${PERSONAL_TOOLS.id}`}
          icon={PERSONAL_TOOLS.icon}
          name={PERSONAL_TOOLS.name}
          active={isActive(`/departments/${PERSONAL_TOOLS.id}`)}
        />

        <div className="text-[10.5px] font-semibold tracking-wider uppercase text-ink-muted px-2.5 pt-5 pb-2">
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

      {/* Bottom row -- deliberately left un-sticky/in-flow: the aside is
          h-screen with only `nav` scrolling, so this row already sits
          flush with the viewport bottom, on the same line as
          GlobalSearchBar's sticky-bottom row in the main column. */}
      <div className="border-t border-border/70 px-4 py-3.5 flex items-center gap-2.5">
        <div className="w-[30px] h-[30px] rounded-full bg-gradient-to-br from-brand to-[#5c4813] text-white text-[11.5px] font-semibold flex items-center justify-center flex-shrink-0 shadow-emblem">
          SN
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-semibold truncate text-ink">Shree</div>
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
      className={`flex items-center gap-2.5 px-3 py-[9px] rounded-md text-[13px] font-medium mb-0.5 transition-all ${
        active
          ? "bg-gradient-to-br from-[#f9edc9] to-[#eeda9e] text-brand font-semibold shadow-soft-sm"
          : "text-ink-2 hover:bg-page"
      }`}
    >
      <span className="w-4 h-4 flex-shrink-0">
        <Icon name={icon} className="w-4 h-4" />
      </span>
      <span className="flex-1 truncate">{name}</span>
      {dotStatus && (
        <span
          className={`w-[5px] h-[5px] rounded-full flex-shrink-0 ${
            dotStatus === "live" ? "bg-good" : "bg-border-strong"
          }`}
        />
      )}
    </Link>
  );
}
