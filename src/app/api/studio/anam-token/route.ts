import { json, mintStudioToken, ownerGuard } from "@/lib/presenter/server";
import { getShow } from "@/lib/studio/server";

export const dynamic = "force-dynamic";
// Run next to the database (Supabase is in Singapore): live polling must be fast.
export const preferredRegion = "sin1";

// POST { showId } -> a Studio session token for that show's presenter and personality.
export async function POST(req: Request) {
  const g = await ownerGuard();
  if (g instanceof Response) return g;
  const b = (await req.json().catch(() => ({}))) as { showId?: string };
  const show = b.showId ? await getShow(b.showId) : null;
  const plan = show?.plan;
  const personaId = plan?.presenter.kind === "anam" && /^[0-9a-f-]{36}$/i.test(plan.presenter.personaId) ? plan.presenter.personaId : undefined;
  try {
    const t = await mintStudioToken({ personaId, preset: plan?.personality.preset });
    return json(t);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Anam token failed" }, 502);
  }
}
