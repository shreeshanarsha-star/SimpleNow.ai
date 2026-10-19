import { NextResponse } from "next/server";
import { aiScene } from "@/lib/simvieo/ai";
import { enforceReadability, normalizeScene, rng } from "@/lib/simvieo/plan";
import { optionalUserId, parseBrief } from "@/lib/simvieo/request";
import { callerKey, checkUsage, limitMessage, recordUsage } from "@/lib/simvieo/usage";
import type { Plan } from "@/lib/simvieo/types";

export const maxDuration = 30;

// POST /api/simvieo/scene -- rewrite one scene with a fresh angle.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseBrief(body);
  const plan = body.plan as Plan | undefined;
  const index = Number(body.index);
  if (!parsed || !plan || !Array.isArray(plan.scenes) || !(index >= 0 && index < plan.scenes.length)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const ipHash = callerKey(request);
  const usage = await checkUsage(ipHash, "scene");
  if (!usage.allowed) return NextResponse.json({ error: limitMessage("scene") }, { status: 429 });
  if (usage.overBudget || !process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "AI rewrites are resting for today. You can still edit the text directly." }, { status: 503 });
  }
  try {
    const { json, costInr } = await aiScene(plan, index, parsed.brief);
    const raw = ((json as Record<string, unknown>)?.scene || json) as Record<string, unknown>;
    const old = plan.scenes[index];
    const scene = normalizeScene({ ...raw, duration: old.duration }, index, parsed.brief.imageCount, rng(Date.now()));
    scene.duration = old.duration;
    // Keep the story's frame: first stays a hook, last stays the CTA.
    if (index === 0) scene.kind = "hook";
    if (index === plan.scenes.length - 1) scene.kind = "cta";
    enforceReadability(scene);
    await recordUsage(ipHash, await optionalUserId(), "scene", costInr, "ai");
    return NextResponse.json({ scene });
  } catch (err) {
    console.error("simvieo scene failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't rewrite that scene right now. Try again in a moment." }, { status: 502 });
  }
}
