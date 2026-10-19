// SimVieo -- shared types for the AI creative plan and the in-browser renderer.
// Safe to import from both server (API routes) and client (renderer/UI).

export type VideoFormat = "9:16" | "1:1" | "16:9";
export type StyleId = "showcase" | "kinetic" | "corporate" | "social";
export type Mood = "energetic" | "uplifting" | "calm" | "corporate";
export type Transition = "fade" | "slide" | "zoom" | "wipe";
export type Motion = "push_in" | "pull_out" | "pan_left" | "pan_right";

export type SceneKind =
  | "hook"
  | "product_hero"
  | "benefits"
  | "stat"
  | "feature"
  | "split"
  | "quote"
  | "logo_sting"
  | "cta";

export interface Scene {
  id: string;
  kind: SceneKind;
  duration: number; // seconds
  headline: string;
  sub?: string;
  bullets?: string[];
  stat?: { value: number; prefix?: string; suffix?: string; label: string };
  imageIndex?: number; // index into the user's product images
  voice: string; // narration / caption line for this scene
  transition: Transition;
  motion: Motion;
}

export interface Palette {
  primary: string;
  secondary: string;
  accent: string;
  bg: string;
  bg2: string;
  text: string;
  textMuted: string;
  onPrimary: string;
}

export interface Plan {
  title: string;
  audience: string;
  purpose: string;
  style: StyleId;
  mood: Mood;
  scenes: Scene[];
  cta: { text: string; url?: string };
  brandName?: string;
  source: "ai" | "template";
  seed: number;
}

export interface BriefInput {
  idea: string;
  content?: string;
  instructions?: string;
  brandName?: string;
  website?: string;
  duration: 15 | 30 | 45 | 60;
  format: VideoFormat;
  style: StyleId | "auto";
  imageCount: number;
  hasLogo: boolean;
}

export const STYLE_LABELS: Record<StyleId, string> = {
  showcase: "Product Showcase",
  kinetic: "Kinetic Typography",
  corporate: "Corporate Explainer",
  social: "Social Ad",
};

export const SCENE_LABELS: Record<SceneKind, string> = {
  hook: "Hook",
  product_hero: "Product hero",
  benefits: "Benefits",
  stat: "Key number",
  feature: "Feature",
  split: "Split view",
  quote: "Promise",
  logo_sting: "Brand",
  cta: "Call to action",
};

export const SCENE_KINDS: SceneKind[] = [
  "hook",
  "product_hero",
  "benefits",
  "stat",
  "feature",
  "split",
  "quote",
  "logo_sting",
  "cta",
];
