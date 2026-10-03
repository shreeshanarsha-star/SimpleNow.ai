import { HttpError, guard, ok, readJson, run } from "@/lib/nrs/invoice/kit";
import { isDemoLoaded, loadDemoData, wipeDemoData } from "@/lib/nrs/invoice/demo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  return run(async () => {
    const g = await guard(undefined, "hr");
    return ok({ loaded: await isDemoLoaded(g.admin, g.orgId) });
  });
}

// POST: load supabase/seed/nr_synergy_demo.json into the caller's org.
export async function POST() {
  return run(async () => {
    const g = await guard(undefined, "hr");
    const counts = await loadDemoData(g.admin, g.orgId, g.user.id);
    return ok({ counts }, 201);
  });
}

// DELETE {confirm:"WIPE"}: delete every demo row in the org.
export async function DELETE(req: Request) {
  return run(async () => {
    const g = await guard(undefined, "hr");
    const b = await readJson(req);
    if (b.confirm !== "WIPE") throw new HttpError('Type WIPE to confirm');
    const counts = await wipeDemoData(g.admin, g.orgId, g.user.id);
    return ok({ counts });
  });
}
