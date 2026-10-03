import { HttpError, dbCheck, guard, ok, run, signedUrlInOrg, uuid } from "@/lib/nrs/invoice/kit";
import { INVOICE_COLUMNS, renderAndStorePdf, type InvoiceRow } from "@/lib/nrs/invoice/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET: signed download URL for the invoice PDF. Drafts are rendered fresh
// (marked DRAFT); submitted invoices reuse the stored, signed PDF.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return run(async () => {
    const g = await guard("money");
    const { id } = await params;
    const { data, error } = await g.supabase
      .from("nrs_invoices")
      .select(INVOICE_COLUMNS)
      .eq("id", uuid(id, "Invoice"))
      .eq("org_id", g.orgId)
      .is("deleted_at", null)
      .maybeSingle();
    dbCheck(error, "Invoice");
    const row = data as InvoiceRow | null;
    if (!row) throw new HttpError("Invoice not found", 404);
    const path = row.pdf_path && row.status !== "draft" ? row.pdf_path : await renderAndStorePdf(g.admin, row);
    return ok({ url: await signedUrlInOrg(g.admin, g.orgId, path, `${row.number}.pdf`) });
  });
}
