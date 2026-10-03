import { NextResponse } from "next/server";
import { requireNrs } from "@/lib/nrs/member";
import { loadDirectory } from "@/app/tools/nr-synergy/people/_lib/data";

// GET /api/nr-synergy/people: the org directory (active members) + countries.
export async function GET() {
  let g: Awaited<ReturnType<typeof requireNrs>>;
  try {
    g = await requireNrs("people");
  } catch (res) {
    return res as Response;
  }
  const { ctx, supabase } = g;
  if (!ctx.orgId) return NextResponse.json({ people: [], countries: [] });
  try {
    return NextResponse.json(await loadDirectory(supabase, ctx.orgId));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not load the directory." }, { status: 500 });
  }
}
