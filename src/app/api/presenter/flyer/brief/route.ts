// Presenter.ai — Claude Code on the laptop fetches tonight's brief here
// (Shreesha's preset + the room's 4 inputs). Token-protected.
import { json } from "@/lib/presenter/server";
import { patchHub } from "@/lib/presenter/hub";
import { flyerInstruction } from "@/lib/presenter/flyerBrief";
import { FLYER_PRESETS } from "@/lib/presenter/content";
import { flyerBuildOf, sessionByFlyerToken } from "@/lib/presenter/flyerKit";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await sessionByFlyerToken(req);
  if (!session) return json({ error: "Invalid deploy token" }, 401);
  const fb = flyerBuildOf(session);
  const inputs = fb?.inputs || FLYER_PRESETS[0].inputs;
  await patchHub(session.id, { flyerBuild: { status: "building", startedAt: Date.now(), inputs, provider: "claude-code" } });
  const brief = flyerInstruction(inputs).replace(
    /OUTPUT FORMAT:[\s\S]*$/,
    "OUTPUT: write the complete app as ONE self-contained file named index.html in this folder (inline CSS and JS). Then publish it by running: node deploy.js"
  );
  return json({ brief, inputs, liveUrl: "https://www.simplenow.ai/flyer-ai" });
}
