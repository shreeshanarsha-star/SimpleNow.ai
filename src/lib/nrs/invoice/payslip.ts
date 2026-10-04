import type { SupabaseClient } from "@supabase/supabase-js";
import { formatMoney } from "../money";
import { notifyMembers } from "../notify";
import { renderPayslipPdf } from "./payslipPdf";
export { renderPayslipPdf } from "./payslipPdf";
export type { PayslipPdfInput } from "./payslipPdf";
import { INVOICE_COLUMNS, brandName, loadLines, orgName, type InvoiceRow } from "./service";

// Payslips are generated automatically from approved invoices: once an
// invoice is finance-approved (or paid) its consultant gets a payslip for
// that period. Nothing is uploaded or stored — the PDF is rendered on demand
// from the invoice and its lines, so it always matches the approved figures.

export { PAYSLIP_STATUSES, isPayslipStatus, payslipNumber, payslipMonth, payslipBreakdown } from "./payslipCalc";
export type { PayslipItem, PayslipBreakdown } from "./payslipCalc";
import { isPayslipStatus, payslipBreakdown, payslipMonth, payslipNumber } from "./payslipCalc";

interface MemberRow {
  full_name: string;
  email: string;
  designation: string | null;
  department: string | null;
  home_country: string;
}

/** Build and render the payslip PDF for an invoice row (caller has authorised access). */
export async function buildPayslipPdf(admin: SupabaseClient, inv: InvoiceRow): Promise<Uint8Array> {
  const [{ data: m }, lines, brand, company] = await Promise.all([
    admin.from("nrs_members").select("full_name, email, designation, department, home_country").eq("id", inv.member_id).maybeSingle(),
    loadLines(admin, inv.id),
    brandName(admin, inv.org_id),
    orgName(admin, inv.org_id),
  ]);
  const member = m as MemberRow | null;
  if (!member) throw new Error("Member not found");
  return renderPayslipPdf({
    brandName: brand,
    companyName: company,
    number: payslipNumber(inv.number),
    month: payslipMonth(inv.period_start),
    periodStart: inv.period_start,
    periodEnd: inv.period_end,
    invoiceNumber: inv.number,
    currency: inv.currency,
    employee: {
      name: member.full_name,
      email: member.email,
      designation: member.designation,
      department: member.department,
      country: member.home_country,
      engagement: "Consultant",
    },
    breakdown: payslipBreakdown(lines),
    status: inv.status === "paid" ? "paid" : "finance_approved",
    paidAt: inv.paid_at,
    paymentRef: inv.payment_ref,
    generatedOn: new Date().toISOString().slice(0, 10),
  });
}

/** In-app (+ email) note to the consultant that the payslip for an invoice is ready. Best-effort. */
export async function notifyPayslipReady(admin: SupabaseClient, invoiceId: string): Promise<void> {
  try {
    const { data } = await admin.from("nrs_invoices").select(INVOICE_COLUMNS).eq("id", invoiceId).maybeSingle();
    const inv = data as InvoiceRow | null;
    if (!inv || !isPayslipStatus(inv.status)) return;
    await notifyMembers(admin, inv.org_id, [inv.member_id], {
      title: `Your payslip for ${payslipMonth(inv.period_start)} is ready`,
      body: `Net pay ${formatMoney(Number(inv.total_minor), inv.currency)}. Download it from Money → Payslips.`,
      link: "/tools/nr-synergy/money?tab=payslips",
    });
  } catch (e) {
    console.error("[nrs] payslip notice failed", invoiceId, e);
  }
}
