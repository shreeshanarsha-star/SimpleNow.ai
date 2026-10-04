import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCountryCalendar } from "../dates";
import { logAudit } from "../audit";
import { calculateInvoice, InvoiceCalcError, invoiceNumber, monthBounds, type BillingBasis, type CalcExpense, type CalcResult } from "./calc";
import { lookupFxRate } from "./fx";
import { HttpError, dbCheck, uploadPrivate } from "./kit";
import { renderInvoicePdf } from "./pdf";
import type { ContractTermsDto, InvoiceDto, InvoiceLineDto, InvoiceStatus } from "./types";
import type { NrsMember } from "../member";

// Server-side invoice operations shared by the /api/nr-synergy/invoices routes.

export const INVOICE_COLUMNS =
  "id, org_id, member_id, number, period_start, period_end, terms_id, currency, subtotal_minor, expenses_minor, total_minor, fx_rate_to_reporting, calc_snapshot, status, signed_at, pdf_path, paid_at, payment_ref, is_demo, created_at";

export interface InvoiceRow {
  id: string;
  org_id: string;
  member_id: string;
  number: string;
  period_start: string;
  period_end: string;
  terms_id: string;
  currency: string;
  subtotal_minor: number;
  expenses_minor: number;
  total_minor: number;
  fx_rate_to_reporting: string | null;
  calc_snapshot: Record<string, unknown>;
  status: InvoiceStatus;
  signed_at: string | null;
  pdf_path: string | null;
  paid_at: string | null;
  payment_ref: string | null;
  is_demo: boolean;
  created_at: string;
}

export const REGENERABLE: readonly InvoiceStatus[] = ["draft", "sent_back", "rejected", "cancelled"];

export function toInvoiceDto(r: InvoiceRow, extra: { member_name?: string; lines?: InvoiceLineDto[]; withSnapshot?: boolean } = {}): InvoiceDto {
  return {
    id: r.id,
    member_id: r.member_id,
    member_name: extra.member_name,
    number: r.number,
    period_start: r.period_start,
    period_end: r.period_end,
    currency: r.currency,
    subtotal_minor: Number(r.subtotal_minor),
    expenses_minor: Number(r.expenses_minor),
    total_minor: Number(r.total_minor),
    status: r.status,
    signed_at: r.signed_at,
    paid_at: r.paid_at,
    payment_ref: r.payment_ref,
    has_pdf: !!r.pdf_path,
    created_at: r.created_at,
    lines: extra.lines,
    calc_snapshot: extra.withSnapshot ? r.calc_snapshot : undefined,
  };
}

export async function loadLines(db: SupabaseClient, invoiceId: string): Promise<InvoiceLineDto[]> {
  const { data, error } = await db
    .from("nrs_invoice_lines")
    .select("id, sort, kind, description, quantity, unit_minor, amount_minor, source")
    .eq("invoice_id", invoiceId)
    .order("sort", { ascending: true });
  dbCheck(error, "Invoice lines");
  return ((data ?? []) as InvoiceLineDto[]).map((l) => ({
    ...l,
    quantity: String(l.quantity),
    unit_minor: Number(l.unit_minor),
    amount_minor: Number(l.amount_minor),
  }));
}

/** Latest verified terms effective in [start, end] for the member. */
export async function loadVerifiedTerms(
  admin: SupabaseClient,
  memberId: string,
  start: string,
  end: string
): Promise<ContractTermsDto | null> {
  const { data, error } = await admin
    .from("nrs_contract_terms")
    .select(
      "id, contract_id, member_id, effective_from, effective_to, basis, fee_minor, currency, paid_leave_days_per_year, reimbursables, tax, notice_days, clause_refs, verified_at"
    )
    .eq("member_id", memberId)
    .not("verified_at", "is", null)
    .lte("effective_from", end)
    .or(`effective_to.is.null,effective_to.gte.${start}`)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  dbCheck(error, "Contract terms");
  if (!data) return null;
  const t = data as ContractTermsDto & { fee_minor: number | string; paid_leave_days_per_year: string | number };
  return { ...t, fee_minor: Number(t.fee_minor), paid_leave_days_per_year: String(t.paid_leave_days_per_year) };
}

/** Compute (but do not store) an invoice for the member and period. */
export async function computeInvoice(
  admin: SupabaseClient,
  member: NrsMember,
  start: string,
  end: string,
  excludeInvoiceId: string | null
): Promise<{ calc: CalcResult; terms: ContractTermsDto }> {
  const terms = await loadVerifiedTerms(admin, member.id, start, end);
  if (!terms) throw new HttpError("No verified contract terms cover this period. Ask HR to verify your contract.", 409);

  const month = monthBounds(start);
  const yearStart = `${start.slice(0, 4)}-01-01`;
  const [periodCal, yearCal] = await Promise.all([
    loadCountryCalendar(admin, member.org_id, member.home_country, month.start, month.end),
    loadCountryCalendar(admin, member.org_id, member.home_country, yearStart, month.end),
  ]);

  const [leaveRes, logsRes, expRes] = await Promise.all([
    admin
      .from("nrs_leave_requests")
      .select("id, type, starts_on, ends_on")
      .eq("member_id", member.id)
      .eq("status", "approved")
      .lte("starts_on", end)
      .gte("ends_on", yearStart),
    admin.from("nrs_work_logs").select("day").eq("member_id", member.id).gte("day", start).lte("day", end),
    admin
      .from("nrs_expenses")
      .select("id, spent_on, category, description, amount_minor, currency, invoice_id")
      .eq("member_id", member.id)
      .in("status", ["approved", "invoiced"])
      .is("deleted_at", null)
      .lte("spent_on", end),
  ]);
  dbCheck(leaveRes.error, "Leave");
  dbCheck(logsRes.error, "Work logs");
  dbCheck(expRes.error, "Expenses");

  const rawExpenses = ((expRes.data ?? []) as (Omit<CalcExpense, "rate_to_invoice_currency"> & { invoice_id: string | null })[]).filter(
    (e) => e.invoice_id === null || e.invoice_id === excludeInvoiceId
  );
  const expenses: CalcExpense[] = [];
  for (const e of rawExpenses) {
    let rate: string | null = null;
    if (e.currency.toUpperCase() !== terms.currency.toUpperCase()) {
      rate = (await lookupFxRate(admin, e.currency, terms.currency, e.spent_on))?.rate ?? null;
    }
    expenses.push({ ...e, amount_minor: Number(e.amount_minor), rate_to_invoice_currency: rate });
  }

  try {
    const calc = calculateInvoice({
      periodStart: start,
      periodEnd: end,
      terms: {
        id: terms.id,
        basis: terms.basis as BillingBasis,
        fee_minor: terms.fee_minor,
        currency: terms.currency,
        paid_leave_days_per_year: terms.paid_leave_days_per_year,
        reimbursables: terms.reimbursables ?? [],
        clause_refs: terms.clause_refs ?? {},
        effective_from: terms.effective_from,
        effective_to: terms.effective_to,
      },
      calendar: {
        countryCode: member.home_country,
        workingDays: periodCal.workingDays,
        holidays: yearCal.holidayList.map((h) => h.day),
      },
      approvedLeave: (leaveRes.data ?? []) as { id: string; type: string; starts_on: string; ends_on: string }[],
      workLogDays: ((logsRes.data ?? []) as { day: string }[]).map((l) => l.day),
      expenses,
    });
    calc.snapshot.calendar = { ...(calc.snapshot.calendar as Record<string, unknown>), rule_effective_from: periodCal.ruleEffectiveFrom };
    return { calc, terms };
  } catch (e) {
    if (e instanceof InvoiceCalcError) throw new HttpError(e.message, 422);
    throw e;
  }
}

/** Create or regenerate the member's invoice for [start, end]. Returns the stored row. */
export async function generateInvoice(
  admin: SupabaseClient,
  member: NrsMember,
  actorUser: string,
  start: string,
  end: string
): Promise<InvoiceRow> {
  const { data: existingData, error: exErr } = await admin
    .from("nrs_invoices")
    .select(INVOICE_COLUMNS)
    .eq("member_id", member.id)
    .eq("period_start", start)
    .eq("period_end", end)
    .maybeSingle();
  dbCheck(exErr, "Invoice");
  const existing = existingData as InvoiceRow | null;
  if (existing && !REGENERABLE.includes(existing.status)) {
    throw new HttpError(`An invoice for this period is already ${existing.status.replace("_", " ")}.`, 409);
  }

  const { calc, terms } = await computeInvoice(admin, member, start, end, existing?.id ?? null);
  const fields = {
    org_id: member.org_id,
    member_id: member.id,
    number: invoiceNumber(start, member.id),
    period_start: start,
    period_end: end,
    terms_id: terms.id,
    currency: calc.currency,
    subtotal_minor: calc.subtotal_minor,
    expenses_minor: calc.expenses_minor,
    total_minor: calc.total_minor,
    calc_snapshot: calc.snapshot,
    status: "draft" as const,
    signed_at: null,
    pdf_path: null,
    fx_rate_to_reporting: null,
  };

  let row: InvoiceRow;
  if (existing) {
    // Release expenses held by the old draft, then replace its lines.
    const rel = await admin
      .from("nrs_expenses")
      .update({ invoice_id: null, status: "approved" })
      .eq("invoice_id", existing.id)
      .in("status", ["approved", "invoiced"]);
    dbCheck(rel.error, "Releasing expenses");
    // A rejected request can't be restarted by the engine; cancel it so a new submit can.
    const cancel = await admin
      .from("nrs_requests")
      .update({ status: "cancelled" })
      .eq("kind", "invoice")
      .eq("subject_id", existing.id)
      .in("status", ["rejected"]);
    dbCheck(cancel.error, "Cancelling old request");
    const del = await admin.from("nrs_invoice_lines").delete().eq("invoice_id", existing.id);
    dbCheck(del.error, "Clearing lines");
    const { data, error } = await admin.from("nrs_invoices").update(fields).eq("id", existing.id).select(INVOICE_COLUMNS).single();
    dbCheck(error, "Updating invoice");
    row = data as InvoiceRow;
  } else {
    const { data, error } = await admin.from("nrs_invoices").insert(fields).select(INVOICE_COLUMNS).single();
    if (error?.code === "23505") throw new HttpError("An invoice with this number already exists for another period this month.", 409);
    dbCheck(error, "Creating invoice");
    row = data as InvoiceRow;
  }

  if (calc.lines.length) {
    const { error } = await admin.from("nrs_invoice_lines").insert(
      calc.lines.map((l) => ({
        invoice_id: row.id,
        org_id: member.org_id,
        sort: l.sort,
        kind: l.kind,
        description: l.description,
        quantity: l.quantity,
        unit_minor: l.unit_minor,
        amount_minor: l.amount_minor,
        source: l.source,
      }))
    );
    dbCheck(error, "Invoice lines");
  }
  if (calc.expense_ids.length) {
    const { error } = await admin.from("nrs_expenses").update({ invoice_id: row.id }).in("id", calc.expense_ids);
    dbCheck(error, "Linking expenses");
  }

  await logAudit(admin, {
    orgId: member.org_id,
    actorUser,
    entity: "nrs_invoices",
    entityId: row.id,
    action: existing ? "regenerate" : "generate",
    before: existing ? { total_minor: existing.total_minor, status: existing.status } : null,
    after: { number: row.number, total_minor: row.total_minor, currency: row.currency, lines: calc.lines.length },
  });
  return row;
}

export async function brandName(admin: SupabaseClient, orgId: string): Promise<string> {
  const { data } = await admin.from("nrs_org_settings").select("display_name").eq("org_id", orgId).maybeSingle();
  return (data as { display_name: string | null } | null)?.display_name || "NR Synergy";
}

export async function orgName(admin: SupabaseClient, orgId: string): Promise<string> {
  const { data } = await admin.from("organizations").select("name").eq("id", orgId).maybeSingle();
  return (data as { name: string | null } | null)?.name || "Natural Remedies";
}

/** Render the PDF for an invoice, upload it and store pdf_path. Returns the path. */
export async function renderAndStorePdf(admin: SupabaseClient, inv: InvoiceRow): Promise<string> {
  const [{ data: m }, { data: sig }, lines, brand, billTo] = await Promise.all([
    admin.from("nrs_members").select("full_name, email, home_country, designation").eq("id", inv.member_id).maybeSingle(),
    admin.from("nrs_signatures").select("svg_path").eq("member_id", inv.member_id).maybeSingle(),
    loadLines(admin, inv.id),
    brandName(admin, inv.org_id),
    orgName(admin, inv.org_id),
  ]);
  const member = m as { full_name: string; email: string; home_country: string; designation: string | null } | null;
  if (!member) throw new HttpError("Member not found", 404);
  const bytes = await renderInvoicePdf({
    brandName: brand,
    number: inv.number,
    issuedOn: (inv.signed_at ?? new Date().toISOString()).slice(0, 10),
    periodStart: inv.period_start,
    periodEnd: inv.period_end,
    currency: inv.currency,
    status: inv.status,
    from: { name: member.full_name, email: member.email, country: member.home_country, designation: member.designation },
    billTo: { name: billTo },
    lines,
    subtotalMinor: Number(inv.subtotal_minor),
    expensesMinor: Number(inv.expenses_minor),
    totalMinor: Number(inv.total_minor),
    signaturePath: inv.signed_at ? ((sig as { svg_path: string } | null)?.svg_path ?? null) : null,
    signedAt: inv.signed_at,
  });
  const path = `${inv.org_id}/invoices/${inv.member_id}/${inv.number}${inv.status === "draft" ? "-draft" : ""}.pdf`;
  await uploadPrivate(admin, path, bytes, "application/pdf");
  if (inv.status !== "draft") {
    const { error } = await admin.from("nrs_invoices").update({ pdf_path: path }).eq("id", inv.id);
    dbCheck(error, "Saving PDF path");
  }
  return path;
}
