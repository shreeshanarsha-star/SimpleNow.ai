import { ensureDefaultChains } from "@/lib/nrs/approvals";
import { logAudit } from "@/lib/nrs/audit";
import { dbCheck, guard, ok, run } from "@/lib/nrs/invoice/kit";

export const dynamic = "force-dynamic";

export async function GET() {
  return run(async () => {
    const g = await guard(undefined, "hr");
    const { data, error } = await g.admin
      .from("nrs_approval_chains")
      .select("id, kind, effective_from, applies_to, steps")
      .eq("org_id", g.orgId)
      .order("kind")
      .order("effective_from", { ascending: false });
    dbCheck(error, "Approval chains");
    return ok({ chains: data ?? [] });
  });
}

// POST: install the default chain for every kind that has none.
export async function POST() {
  return run(async () => {
    const g = await guard(undefined, "hr");
    const { inserted } = await ensureDefaultChains(g.admin, g.orgId);
    await logAudit(g.admin, { orgId: g.orgId, actorUser: g.user.id, entity: "nrs_approval_chains", action: "install_defaults", after: { inserted } });
    return ok({ inserted });
  });
}
