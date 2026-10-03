import { HttpError, guard, ok, run, uuid } from "@/lib/nrs/invoice/kit";
import { loadContract, runExtraction, toContractDto } from "@/lib/nrs/invoice/contractServer";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST: re-run AI extraction on a stored contract (HR only).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return run(async () => {
    const g = await guard(undefined, "hr");
    const { id } = await params;
    const c = await loadContract(g.admin, g.orgId, uuid(id, "Contract"));
    if (c.status === "verified" || c.status === "superseded") throw new HttpError("This contract is already verified", 409);
    if (c.status === "extracting") throw new HttpError("Extraction is already running", 409);
    const updated = await runExtraction(g.admin, c, g.user.id);
    const { data: m } = await g.admin.from("nrs_members").select("full_name").eq("id", c.member_id).maybeSingle();
    return ok({ contract: toContractDto(updated, (m as { full_name: string } | null)?.full_name ?? "") });
  });
}
