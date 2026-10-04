import { dbCheck, guardMember, ok, run } from "@/lib/nrs/invoice/kit";
import { INVOICE_COLUMNS, type InvoiceRow } from "@/lib/nrs/invoice/service";
import { PAYSLIP_STATUSES, payslipMonth, payslipNumber } from "@/lib/nrs/invoice/payslip";

export const dynamic = "force-dynamic";

// GET /api/nr-synergy/payslips — the caller's OWN payslips only (one per
// finance-approved or paid invoice). Nobody else's, whatever their role.
export async function GET() {
  return run(async () => {
    const g = await guardMember("money");
    const { data, error } = await g.admin
      .from("nrs_invoices")
      .select(INVOICE_COLUMNS)
      .eq("org_id", g.orgId)
      .eq("member_id", g.member.id)
      .in("status", [...PAYSLIP_STATUSES])
      .is("deleted_at", null)
      .order("period_start", { ascending: false })
      .limit(36);
    dbCheck(error, "Payslips");
    const payslips = ((data ?? []) as InvoiceRow[]).map((r) => ({
      id: r.id,
      number: payslipNumber(r.number),
      month: payslipMonth(r.period_start),
      period_start: r.period_start,
      period_end: r.period_end,
      invoice_number: r.number,
      currency: r.currency,
      net_minor: Number(r.total_minor),
      status: r.status,
      paid_at: r.paid_at,
    }));
    return ok({ payslips, engagementType: g.ctx.engagementType ?? null });
  });
}
