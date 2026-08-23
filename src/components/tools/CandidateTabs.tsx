"use client";

import Link from "next/link";

export default function CandidateTabs({
  candidateId,
  active,
}: {
  candidateId: string;
  active: "summary" | "details";
}) {
  const tabs: { key: "summary" | "details"; label: string; href: string }[] = [
    { key: "summary", label: "Candidate Summary", href: `/tools/talent-ai/candidates/${candidateId}` },
    { key: "details", label: "Candidate Details", href: `/tools/talent-ai/candidates/${candidateId}?view=details` },
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
