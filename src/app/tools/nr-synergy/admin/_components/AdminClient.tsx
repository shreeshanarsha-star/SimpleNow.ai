"use client";

import { useState } from "react";
import { admin as s } from "@/lib/nrs/i18n/en/admin";
import { Tabs } from "../../money/_components/ui";
import UsersSection from "./UsersSection";
import CountriesSection from "./CountriesSection";
import ChainsSection from "./ChainsSection";
import ContentSection from "./ContentSection";
import ContractsSection from "./ContractsSection";
import DemoSection from "./DemoSection";

type Key = "users" | "countries" | "chains" | "content" | "contracts" | "demo";

const KEYS: Key[] = ["users", "countries", "chains", "content", "contracts", "demo"];

export default function AdminClient() {
  const [tab, setTab] = useState<Key>("users");
  return (
    <div className="flex flex-col gap-4 min-w-0">
      <header>
        <h1 className="text-[18px] font-bold text-ink">{s.title}</h1>
        <p className="text-[12.5px] text-ink-muted">{s.subtitle}</p>
      </header>
      <Tabs tabs={KEYS.map((k) => ({ key: k, label: s.sections[k] }))} active={tab} onChange={setTab} label={s.sections.label} />
      <div role="tabpanel" aria-label={s.sections[tab]} className="min-w-0">
        {tab === "users" && <UsersSection />}
        {tab === "countries" && <CountriesSection />}
        {tab === "chains" && <ChainsSection />}
        {tab === "content" && <ContentSection />}
        {tab === "contracts" && <ContractsSection />}
        {tab === "demo" && <DemoSection />}
      </div>
    </div>
  );
}
