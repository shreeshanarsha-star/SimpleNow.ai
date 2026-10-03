import { createRequest } from "@/lib/nrs/approvals";
import { emailRequesterOutcome } from "@/app/api/nr-synergy/invoices/_decisionEmail";
import { logAudit } from "@/lib/nrs/audit";
import { formatMoney } from "@/lib/nrs/money";
import { HttpError, dbCheck, guardMember, ok, readJson, run, uuid } from "@/lib/nrs/invoice/kit";
import { EXPENSE_COLUMNS, toExpenseDto, type ExpenseRow } from "@/lib/nrs/invoice/moneyServer";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function loadOwn(g: Awaited<ReturnType<typeof guardMember>>, id: string): Promise<ExpenseRow> {
  const { data, error } = await g.admin
    .from("nrs_expenses")
    .select(EXPENSE_COLUMNS)
    .eq("id", uuid(id, "Expense"))
    .eq("member_id", g.member.id)
    .is("deleted_at", null)
    .maybeSingle();
  dbCheck(error, "Expense");
  if (!data) throw new HttpError("Expense not found", 404);
  return data as ExpenseRow;
}

// PATCH {action:"submit"}: submit a draft or re-submit a sent-back expense.
export async function PATCH(req: Request, { params }: Params) {
  return run(async () => {
    const g = await guardMember("money");
    const { id } = await params;
    const body = await readJson(req);
    if (body.action !== "submit") throw new HttpError("Unknown action");
    const row = await loadOwn(g, id);
    if (row.status !== "draft" && row.status !== "sent_back") {
      throw new HttpError(`This expense is already ${row.status.replace("_", " ")}`, 409);
    }
    const amount = Number(row.amount_minor);
    const submitted = await createRequest(
      "expense",
      row.id,
      g.member.id,
      `Expense: ${row.description.slice(0, 80)} (${formatMoney(amount, row.currency)})`,
      amount,
      row.currency,
      { admin: g.admin, createdBy: g.user.id, summary: row.over_limit ? "Over the category limit" : null }
    );
    if (submitted.status === "approved") await emailRequesterOutcome(g.admin, submitted.requestId);
    const fresh = await loadOwn(g, id);
    return ok({ expense: toExpenseDto(fresh) });
  });
}

// DELETE: remove a draft / sent-back / rejected expense (soft delete).
export async function DELETE(_req: Request, { params }: Params) {
  return run(async () => {
    const g = await guardMember("money");
    const { id } = await params;
    const row = await loadOwn(g, id);
    if (!["draft", "sent_back", "rejected"].includes(row.status)) {
      throw new HttpError("Only draft, sent-back or rejected expenses can be deleted", 409);
    }
    const { error } = await g.admin.from("nrs_expenses").update({ deleted_at: new Date().toISOString() }).eq("id", row.id);
    dbCheck(error, "Deleting expense");
    await logAudit(g.admin, {
      orgId: g.orgId,
      actorUser: g.user.id,
      entity: "nrs_expenses",
      entityId: row.id,
      action: "delete",
      before: { status: row.status, amount_minor: Number(row.amount_minor), currency: row.currency },
    });
    return ok({ ok: true });
  });
}
