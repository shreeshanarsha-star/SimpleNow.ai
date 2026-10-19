import { NextResponse } from "next/server";
import { aiPlan } from "@/lib/simvieo/ai";
import { normalizePlan, templatePlan } from "@/lib/simvieo/plan";
import { optionalUserId, parseBrief, parseImages } from "@/lib/simvieo/request";
import { callerKey, checkUsage, limitMessage, recordUsage } from "@/lib/simvieo/usage";

export const maxDuration = 60;

// POST /api/simvieo/plan -- the AI creative director. Always returns a usable
// plan: if AI is unavailable, over budget, or fails, the free template planner
// answers instead (and says so via plan.source = "template").
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseBrief(body);
  if (!parsed) return NextResponse.json({ error: "Tell SimVieo what you're promoting first." }, { status: 400 });
  const { brief, content } = parsed;
  const images = parseImages(body.images);
  brief.imageCount = Math.max(brief.imageCount, images.length);
  const seed = Math.floor(Math.random() * 1e9);
  const variation = typeof body.variation === "string" ? body.variation.slice(0, 200) : undefined;

  const ipHash = callerKey(request);
  const usage = await checkUsage(ipHash, "plan");
  if (!usage.allowed) {
    return NextResponse.json({
      plan: templatePlan(brief, seed),
      notice: limitMessage("plan") + " This version was built with SimVieo's free template planner.",
    });
  }

  if (usage.overBudget || !process.env.OPENAI_API_KEY) {
    return NextResponse.json({
      plan: templatePlan(brief, seed),
      notice: "AI planning is resting for today, so SimVieo used its free template planner.",
    });
  }

  const userId = await optionalUserId();
  try {
    const { json, costInr } = await aiPlan(brief, content, images, variation);
    const plan = normalizePlan(json, brief, "ai", seed);
    await recordUsage(ipHash, userId, "plan", costInr, plan.source);
    return NextResponse.json({ plan, costInr });
  } catch (err) {
    console.error("simvieo plan failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({
      plan: templatePlan(brief, seed),
      notice: "The AI director didn't respond in time, so SimVieo used its template planner. Try 'New variation' for an AI version.",
    });
  }
}
