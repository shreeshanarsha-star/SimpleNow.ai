import type { InvoiceLineDto } from "./types";

// Pure payslip helpers (no I/O) — unit-tested in ./payslip.test.ts.

export const PAYSLIP_STATUSES = ["finance_approved", "paid"] as const;

export function isPayslipStatus(status: string): boolean {
  return (PAYSLIP_STATUSES as readonly string[]).includes(status);
}

export function payslipNumber(invoiceNumber: string): string {
  return `PS-${invoiceNumber}`;
}

/** "September 2026" from "2026-09-01". */
export function payslipMonth(periodStart: string): string {
  const [y, m] = periodStart.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

export interface PayslipItem {
  description: string;
  detail: string | null;
  amount_minor: number;
}

export interface PayslipBreakdown {
  earnings: PayslipItem[];
  deductions: PayslipItem[];
  reimbursements: PayslipItem[];
  grossMinor: number;
  deductionsMinor: number;
  reimbursementsMinor: number;
  netMinor: number;
}

/**
 * Split invoice lines into earnings, deductions (shown positive) and
 * reimbursements. Net = gross - deductions + reimbursements, which equals
 * the invoice total.
 */
export function payslipBreakdown(lines: Pick<InvoiceLineDto, "kind" | "description" | "quantity" | "amount_minor">[]): PayslipBreakdown {
  const earnings: PayslipItem[] = [];
  const deductions: PayslipItem[] = [];
  const reimbursements: PayslipItem[] = [];
  for (const l of lines) {
    const amount = Number(l.amount_minor);
    const qty = Number(l.quantity);
    const detail = Number.isFinite(qty) && qty !== 1 ? `${l.quantity} days` : null;
    if (l.kind === "expense") reimbursements.push({ description: l.description, detail: null, amount_minor: amount });
    else if (amount < 0) deductions.push({ description: l.description, detail, amount_minor: -amount });
    else earnings.push({ description: l.description, detail, amount_minor: amount });
  }
  const sum = (xs: PayslipItem[]) => xs.reduce((n, x) => n + x.amount_minor, 0);
  const grossMinor = sum(earnings);
  const deductionsMinor = sum(deductions);
  const reimbursementsMinor = sum(reimbursements);
  return { earnings, deductions, reimbursements, grossMinor, deductionsMinor, reimbursementsMinor, netMinor: grossMinor - deductionsMinor + reimbursementsMinor };
}

