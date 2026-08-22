"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AdminNav() {
  const pathname = usePathname();

  const tabs = [
    { href: "/admin", label: "Approvals" },
    { href: "/admin/organizations", label: "Organizations" },
    { href: "/admin/users", label: "Users" },
  ];

  return (
    <div className="flex gap-1 border-b border-border mb-6 -mt-2">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`text-[13px] font-bold px-3 py-2.5 border-b-2 -mb-px ${
              active
                ? "border-brand text-brand"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
