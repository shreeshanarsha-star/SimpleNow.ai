import { createRequest } from "@/lib/nrs/approvals";
import { emailRequesterOutcome } from "@/app/api/nr-synergy/invoices/_decisionEmail";
import { logAudit } from "@/lib/nrs/audit";
import { formatMoney, convertMinor, toMinor } from "@/lib/nrs/money";
import { lookupFxRate, reportingCurrency } from "@/lib/nrs/invoice/fx";
import {
  HttpError,
  currency as parseCurrency,
  dbCheck,
  fileExt,
  guardMember,
  isoDate,
  ok,
  oneOf,
  run,
  str,
  uploadPrivate,
} from "@/lib/nrs/invoice/kit";
import { EXPENSE_COLUMNS, isOverLimit, toExpenseDto, type ExpenseRow } from "@/lib/nrs/invoice/moneyServer";
import { EXPENSE_CATEGORIES } from "@/lib/nrs/invoice/types";

export const dynamic = "force-dynamic";

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

// GET: the caller's expenses, newest first.
export async function GET() {
  return run(async () => {
    const g = await guardMember("money");
    const { data, error } = await g.admin
      .from("nrs_expenses")
      .select(EXPENSE_COLUMNS)
      .eq("member_id", g.member.id)
      .is("deleted_at", null)
      .order("spent_on", { ascending: false })
      .limit(200);
    dbCheck(error, "Expenses");
    return ok({ expenses: ((data ?? []) as ExpenseRow[]).map(toExpenseDto) });
  });
}

// POST (multipart): create an expense, optionally with a receipt, and
// submit it for approval when submit=1.
export async function POST(req: Request) {
  return run(async () => {
    const g = await guardMember("money");
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new HttpError("Expected a form upload");
    }
    const spentOn = isoDate(form.get("spent_on"), "Date");
    if (spentOn > new Date().toISOString().slice(0, 10)) throw new HttpError("The date can't be in the future");
    const category = oneOf(form.get("category"), EXPENSE_CATEGORIES, "Category");
    const description = str(form.get("description"), "Description", { max: 500 });
    const cur = parseCurrency(form.get("currency"));
    const amountRaw = str(form.get("amount"), "Amount", { max: 30 });
    let amountMinor: number;
    try {
      amountMinor = toMinor(amountRaw, cur);
    } catch {
      throw new HttpError("Amount must be a number");
    }
    if (amountMinor <= 0) throw new HttpError("Amount must be more than zero");
    const submit = form.get("submit") === "1";

    const receipt = form.get("receipt");
    let receiptFile: File | null = null;
    if (receipt instanceof File && receipt.size > 0) {
      if (receipt.size > MAX_RECEIPT_BYTES) throw new HttpError("The receipt must be 10 MB or smaller");
      if (!fileExt(receipt)) throw new HttpError("Receipts must be a PDF or an image (JPG, PNG, WEBP, HEIC)");
      receiptFile = receipt;
    }

    const id = crypto.randomUUID();
    let receiptPath: string | null = null;
    if (receiptFile) {
      receiptPath = `${g.orgId}/receipts/${g.member.id}/${crypto.randomUUID()}.${fileExt(receiptFile)}`;
      await uploadPrivate(g.admin, receiptPath, receiptFile, receiptFile.type);
    }

    // Lock the FX rate to the reporting currency (latest on/before the spend date).
    const rc = await reportingCurrency(g.admin, g.orgId);
    const fx = await lookupFxRate(g.admin, cur, rc, spentOn);
    const reportingMinor = fx ? convertMinor(amountMinor, fx.rate, cur, rc) : null;
    const overLimit = await isOverLimit(g.admin, g.orgId, g.member.home_country, spentOn, category, amountMinor, cur);

    const { data, error } = await g.admin
      .from("nrs_expenses")
      .insert({
        id,
        org_id: g.orgId,
        member_id: g.member.id,
        spent_on: spentOn,
        category,
        description,
        amount_minor: amountMinor,
        currency: cur,
        fx_rate: fx?.rate ?? null,
        reporting_amount_minor: reportingMinor,
        receipt_path: receiptPath,
        over_limit: overLimit,
        status: "draft",
      })
      .select(EXPENSE_COLUMNS)
      .single();
    if (error && receiptPath) await g.admin.storage.from("nrs-private").remove([receiptPath]);
    dbCheck(error, "Saving expense");
    let row = data as ExpenseRow;

    await logAudit(g.admin, {
      orgId: g.orgId,
      actorUser: g.user.id,
      entity: "nrs_expenses",
      entityId: id,
      action: "create",
      after: { amount_minor: amountMinor, currency: cur, category, over_limit: overLimit, fx_rate: fx?.rate ?? null },
    });

    if (submit) {
      const submitted = await createRequest(
        "expense",
        id,
        g.member.id,
        `Expense: ${description.slice(0, 80)} (${formatMoney(amountMinor, cur)})`,
        amountMinor,
        cur,
        { admin: g.admin, createdBy: g.user.id, summary: overLimit ? "Over the category limit" : null }
      );
      if (submitted.status === "approved") await emailRequesterOutcome(g.admin, submitted.requestId);
      const { data: fresh } = await g.admin.from("nrs_expenses").select(EXPENSE_COLUMNS).eq("id", id).single();
      if (fresh) row = fresh as ExpenseRow;
    }
    return ok({ expense: toExpenseDto(row) }, 201);
  });
}
