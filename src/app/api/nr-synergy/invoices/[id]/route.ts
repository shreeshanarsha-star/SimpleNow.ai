import { createRequest } from "@/lib/nrs/approvals";
import { logAudit } from "@/lib/nrs/audit";
import { formatMoney } from "@/lib/nrs/money";
import { lookupFxRate, reportingCurrency } from "@/lib/nrs/invoice/fx";
import { HttpError, dbCheck, guard, ok, readJson, run, str, uuid, type Guarded } from "@/lib/nrs/invoice/kit";
import { INVOICE_COLUMNS, loadLines, renderAndStorePdf, toInvoiceDto, type InvoiceRow } from "@/lib/nrs/invoice/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

/** Load an invoice the caller may see (RLS: self, manager, HR, finance). */
async function loadVisible(g: Guarded, id: string): Promise<InvoiceRow> {
  const { data, error } = await g.supabase
    .from("nrs_invoices")
    .select(INVOICE_COLUMNS)
    .eq("id", uuid(id, "Invoice"))
    .eq("org_id", g.orgId)
    .is("deleted_at", null)
    .maybeSingle();
  dbCheck(error, "Invoice");
  if (!data) throw new HttpError("Invoice not found", 404);
  return data as InvoiceRow;
}

export async function GET(_req: Request, { params }: Params) {
  return run(async () => {
    const g = await guard("money");
    const { id } = await params;
    const row = await loadVisible(g, id);
    const lines = await loadLines(g.admin, row.id);
    const { data: m } = await g.admin.from("nrs_members").select("full_name").eq("id", row.member_id).maybeSingle();
    return ok({
      invoice: toInvoiceDto(row, { lines, withSnapshot: true, member_name: (m as { full_name: string } | null)?.full_name }),
    });
  });
}

// PATCH {action:"submit"}                   owner: sign, lock FX, PDF, start approval
// PATCH {action:"mark_paid", payment_ref}   finance: finance_approved -> paid
export async function PATCH(req: Request, { params }: Params) {
  return run(async () => {
    const g = await guard("money");
    const { id } = await params;
    const b = await readJson(req);
    const row = await loadVisible(g, id);
    const now = new Date().toISOString();

    if (b.action === "submit") {
      if (!g.ctx.member || g.ctx.member.id !== row.member_id) throw new HttpError("Only the consultant can submit this invoice", 403);
      if (row.status === "sent_back" || row.status === "rejected") {
        throw new HttpError("Regenerate this invoice before submitting it again.", 409);
      }
      if (row.status !== "draft") throw new HttpError(`This invoice is already ${row.status.replace("_", " ")}`, 409);
      const { data: sig } = await g.admin.from("nrs_signatures").select("member_id").eq("member_id", row.member_id).maybeSingle();
      if (!sig) throw new HttpError("Add your signature before submitting an invoice.", 409);

      const rc = await reportingCurrency(g.admin, g.orgId);
      const fx = await lookupFxRate(g.admin, row.currency, rc, now.slice(0, 10));
      const { data: upd, error } = await g.admin
        .from("nrs_invoices")
        .update({ signed_at: now, fx_rate_to_reporting: fx?.rate ?? null })
        .eq("id", row.id)
        .eq("status", row.status)
        .select(INVOICE_COLUMNS)
        .single();
      dbCheck(error, "Signing invoice");
      // Render the signed PDF as it will be approved (status shown as submitted).
      await renderAndStorePdf(g.admin, { ...(upd as InvoiceRow), status: "submitted" });
      try {
        await createRequest(
          "invoice",
          row.id,
          row.member_id,
          `Invoice ${row.number} (${formatMoney(Number(row.total_minor), row.currency)})`,
          Number(row.total_minor),
          row.currency,
          { admin: g.admin, createdBy: g.user.id, summary: `${row.period_start} to ${row.period_end}` }
        );
      } catch (e) {
        await g.admin.from("nrs_invoices").update({ signed_at: null, pdf_path: null }).eq("id", row.id);
        throw e;
      }
      const { error: expErr } = await g.admin.from("nrs_expenses").update({ status: "invoiced" }).eq("invoice_id", row.id);
      dbCheck(expErr, "Marking expenses invoiced");
      await logAudit(g.admin, {
        orgId: g.orgId,
        actorUser: g.user.id,
        entity: "nrs_invoices",
        entityId: row.id,
        action: "submit",
        after: { number: row.number, total_minor: Number(row.total_minor), currency: row.currency, fx_rate_to_reporting: fx?.rate ?? null },
      });
      const { data: fresh } = await g.admin.from("nrs_invoices").select(INVOICE_COLUMNS).eq("id", row.id).single();
      return ok({ invoice: toInvoiceDto(fresh as InvoiceRow) });
    }

    if (b.action === "mark_paid") {
      if (!g.ctx.isFinance) throw new HttpError("Only Finance can mark invoices paid", 403);
      if (g.ctx.member?.id === row.member_id) throw new HttpError("You can't mark your own invoice paid", 403);
      if (row.status !== "finance_approved") throw new HttpError("Only finance-approved invoices can be marked paid", 409);
      const paymentRef = str(b.payment_ref, "Payment reference", { max: 120 });
      const { data: upd, error } = await g.admin
        .from("nrs_invoices")
        .update({ status: "paid", paid_at: now, payment_ref: paymentRef })
        .eq("id", row.id)
        .eq("status", "finance_approved")
        .select(INVOICE_COLUMNS)
        .single();
      dbCheck(error, "Marking paid");
      await g.admin.from("nrs_expenses").update({ status: "reimbursed" }).eq("invoice_id", row.id);
      const { data: member } = await g.admin.from("nrs_members").select("user_id").eq("id", row.member_id).maybeSingle();
      const userId = (member as { user_id: string | null } | null)?.user_id;
      if (userId) {
        await g.admin.from("notifications").insert({
          user_id: userId,
          org_id: g.orgId,
          feature_key: "NR Synergy",
          title: `Paid: invoice ${row.number}`,
          body: `${formatMoney(Number(row.total_minor), row.currency)} · ref ${paymentRef}`,
          link: "/tools/nr-synergy/money",
          channel: "in_app",
        });
      }
      await logAudit(g.admin, {
        orgId: g.orgId,
        actorUser: g.user.id,
        entity: "nrs_invoices",
        entityId: row.id,
        action: "mark_paid",
        before: { status: row.status },
        after: { status: "paid", paid_at: now, payment_ref: paymentRef },
      });
      return ok({ invoice: toInvoiceDto(upd as InvoiceRow) });
    }

    throw new HttpError("Unknown action");
  });
}

// DELETE: discard a draft invoice (its expenses become unbilled again).
export async function DELETE(_req: Request, { params }: Params) {
  return run(async () => {
    const g = await guard("money");
    const { id } = await params;
    const row = await loadVisible(g, id);
    if (!g.ctx.member || g.ctx.member.id !== row.member_id) throw new HttpError("Only the consultant can discard this invoice", 403);
    if (!["draft", "rejected", "cancelled", "sent_back"].includes(row.status)) {
      throw new HttpError("Only draft, sent-back or rejected invoices can be discarded", 409);
    }
    const rel = await g.admin.from("nrs_expenses").update({ invoice_id: null, status: "approved" }).eq("invoice_id", row.id);
    dbCheck(rel.error, "Releasing expenses");
    await g.admin.from("nrs_requests").delete().eq("kind", "invoice").eq("subject_id", row.id);
    const { error } = await g.admin.from("nrs_invoices").delete().eq("id", row.id);
    dbCheck(error, "Discarding invoice");
    await logAudit(g.admin, {
      orgId: g.orgId,
      actorUser: g.user.id,
      entity: "nrs_invoices",
      entityId: row.id,
      action: "discard",
      before: { number: row.number, status: row.status, total_minor: Number(row.total_minor) },
    });
    return ok({ ok: true });
  });
}
