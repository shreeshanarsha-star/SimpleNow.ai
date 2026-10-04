import { HttpError, guard, run, uuid } from "@/lib/nrs/invoice/kit";
import { INVOICE_COLUMNS, type InvoiceRow } from "@/lib/nrs/invoice/service";
import { buildPayslipPdf, isPayslipStatus, payslipMonth } from "@/lib/nrs/invoice/payslip";

export const dynamic = "force-dynamic";

// GET /api/nr-synergy/payslips/:invoiceId — download the payslip PDF.
// Allowed for the person it belongs to, and for HR / Finance (support).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return run(async () => {
    const g = await guard("money");
    const id = uuid((await params).id, "Payslip");
    const { data } = await g.admin.from("nrs_invoices").select(INVOICE_COLUMNS).eq("id", id).eq("org_id", g.orgId).is("deleted_at", null).maybeSingle();
    const inv = data as InvoiceRow | null;
    const mine = !!inv && g.ctx.member?.id === inv.member_id;
    if (!inv || (!mine && !g.ctx.isHr && !g.ctx.isFinance)) throw new HttpError("Payslip not found", 404);
    if (!isPayslipStatus(inv.status)) throw new HttpError("The payslip is created once the invoice is approved.", 409);
    const bytes = await buildPayslipPdf(g.admin, inv);
    const name = `Payslip-${payslipMonth(inv.period_start).replace(/\s+/g, "-")}.pdf`;
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "private, no-store",
      },
    });
  });
}
