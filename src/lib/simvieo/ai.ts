// SimVieo -- server-only AI creative director (OpenAI gpt-4o-mini, JSON mode).
// One call produces the whole plan. Images are sent as small low-detail
// copies so the model can see the product (≈₹0.03 per image).
import { getModel } from "@/lib/aiClient";
import type { BriefInput, Plan, Scene } from "./types";

const TIMEOUT_MS = 40_000;

// gpt-4o-mini list price (USD per 1M tokens) and a conservative FX rate.
const USD_INR = 90;
const IN_PER_M = 0.15;
const OUT_PER_M = 0.6;

export interface AiResult {
  json: unknown;
  costInr: number;
}

async function chatJson(messages: unknown[], maxTokens: number): Promise<AiResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("no_key");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.SIMVIEO_MODEL || getModel(),
        max_tokens: maxTokens,
        temperature: 0.9,
        response_format: { type: "json_object" },
        messages,
      }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error?.message || `OpenAI error ${res.status}`);
    const text: string = data?.choices?.[0]?.message?.content || "";
    const usage = data?.usage || {};
    const costInr =
      (((usage.prompt_tokens || 0) * IN_PER_M + (usage.completion_tokens || 0) * OUT_PER_M) / 1_000_000) * USD_INR;
    return { json: JSON.parse(text), costInr };
  } finally {
    clearTimeout(timer);
  }
}

const SCENE_GUIDE = `Scene kinds (use what fits; each needs "headline"):
- hook: 3-7 word pattern-interrupt opener (question, bold claim, or tension). Always scene 1.
- product_hero: hero shot of a product image; "imageIndex" required; optional "sub".
- benefits: "bullets" array of 2-4 items, each max 5 words.
- stat: "stat": {"value": number, "prefix": "₹/$/"", "suffix": "%/x/+/"", "label": "..."} -- ONLY with numbers the user actually gave. Never invent figures.
- feature: one feature or idea, "headline" + "sub"; optional "imageIndex".
- split: image on one side, text on the other; "imageIndex" required.
- quote: a short promise / brand line (no fake testimonials, no invented people).
- logo_sting: brand moment with the logo; headline = brand name.
- cta: final call to action; headline 2-5 words; "sub" = website or offer.`;

function briefText(b: BriefInput, content: string) {
  return [
    `Idea / product: ${b.idea}`,
    b.brandName ? `Brand name: ${b.brandName}` : "",
    b.website ? `Website / CTA link: ${b.website}` : "",
    content ? `Supporting content:\n${content}` : "",
    b.instructions ? `User instructions (follow these): ${b.instructions}` : "",
    `Video length: ${b.duration} seconds. Format: ${b.format}.`,
    `Style: ${b.style === "auto" ? "choose the best of showcase | kinetic | corporate | social" : b.style}.`,
    `Product images provided: ${b.imageCount} (imageIndex 0..${Math.max(0, b.imageCount - 1)}).${b.imageCount ? "" : " No images: use typographic scenes only (no product_hero/split)."}`,
    `Logo provided: ${b.hasLogo ? "yes" : "no"}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

const SYSTEM = `You are SimVieo, an award-winning creative director and copywriter for short marketing videos.
Design a video that feels like a premium agency ad, not a slideshow.
Rules:
- Identify the audience and the single most persuasive angle.
- Strong hook in the first 2 seconds. Benefits in a logical, escalating order. End with a clear CTA.
- Pace: 15s ≈ 4-5 scenes, 30s ≈ 6-8, 45s ≈ 8-10, 60s ≈ 10-12. Durations in seconds must add up to the video length. Hook 2-3s, logo_sting 2-3s, CTA 3-5s.
- Vary scene kinds and visual rhythm; spread different imageIndex values across scenes.
- On-screen text is short and punchy. Headlines max 7 words.
- "voice" = narration line for that scene, natural spoken English, about 2 words per second of scene duration (fewer is fine; leave breathing room).
- Use only facts present in the brief or visible in the images. Never invent prices, numbers, awards, certifications, testimonials or health claims.
- Choose "transition" (fade|slide|zoom|wipe) and "motion" (push_in|pull_out|pan_left|pan_right) per scene for variety.
Return JSON only:
{"title":"","audience":"","purpose":"","style":"showcase|kinetic|corporate|social","mood":"energetic|uplifting|calm|corporate","cta":{"text":"","url":""},"scenes":[{"kind":"","duration":0,"headline":"","sub":"","bullets":[],"stat":null,"imageIndex":0,"voice":"","transition":"","motion":""}]}
${SCENE_GUIDE}`;

export async function aiPlan(
  brief: BriefInput,
  content: string,
  images: string[],
  variationNote?: string
): Promise<AiResult> {
  const userContent: unknown[] = [
    {
      type: "text",
      text:
        briefText(brief, content) +
        (variationNote ? `\n\nVARIATION REQUEST: ${variationNote}` : "") +
        (images.length ? "\n\nThe product images follow in order (index 0 first). Look at them to understand the product." : ""),
    },
    ...images.map((url) => ({ type: "image_url", image_url: { url, detail: "low" } })),
  ];
  return chatJson(
    [
      { role: "system", content: SYSTEM },
      { role: "user", content: userContent },
    ],
    2000
  );
}

export async function aiScene(plan: Plan, index: number, brief: BriefInput): Promise<AiResult> {
  const s: Scene = plan.scenes[index];
  const context = plan.scenes
    .map((x, i) => `${i + 1}. [${x.kind}] ${x.headline}${i === index ? "   <-- REWRITE THIS ONE" : ""}`)
    .join("\n");
  return chatJson(
    [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `${briefText(brief, "")}\n\nCurrent storyboard:\n${context}\n\nRewrite scene ${index + 1} with a fresh, stronger creative angle that still fits between its neighbours. Keep duration ${s.duration}s. You may change its kind (not to hook/cta unless it is the first/last scene). Return JSON: {"scene": {...one scene object...}}`,
      },
    ],
    500
  );
}
