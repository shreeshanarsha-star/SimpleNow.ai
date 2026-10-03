import { logAudit } from "@/lib/nrs/audit";
import { addDays } from "@/lib/nrs/dates";
import { toMinor } from "@/lib/nrs/money";
import {
  HttpError,
  currency as parseCurrency,
  dbCheck,
  guard,
  intOrNull,
  isoDate,
  jsonObject,
  ok,
  oneOf,
  readJson,
  run,
  str,
  strArray,
  uuid,
} from "@/lib/nrs/invoice/kit";
import { loadContract } from "@/lib/nrs/invoice/contractServer";
import { EXPENSE_CATEGORIES } from "@/lib/nrs/invoice/types";

export const dynamic = "force-dynamic";

const BASES = ["monthly_retainer", "pro_rata_working_days", "day_rate"] as const;

// POST {basis, fee, currency, paid_leave_days_per_year, reimbursables[], tax{}, notice_days,
//       effective_from, effective_to?, clause_refs{}}
// HR verifies the (edited) terms: inserts nrs_contract_terms and marks the contract verified.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return run(async () => {
    const g = await guard(undefined, "hr");
    const { id } = await params;
    const c = await loadContract(g.admin, g.orgId, uuid(id, "Contract"));
    if (c.status === "verified" || c.status === "superseded") throw new HttpError("This contract is already verified", 409);
    if (c.status === "extracting") throw new HttpError("Wait for extraction to finish", 409);
    // Separation of duties: nobody verifies the billing terms they will invoice against.
    if (g.ctx.member?.id === c.member_id) throw new HttpError("Another HR admin must verify your own contract", 403);

    const b = await readJson(req);
    const basis = oneOf(b.basis, BASES, "Basis");
    const cur = parseCurrency(b.currency);
    const feeStr = str(b.fee, "Fee", { max: 30 });
    let feeMinor: number;
    try {
      feeMinor = toMinor(feeStr, cur);
    } catch {
      throw new HttpError("Fee must be a number");
    }
    if (feeMinor <= 0) throw new HttpError("Fee must be more than zero");
    const leave = str(b.paid_leave_days_per_year, "Paid leave days", { optional: true, max: 10 }) ?? "0";
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(leave)) throw new HttpError("Paid leave days must be a number like 12 or 12.5");
    const reimbursables = strArray(b.reimbursables, "Reimbursables", 10);
    for (const r of reimbursables) {
      if (r !== "all" && !(EXPENSE_CATEGORIES as readonly string[]).includes(r)) throw new HttpError(`Unknown reimbursable "${r}"`);
    }
    const tax = jsonObject(b.tax, "Tax");
    const noticeDays = intOrNull(b.notice_days, "Notice days", 0, 3650);
    const effectiveFrom = isoDate(b.effective_from, "Effective from");
    const effectiveTo = isoDate(b.effective_to, "Effective to", true);
    if (effectiveTo && effectiveTo < effectiveFrom) throw new HttpError("Effective to is before effective from");
    const clauseRefs = jsonObject(b.clause_refs, "Clause references");
    if (JSON.stringify(tax).length > 5000) throw new HttpError("Tax details are too long");
    if (JSON.stringify(clauseRefs).length > 5000) throw new HttpError("Clause references are too long");

    const now = new Date().toISOString();
    // Close any open verified terms that started earlier.
    const { error: closeErr } = await g.admin
      .from("nrs_contract_terms")
      .update({ effective_to: addDays(effectiveFrom, -1) })
      .eq("member_id", c.member_id)
      .eq("org_id", g.orgId)
      .is("effective_to", null)
      .lt("effective_from", effectiveFrom)
      .not("verified_at", "is", null);
    dbCheck(closeErr, "Closing previous terms");

    const { data: terms, error } = await g.admin
      .from("nrs_contract_terms")
      .insert({
        org_id: g.orgId,
        contract_id: c.id,
        member_id: c.member_id,
        effective_from: effectiveFrom,
        effective_to: effectiveTo,
        basis,
        fee_minor: feeMinor,
        currency: cur,
        paid_leave_days_per_year: leave,
        reimbursables,
        tax,
        notice_days: noticeDays,
        clause_refs: clauseRefs,
        verified_by: g.user.id,
        verified_at: now,
        is_demo: c.is_demo,
      })
      .select("id")
      .single();
    dbCheck(error, "Saving terms");

    const { error: cErr } = await g.admin
      .from("nrs_contracts")
      .update({ status: "verified", verified_by: g.user.id, verified_at: now })
      .eq("id", c.id);
    dbCheck(cErr, "Verifying contract");
    await g.admin
      .from("nrs_contracts")
      .update({ status: "superseded" })
      .eq("member_id", c.member_id)
      .eq("status", "verified")
      .neq("id", c.id);

    await logAudit(g.admin, {
      orgId: g.orgId,
      actorUser: g.user.id,
      entity: "nrs_contract_terms",
      entityId: (terms as { id: string }).id,
      action: "verify",
      before: { extraction: c.extraction },
      after: { basis, fee_minor: feeMinor, currency: cur, paid_leave_days_per_year: leave, reimbursables, tax, notice_days: noticeDays, effective_from: effectiveFrom, effective_to: effectiveTo, clause_refs: clauseRefs },
      context: { contract_id: c.id },
    });
    return ok({ termsId: (terms as { id: string }).id });
  });
}
