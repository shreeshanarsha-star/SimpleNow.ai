"use client";

import { useEffect, useState } from "react";
import { money as s } from "@/lib/nrs/i18n/en/money";
import type { MoneyProfileDto } from "@/lib/nrs/invoice/types";
import { ErrorBox, Loading, Tabs, api, useLoad } from "./ui";
import ExpensesPanel from "./ExpensesPanel";
import TravelPanel from "./TravelPanel";
import InvoicesPanel from "./InvoicesPanel";
import FinancePanel from "./FinancePanel";
import PayslipsPanel from "./PayslipsPanel";

type TabKey = "expenses" | "travel" | "invoices" | "payslips" | "finance";

export default function MoneyClient({ isConsultant, isFinance }: { isConsultant: boolean; isFinance: boolean }) {
  const [tab, setTab] = useState<TabKey>(isConsultant ? "invoices" : "expenses");
  // Deep link: /money?tab=payslips (from notifications and search answers).
  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get("tab");
    if (want === "payslips" || want === "expenses" || want === "travel" || (want === "invoices" && isConsultant) || (want === "finance" && isFinance)) {
      setTab(want);
    }
  }, [isConsultant, isFinance]);
  const profile = useLoad(() => api<MoneyProfileDto>("/api/nr-synergy/money/profile"), []);

  const tabs: { key: TabKey; label: string }[] = [
    ...(isConsultant ? [{ key: "invoices" as const, label: s.tabs.invoices }] : []),
    { key: "payslips", label: s.tabs.payslips },
    { key: "expenses", label: s.tabs.expenses },
    { key: "travel", label: s.tabs.travel },
    ...(isFinance ? [{ key: "finance" as const, label: s.tabs.finance }] : []),
  ];

  return (
    <div className="flex flex-col gap-4 min-w-0">
      <header>
        <h1 className="text-[18px] font-bold text-ink">{s.title}</h1>
        <p className="text-[12.5px] text-ink-muted">{s.subtitle}</p>
      </header>
      <Tabs tabs={tabs} active={tab} onChange={setTab} label={s.tabs.label} />
      <div role="tabpanel" aria-label={tabs.find((x) => x.key === tab)?.label} className="min-w-0">
        {profile.loading && !profile.data ? (
          <Loading label={s.common.loading} />
        ) : profile.error || !profile.data ? (
          <ErrorBox message={profile.error ?? s.common.error} onRetry={profile.reload} retryLabel={s.common.retry} />
        ) : tab === "expenses" ? (
          <ExpensesPanel profile={profile.data} />
        ) : tab === "travel" ? (
          <TravelPanel profile={profile.data} />
        ) : tab === "payslips" ? (
          <PayslipsPanel />
        ) : tab === "invoices" ? (
          <InvoicesPanel profile={profile.data} onProfileChange={profile.reload} />
        ) : (
          <FinancePanel />
        )}
      </div>
    </div>
  );
}
