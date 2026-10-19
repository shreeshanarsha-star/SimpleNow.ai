// SimVieo -- server-only request parsing shared by the API routes.
import { createClient } from "@/lib/supabase/server";
import type { BriefInput, StyleId, VideoFormat } from "./types";

export async function optionalUserId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

const FORMATS: VideoFormat[] = ["9:16", "1:1", "16:9"];
const STYLES: (StyleId | "auto")[] = ["auto", "showcase", "kinetic", "corporate", "social"];

function s(v: unknown, max: number) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function parseBrief(body: Record<string, unknown>): { brief: BriefInput; content: string } | null {
  const b = (body.brief || {}) as Record<string, unknown>;
  const idea = s(b.idea, 600);
  if (!idea) return null;
  const duration = [15, 30, 45, 60].includes(Number(b.duration)) ? (Number(b.duration) as BriefInput["duration"]) : 30;
  const format = FORMATS.includes(b.format as VideoFormat) ? (b.format as VideoFormat) : "9:16";
  const style = STYLES.includes(b.style as StyleId) ? (b.style as StyleId | "auto") : "auto";
  const imageCount = Math.max(0, Math.min(6, Number(b.imageCount) || 0));
  return {
    brief: {
      idea,
      content: s(b.content, 3000) || undefined,
      instructions: s(b.instructions, 400) || undefined,
      brandName: s(b.brandName, 60) || undefined,
      website: s(b.website, 100) || undefined,
      duration,
      format,
      style,
      imageCount,
      hasLogo: !!b.hasLogo,
    },
    content: s(b.content, 3000),
  };
}

// Only small JPEG/PNG/WebP data URLs (the client downsizes to ~512px).
export function parseImages(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(x) && x.length < 400_000)
    .slice(0, 6);
}
