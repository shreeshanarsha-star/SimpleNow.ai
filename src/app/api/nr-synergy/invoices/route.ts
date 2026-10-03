import { HttpError, dbCheck, guard, guardMember, isoDate, ok, readJson, run } from "@/lib/nrs/invoice/kit";
import { previousMonth } from "@/lib/nrs/invoice/calc";
import { INVOICE_COLUMNS, generateInvoice, loadLines, toInvoiceDto, type InvoiceRow } from "@/lib/nrs/invoice/service";

export const dynamic = "force-dynamic";

// GET            -> the caller's invoices
// GET ?scope=finance -> every submitted invoice in the org (Finance / HR)
export async function GET(req: Request) {
  return run(async () => {
    const scope = new URL(req.url).searchParams.get("scope");
    if (scope === "finance") {
      const g = await guard("money");
      if (!g.ctx.isFinance && !g.ctx.isHr) throw new HttpError("Only Finance can see all invoices.", 403);
      const { data, error } = await g.admin
        .from("nrs_invoices")
        .select(INVOICE_COLUMNS)
        .eq("org_id", g.orgId)
        .is("deleted_at", null)
        .neq("status", "draft")
        .order("period_start", { ascending: false })
        .limit(300);
      dbCheck(error, "Invoices");
      const rows = (data ?? []) as InvoiceRow[];
      const memberIds = Array.from(new Set(rows.map((r) => r.member_id)));
      const names = new Map<string, string>();
      if (memberIds.length) {
        const { data: ms } = await g.admin.from("nrs_members").select("id, full_name").in("id", memberIds);
        for (const m of (ms ?? []) as { id: string; full_name: string }[]) names.set(m.id, m.full_name);
      }
      return ok({ invoices: rows.map((r) => toInvoiceDto(r, { member_name: names.get(r.member_id) })) });
    }
    const g = await guardMember("money");
    const { data, error } = await g.admin
      .from("nrs_invoices")
      .select(INVOICE_COLUMNS)
      .eq("member_id", g.member.id)
      .is("deleted_at", null)
      .order("period_start", { ascending: false })
      .limit(60);
    dbCheck(error, "Invoices");
    return ok({ invoices: ((data ?? []) as InvoiceRow[]).map((r) => toInvoiceDto(r)) });
  });
}

// POST {period_start?, period_end?} -> generate (or regenerate) a draft invoice.
// Defaults to last calendar month.
export async function POST(req: Request) {
  return run(async () => {
    const g = await guardMember("money");
    if (g.ctx.engagementType !== "consultant") throw new HttpError("Invoices are for consultants only.", 403);
    const b = await readJson(req);
    const def = previousMonth(new Date().toISOString().slice(0, 10));
    const start = isoDate(b.period_start, "Period start", true) ?? def.start;
    const end = isoDate(b.period_end, "Period end", true) ?? def.end;
    if (end < start) throw new HttpError("Period end is before period start");
    if (start.slice(0, 7) !== end.slice(0, 7)) throw new HttpError("An invoice covers one calendar month at most");
    if (end > new Date().toISOString().slice(0, 10)) {
      throw new HttpError("You can only invoice for days that have already passed");
    }
    const row = await generateInvoice(g.admin, g.member, g.user.id, start, end);
    const lines = await loadLines(g.admin, row.id);
    return ok({ invoice: toInvoiceDto(row, { lines, withSnapshot: true }) }, 201);
  });
}
