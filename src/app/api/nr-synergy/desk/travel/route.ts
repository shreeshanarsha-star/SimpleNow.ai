import { ok, run } from "@/lib/nrs/invoice/kit";
import { guardDesk, loadDeskData } from "@/app/tools/nr-synergy/desk/travel/_lib/server";

export const dynamic = "force-dynamic";

// GET /api/nr-synergy/desk/travel
// Travel desk queues for the caller's org: awaiting travel-desk approval,
// approved trips to book, recently booked. Travel desk role or HR only.
export async function GET() {
  return run(async () => {
    const g = await guardDesk();
    const data = await loadDeskData(g.admin, g.orgId, g.memberId);
    return ok({ ...data, access: g.access });
  });
}
