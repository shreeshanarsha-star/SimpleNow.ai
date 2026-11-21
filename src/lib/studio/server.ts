// Presenter Studio — server-only helpers (DB access, AI calls, versioned live commands).
import Anthropic from "@anthropic-ai/sdk";
import { callTextModel, hasAiKey } from "@/lib/aiClient";
import { db } from "@/lib/presenter/server";
import { buildRunOfShow, reduce } from "./engine";
import { emptyLive, normalizePlan, type Action, type Live, type Plan } from "./types";

export { db, json, ownerGuard } from "@/lib/presenter/server";

export type ShowRow = {
  id: string;
  owner_id: string;
  title: string;
  event_date: string | null;
  status: string;
  code: string | null;
  plan: Plan;
  live: Live;
  legacy_session_id: string | null;
  created_at: string;
  updated_at: string;
};

export function asShow(r: Record<string, unknown>): ShowRow {
  const live = { ...emptyLive(), ...((r.live as Partial<Live>) || {}) };
  return { ...(r as unknown as ShowRow), plan: normalizePlan(r.plan as Partial<Plan>), live };
}

export async function getShow(id: string) {
  const { data } = await db().from("presenter_shows").select("*").eq("id", id).maybeSingle();
  return data ? asShow(data) : null;
}

export async function getShowByCode(code: string) {
  const { data } = await db().from("presenter_shows").select("*").eq("code", code.toUpperCase()).maybeSingle();
  return data ? asShow(data) : null;
}

export function newJoinCode() {
  // No 0/O/1/I/6/8/B confusion (19 Nov: "6" looked like "8").
  const alphabet = "ACDEFGHJKLMNPQRTUVWXY2345679";
  let s = "";
  for (let i = 0; i < 5; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

/**
 * Apply a command only if the caller saw the latest version (compare-and-set),
 * so two quick taps or two devices can never double-advance the show.
 */
export async function applyCommand(id: string, action: Action, seenV: number | null) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const show = await getShow(id);
    if (!show) return { error: "Not found", status: 404 as const };
    if (seenV !== null && seenV !== show.live.v) return { error: "stale", status: 409 as const, live: show.live };
    const steps = buildRunOfShow(show.plan);
    const next = reduce(show.live, action, steps.length, Date.now());
    if (next === show.live) return { live: show.live, status: 200 as const };
    const patch: Record<string, unknown> = { live: next, updated_at: new Date().toISOString() };
    if (next.started && show.status !== "live" && !next.ended) patch.status = "live";
    if (next.ended) patch.status = "done";
    const { data } = await db()
      .from("presenter_shows")
      .update(patch)
      .eq("id", id)
      .eq("live->>v", String(show.live.v))
      .select("live")
      .maybeSingle();
    if (data) return { live: { ...emptyLive(), ...(data.live as Live) }, status: 200 as const };
    if (seenV !== null) {
      const fresh = await getShow(id);
      return { error: "stale", status: 409 as const, live: fresh?.live };
    }
  }
  return { error: "Busy, try again", status: 409 as const };
}

/* ---------------------------------- AI ----------------------------------- */

export async function studioAI(prompt: string, maxTokens = 1500, timeoutMs = 50_000): Promise<string> {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const client = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
        timeout: timeoutMs,
        maxRetries: 0,
        defaultHeaders: process.env.ANTHROPIC_WORKSPACE_ID ? { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID } : undefined,
      });
      const msg = await client.messages.create({
        model: process.env.PRESENTER_MODEL || "claude-sonnet-4-5",
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      });
      const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
      if (text) return text;
    } catch (err) {
      console.error("[studio] Claude failed, falling back:", err instanceof Error ? err.message : err);
    }
  }
  if (!hasAiKey()) throw new Error("No AI key is configured on the server.");
  return callTextModel(prompt, maxTokens, timeoutMs, process.env.PRESENTER_FALLBACK_MODEL || "gpt-4o");
}

/** Pull the first JSON object/array out of a model reply. */
export function parseJSON<T>(text: string): T {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (m ? m[1] : text).trim();
  const start = body.search(/[[{]/);
  const end = Math.max(body.lastIndexOf("}"), body.lastIndexOf("]"));
  return JSON.parse(start >= 0 && end > start ? body.slice(start, end + 1) : body) as T;
}

/** Shared context for every script prompt: purpose, personality and rules. */
export function briefing(plan: Plan) {
  const p = plan.purpose;
  const preset = { warm: "Warm, respectful, kind, encouraging, light gentle humour, simple words.", formal: "Polished, concise, confident, professional, no jokes.", energetic: "Upbeat, lively, enthusiastic, short punchy sentences.", calm: "Calm, thoughtful, precise, reassuring." }[plan.personality.preset];
  const lines = [
    `PRESENTER: ${plan.presenter.name || "the presenter"}, an AI co-presenter shown as a talking avatar on a screen, speaking out loud to a live room.`,
    `SESSION: ${p.intent}. Purpose: ${p.purpose || "(not given)"}. Audience: ${p.audience || "(not given)"}. Length: about ${p.minutes} minutes. Time of day: ${p.timeOfDay} (never say a greeting for another time of day; say "today").`,
    `ULTIMATE MESSAGE (weave in naturally where it fits, never forced): ${p.message || "(not given)"}`,
    p.outcome ? `DESIRED OUTCOME (what people should do after): ${p.outcome}` : "",
    `STYLE: ${preset}`,
    plan.personality.rules ? `RULES FROM THE PRESENTER: ${plan.personality.rules}` : "",
    plan.personality.mustSay ? `MUST SAY (somewhere appropriate, in your own words): ${plan.personality.mustSay}` : "",
    plan.personality.avoid ? `NEVER USE these words or topics: ${plan.personality.avoid}` : "",
    `HOW YOU SPEAK: You are a live avatar: your face, voice and expressions are generated from your words, so let your words carry the emotion and never describe your own actions or expressions. Use contractions and vary sentence length, short and longer. Now and then (not every sentence) a natural "..." pause or a "so..." is fine, but never inside facts, numbers or names, and never "um" or "erm" in scripted slides.`,
    `EMOTION CUES: You may put an inline cue tag directly before a sentence to guide your delivery, using ONLY these: [happy] [warm] [playful] [curious] [supportive] [concerned] [surprised]. Use them sparingly: at most one or two per slide, none on most sentences. For example [curious] before a question or a poll, [warm] for thanks and the close, [happy] for good news. Never invent other tags and never put anything else in square brackets.`,
    `HARD RULES: Speak for the ear: short spoken sentences, no lists, no markdown, no emojis, no stage directions. Facts and numbers ONLY from the slide text and notes given; never invent facts, names, numbers or examples about real companies. Never ask the audience to do anything physical (hands up, stand, clap). Do not ask the audience questions while presenting slides. Do not name people from the audience. Mention a poll only where you are told there is one.`,
  ];
  return lines.filter(Boolean).join("\n");
}
