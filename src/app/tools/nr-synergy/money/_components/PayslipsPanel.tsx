"use client";

import Icon from "@/components/Icon";
import { money as s } from "@/lib/nrs/i18n/en/money";
import { formatMoney } from "@/lib/nrs/money";
import { Badge, Card, Empty, ErrorBox, Loading, SectionTitle, api, fmt, useLoad } from "./ui";

interface PayslipDto {
  id: string;
  number: string;
  month: string;
  period_start: string;
  period_end: string;
  invoice_number: string;
  currency: string;
  net_minor: number;
  status: "finance_approved" | "paid";
  paid_at: string | null;
}

export default function PayslipsPanel() {
  const res = useLoad(() => api<{ payslips: PayslipDto[]; engagementType: string | null }>("/api/nr-synergy/payslips"), []);
  if (res.loading && !res.data) return <Loading label={s.common.loading} />;
  if (res.error || !res.data) return <ErrorBox message={res.error ?? s.common.error} onRetry={res.reload} retryLabel={s.common.retry} />;
  const { payslips, engagementType } = res.data;

  return (
    <Card>
      <SectionTitle title={s.payslips.title} body={s.payslips.body} />
      {payslips.length === 0 ? (
        <Empty title={s.payslips.empty} body={engagementType === "payroll" ? s.payslips.emptyPayroll : s.payslips.emptyConsultant} />
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {payslips.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span className="w-10 h-10 rounded-xl bg-brand-wash text-brand flex items-center justify-center flex-shrink-0">
                <Icon name="receipt" className="w-5 h-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold text-ink">{p.month}</p>
                <p className="text-[11.5px] text-ink-muted">
                  {p.number} · {fmt(s.payslips.period, { start: p.period_start, end: p.period_end })}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-ink-muted">{s.payslips.net}</p>
                <p className="text-[14px] font-bold text-ink tabular-nums">{formatMoney(p.net_minor, p.currency)}</p>
              </div>
              <Badge tone={p.status}>
                {p.status === "paid" ? fmt(s.payslips.paid, { date: (p.paid_at ?? "").slice(0, 10) }) : s.payslips.approved}
              </Badge>
              <a
                href={`/api/nr-synergy/payslips/${p.id}`}
                download
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[12.5px] font-bold text-brand hover:bg-brand-wash focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <Icon name="download" className="w-4 h-4" />
                {s.payslips.download}
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
