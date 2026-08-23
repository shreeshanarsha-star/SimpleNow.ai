"use client";

import Link from "next/link";

export default function RequisitionTabs({
  requisitionId,
  active,
}: {
  requisitionId: string;
  active: "role" | "eligibility" | "candidates";
}) {
  const tabs: { key: "role" | "eligibility" | "candidates"; label: string; href: string }[] = [
    { key: "role", label: "Role overview", href: `/tools/talent-ai/requisitions/${requisitionId}` },
    { key: "eligibility", label: "Eligibility", href: `/tools/talent-ai/requisitions/${requisitionId}?view=eligibility` },
    { key: "candidates", label: "Candidates", href: `/tools/talent-ai/requisitions/${requisitionId}?view=candidates` },
  ];

  return (
    <div className="flex items-center gap-4 border-b border-border">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`px-1 pb-2 text-[13px] font-semibold border-b-2 -mb-px transition-colors ${
            active === t.key ? "border-brand text-brand" : "border-transparent text-ink-muted hover:text-ink"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
