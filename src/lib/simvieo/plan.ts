// SimVieo -- plan normalisation + the zero-cost template planner.
// normalizePlan() is the single gate every plan passes through (AI or not),
// so the renderer can trust its input: valid kinds, durations that add up to
// the chosen length, image indexes that exist, and text short enough to read.

import {
  SCENE_KINDS,
  type BriefInput,
  type Motion,
  type Mood,
  type Plan,
  type Scene,
  type SceneKind,
  type StyleId,
  type Transition,
} from "./types";

const TRANSITIONS: Transition[] = ["fade", "slide", "zoom", "wipe"];
const MOTIONS: Motion[] = ["push_in", "pull_out", "pan_left", "pan_right"];
const STYLES: StyleId[] = ["showcase", "kinetic", "corporate", "social"];
const MOODS: Mood[] = ["energetic", "uplifting", "calm", "corporate"];

// Comfortable narration pace for ads (words per second).
export const WORDS_PER_SECOND = 2.5;
const IMAGE_KINDS: SceneKind[] = ["product_hero", "split", "feature"];

export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function str(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.replace(/\s+/g, " ").trim().slice(0, max);
}

function words(s: string) {
  return s.split(/\s+/).filter(Boolean);
}

export function trimWords(s: string, maxWords: number) {
  const w = words(s);
  if (w.length <= maxWords) return s;
  return w.slice(0, maxWords).join(" ").replace(/[,;:\-–]+$/, "") + ".";
}

function pick<T>(arr: T[], v: unknown, fallback: T): T {
  return arr.includes(v as T) ? (v as T) : fallback;
}

export function sceneId() {
  return Math.random().toString(36).slice(2, 9);
}

// Fit durations so they sum exactly to `total`, keeping each scene readable.
export function fitDurations(scenes: Scene[], total: number) {
  const min = 2;
  const raw = scenes.map((s) => Math.max(min, Number(s.duration) || total / scenes.length));
  const sum = raw.reduce((a, b) => a + b, 0);
  let scaled = raw.map((d) => Math.max(min, (d / sum) * total));
  const s2 = scaled.reduce((a, b) => a + b, 0);
  scaled = scaled.map((d) => (d / s2) * total);
  scenes.forEach((s, i) => (s.duration = Math.round(scaled[i] * 10) / 10));
  const drift = total - scenes.reduce((a, s) => a + s.duration, 0);
  scenes[scenes.length - 1].duration = Math.round((scenes[scenes.length - 1].duration + drift) * 10) / 10;
}

export function normalizeScene(raw: Record<string, unknown>, i: number, imageCount: number, r: () => number): Scene {
  let kind = pick<SceneKind>(SCENE_KINDS, raw.kind, "feature");
  let imageIndex =
    typeof raw.imageIndex === "number" && raw.imageIndex >= 0 && raw.imageIndex < imageCount
      ? Math.floor(raw.imageIndex)
      : undefined;
  if (IMAGE_KINDS.includes(kind) && imageIndex === undefined && imageCount > 0) imageIndex = i % imageCount;
  // An image scene with no images at all degrades to a typographic scene.
  if (imageCount === 0 && (kind === "product_hero" || kind === "split")) kind = "feature";

  const bullets = Array.isArray(raw.bullets)
    ? (raw.bullets as unknown[]).map((b) => str(b, 48)).filter(Boolean).slice(0, 4)
    : undefined;
  let stat: Scene["stat"];
  const rs = raw.stat as Record<string, unknown> | undefined;
  if (rs && typeof rs === "object") {
    const value = Number(rs.value);
    if (Number.isFinite(value)) {
      stat = {
        value,
        prefix: str(rs.prefix, 4) || undefined,
        suffix: str(rs.suffix, 6) || undefined,
        label: str(rs.label, 60) || "",
      };
    }
  }
  if (kind === "stat" && !stat) kind = "feature";
  if (kind === "benefits" && (!bullets || bullets.length < 2)) kind = "feature";

  return {
    id: str(raw.id, 12) || sceneId(),
    kind,
    duration: Number(raw.duration) || 4,
    headline: str(raw.headline, 70) || "",
    sub: str(raw.sub, 110) || undefined,
    bullets,
    stat,
    imageIndex,
    voice: str(raw.voice, 260),
    transition: pick(TRANSITIONS, raw.transition, TRANSITIONS[Math.floor(r() * 4)]),
    motion: pick(MOTIONS, raw.motion, MOTIONS[Math.floor(r() * 4)]),
  };
}

export function enforceReadability(s: Scene) {
  // Narration must fit the scene; headline kept punchy.
  const maxVoiceWords = Math.max(3, Math.floor(s.duration * WORDS_PER_SECOND * 0.85));
  s.voice = trimWords(s.voice || s.headline, maxVoiceWords);
  s.headline = trimWords(s.headline, s.kind === "hook" || s.kind === "cta" ? 8 : 9);
  if (s.sub) s.sub = trimWords(s.sub, 16);
  if (s.bullets) s.bullets = s.bullets.map((b) => trimWords(b, 6));
}

export function normalizePlan(raw: unknown, brief: BriefInput, source: Plan["source"], seed: number): Plan {
  const r = rng(seed);
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rawScenes = Array.isArray(o.scenes) ? (o.scenes as Record<string, unknown>[]) : [];
  let scenes = rawScenes.slice(0, 14).map((s, i) => normalizeScene(s || {}, i, brief.imageCount, r));
  scenes = scenes.filter((s) => s.headline || s.kind === "logo_sting");
  if (scenes.length < 2) return templatePlan(brief, seed);

  // Structural guarantees: open with a hook, close with a CTA.
  if (scenes[0].kind !== "hook") scenes[0].kind = scenes[0].kind === "cta" ? "hook" : scenes[0].kind;
  if (scenes[scenes.length - 1].kind !== "cta") {
    scenes.push(
      normalizeScene(
        { kind: "cta", headline: str((o.cta as Record<string, unknown>)?.text, 60) || "Get started today", duration: 4 },
        scenes.length,
        brief.imageCount,
        r
      )
    );
  }
  fitDurations(scenes, brief.duration);
  scenes.forEach(enforceReadability);

  const ctaRaw = (o.cta || {}) as Record<string, unknown>;
  const style: StyleId = brief.style !== "auto" ? brief.style : pick(STYLES, o.style, "showcase");
  return {
    title: str(o.title, 80) || brief.brandName || "Marketing video",
    audience: str(o.audience, 140),
    purpose: str(o.purpose, 140),
    style,
    mood: pick(MOODS, o.mood, style === "corporate" ? "corporate" : "uplifting"),
    scenes,
    cta: {
      text: str(ctaRaw.text, 40) || scenes[scenes.length - 1].headline || "Learn more",
      url: brief.website || str(ctaRaw.url, 80) || undefined,
    },
    brandName: brief.brandName,
    source,
    seed,
  };
}

// ---------------------------------------------------------------------------
// Template planner -- deterministic, free, used when AI is unavailable.

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+|\n|•|- /)
    .map((s) => s.trim().replace(/[.!?]+$/, ""))
    .filter((s) => s.length > 3);
}

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function findStat(text: string): Scene["stat"] | undefined {
  const m = text.match(/(₹|\$|€|£)?\s?(\d+(?:[.,]\d+)?)\s?(%|x|\+|k|K|M|hrs?|days?|mins?)?\s+([a-zA-Z][^.,;!?]{3,40})/);
  if (!m) return undefined;
  const value = parseFloat(m[2].replace(",", ""));
  if (!Number.isFinite(value)) return undefined;
  return { value, prefix: m[1] || undefined, suffix: m[3] || undefined, label: m[4].trim() };
}

export function templatePlan(brief: BriefInput, seed: number): Plan {
  const r = rng(seed);
  const all = sentences(`${brief.idea}. ${brief.content || ""}`);
  const name = brief.brandName || "";
  const pool = all.length ? all : [brief.idea || "Something worth seeing"];
  const take = (i: number) => titleCase(pool[i % pool.length]);
  const stat = findStat(`${brief.idea} ${brief.content || ""}`);
  const imgs = brief.imageCount;

  const hookOptions = [
    `Meet ${name || "something new"}`,
    take(0),
    `Still settling for less?`,
    `Ready for better?`,
  ];
  const hook = trimWords(hookOptions[Math.floor(r() * hookOptions.length)], 7);

  const benefits = pool.slice(1, 5).map((s) => trimWords(titleCase(s), 5));
  const sc: Record<string, unknown>[] = [];
  sc.push({ kind: "hook", headline: hook, voice: take(0), duration: 3 });
  if (imgs > 0) sc.push({ kind: "product_hero", headline: name || take(0), sub: take(1), imageIndex: 0, voice: take(1), duration: 4 });
  if (brief.duration >= 30 && benefits.length >= 2)
    sc.push({ kind: "benefits", headline: "Why you'll love it", bullets: benefits.slice(0, 3), voice: benefits.slice(0, 3).join(". "), duration: 5 });
  if (brief.duration >= 30 && stat)
    sc.push({ kind: "stat", headline: stat.label, stat, voice: `${stat.prefix || ""}${stat.value}${stat.suffix || ""} ${stat.label}`, duration: 4 });
  if (brief.duration >= 30)
    sc.push({ kind: imgs > 1 ? "split" : "feature", headline: take(2), sub: take(3), imageIndex: imgs > 1 ? 1 : undefined, voice: take(2), duration: 4 });
  if (brief.duration >= 45) {
    sc.push({ kind: "feature", headline: take(4), sub: take(5), imageIndex: imgs > 2 ? 2 : undefined, voice: take(4), duration: 4 });
    sc.push({ kind: "quote", headline: take(5), voice: take(5), duration: 4 });
  }
  if (brief.duration >= 60) {
    sc.push({ kind: imgs > 0 ? "product_hero" : "feature", headline: take(6), sub: take(7), imageIndex: imgs > 0 ? imgs - 1 : undefined, voice: take(6), duration: 5 });
  }
  if (brief.hasLogo || name) sc.push({ kind: "logo_sting", headline: name, voice: name ? `${name}.` : "", duration: 2.5 });
  const ctaText = brief.website ? "Visit us today" : "Get yours today";
  sc.push({ kind: "cta", headline: ctaText, sub: brief.website || undefined, voice: `${ctaText}${brief.website ? " at " + brief.website : ""}.`, duration: 4 });

  const plan = normalizePlan(
    {
      title: name || "Marketing video",
      style: brief.style === "auto" ? (imgs > 0 ? "showcase" : "kinetic") : brief.style,
      mood: "uplifting",
      scenes: sc,
      cta: { text: ctaText, url: brief.website },
    },
    { ...brief },
    "template",
    seed
  );
  plan.source = "template";
  return plan;
}
