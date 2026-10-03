import { dbCheck, guard, ok, run, signedUrlInOrg, uuid } from "@/lib/nrs/invoice/kit";
import { loadContract, toContractDto } from "@/lib/nrs/invoice/contractServer";
import type { ContractTermsDto } from "@/lib/nrs/invoice/types";

export const dynamic = "force-dynamic";

// GET: one contract with a signed file URL and the member's verified terms history (HR only).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return run(async () => {
    const g = await guard(undefined, "hr");
    const { id } = await params;
    const c = await loadContract(g.admin, g.orgId, uuid(id, "Contract"));
    const [{ data: m }, termsRes] = await Promise.all([
      g.admin.from("nrs_members").select("full_name").eq("id", c.member_id).maybeSingle(),
      g.admin
        .from("nrs_contract_terms")
        .select(
          "id, contract_id, member_id, effective_from, effective_to, basis, fee_minor, currency, paid_leave_days_per_year, reimbursables, tax, notice_days, clause_refs, verified_at"
        )
        .eq("member_id", c.member_id)
        .eq("org_id", g.orgId)
        .order("effective_from", { ascending: false }),
    ]);
    dbCheck(termsRes.error, "Contract terms");
    const terms = ((termsRes.data ?? []) as ContractTermsDto[]).map((t) => ({
      ...t,
      fee_minor: Number(t.fee_minor),
      paid_leave_days_per_year: String(t.paid_leave_days_per_year),
    }));
    return ok({
      contract: toContractDto(c, (m as { full_name: string } | null)?.full_name ?? ""),
      fileUrl: c.file_path ? await signedUrlInOrg(g.admin, g.orgId, c.file_path) : null,
      terms,
    });
  });
}
