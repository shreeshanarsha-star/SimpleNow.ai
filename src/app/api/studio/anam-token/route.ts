import { json, mintStudioToken } from "@/lib/presenter/server";
import { canUse, getShow, studioGuard, userPersona } from "@/lib/studio/server";

export const dynamic = "force-dynamic";

// POST { showId } -> a Studio session token for that show's presenter and personality.
export async function POST(req: Request) {
  const g = await studioGuard(req);
  if (g instanceof Response) return g;
  const b = (await req.json().catch(() => ({}))) as { showId?: string };
  const show = b.showId ? await getShow(b.showId) : null;
  if (!show || !canUse(show, g)) return json({ error: "Not found" }, 404);
  const plan = show.plan;
  // The show's chosen avatar; otherwise the avatar the platform owner assigned to this user; otherwise Shree.
  const assigned = await userPersona(show.owner_id);
  const chosen = plan.presenter.kind === "anam" && /^[0-9a-f-]{36}$/i.test(plan.presenter.personaId) ? plan.presenter.personaId : undefined;
  const personaId = chosen || (plan.presenter.kind !== "voice" ? assigned?.personaId : undefined);
  try {
    const t = await mintStudioToken({ personaId, preset: plan?.personality.preset });
    return json(t);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Anam token failed" }, 502);
  }
}
