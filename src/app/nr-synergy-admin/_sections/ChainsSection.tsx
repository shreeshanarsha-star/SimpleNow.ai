"use client";

import { useState } from "react";
import { admin as s } from "@/lib/nrs/i18n/en/admin";
import { fromMinor } from "@/lib/nrs/money";
import type { ChainDto } from "@/lib/nrs/invoice/adminTypes";
import { Button, Card, Empty, ErrorBox, Loading, Notice, SectionTitle, api, errorText, fmt, useLoad } from "@/app/tools/nr-synergy/money/_components/ui";

const ROLE_LABEL: Record<string, string> = {
  hr_admin: s.users.role_hr_admin,
  finance: s.users.role_finance,
  super_admin: s.users.role_super_admin,
};

function describeStep(step: unknown): string {
  if (!step || typeof step !== "object") return "?";
  const st = step as { type?: string; role?: string; when?: { amount_minor_gt?: number } };
  const base = st.type === "manager" ? s.chains.stepManager : st.type === "role" ? fmt(s.chains.stepRole, { role: ROLE_LABEL[st.role ?? ""] ?? st.role ?? "?" }) : s.chains.stepMember;
  const gt = st.when?.amount_minor_gt;
  // Thresholds are minor units; shown with 2 decimals (chain amounts are currency-agnostic).
  return typeof gt === "number" ? `${base} (${fmt(s.chains.stepWhen, { amount: fromMinor(gt, "USD") })})` : base;
}

export default function ChainsSection() {
  const list = useLoad(() => api<{ chains: ChainDto[] }>("/api/nr-synergy/admin/chains"), []);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const install = async () => {
    setBusy(true);
    setError(null);
    try {
      const { inserted } = await api<{ inserted: string[] }>("/api/nr-synergy/admin/chains", { method: "POST" });
      setNotice(inserted.length ? fmt(s.chains.installed, { kinds: inserted.join(", ") }) : s.chains.nothingToInstall);
      await list.reload();
    } catch (e) {
      setError(errorText(e, s.common.error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle
        title={s.sections.chains}
        body={s.chains.intro}
        action={
          <Button variant="primary" busy={busy} onClick={() => void install()}>
            {s.chains.install}
          </Button>
        }
      />
      {notice && <Notice message={notice} />}
      {error && <ErrorBox message={error} />}
      {list.loading && !list.data ? (
        <Loading label={s.common.loading} />
      ) : list.error ? (
        <ErrorBox message={list.error} onRetry={list.reload} retryLabel={s.common.retry} />
      ) : !list.data?.chains.length ? (
        <Card>
          <Empty title={s.chains.emptyTitle} body={s.chains.emptyBody} />
        </Card>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {list.data.chains.map((c) => (
            <li key={c.id}>
              <Card className="!p-3 h-full">
                <p className="text-[13px] font-bold text-ink">{s.chains.kinds[c.kind as keyof typeof s.chains.kinds] ?? c.kind}</p>
                <p className="text-[11.5px] text-ink-muted">
                  {s.chains.appliesTo}: {c.applies_to} · {fmt(s.chains.effective, { date: c.effective_from })}
                </p>
                <ol className="mt-2 flex flex-col gap-1 list-decimal pl-5 text-[12.5px] text-ink-2">
                  {(Array.isArray(c.steps) ? c.steps : []).map((st, i) => (
                    <li key={i}>{describeStep(st)}</li>
                  ))}
                </ol>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
