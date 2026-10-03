import { HttpError, dbCheck, guard, ok, run, signedUrlInOrg, uuid } from "@/lib/nrs/invoice/kit";

export const dynamic = "force-dynamic";

// GET: short-lived signed URL for an expense receipt. Visibility is checked
// with the caller's own client (RLS: self, manager, HR, finance), scoped to
// the caller's org, and the object must live under the org's folder.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return run(async () => {
    const g = await guard("money");
    const { id } = await params;
    const { data, error } = await g.supabase
      .from("nrs_expenses")
      .select("receipt_path")
      .eq("id", uuid(id, "Expense"))
      .eq("org_id", g.orgId)
      .is("deleted_at", null)
      .maybeSingle();
    dbCheck(error, "Expense");
    const path = (data as { receipt_path: string | null } | null)?.receipt_path;
    if (!path) throw new HttpError("No receipt on this expense", 404);
    return ok({ url: await signedUrlInOrg(g.admin, g.orgId, path) });
  });
}
