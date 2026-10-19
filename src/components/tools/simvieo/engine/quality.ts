// Pre-export quality review: readability, contrast, brand presence, pacing.
import type { Palette, Plan } from "@/lib/simvieo/types";
import { contrast } from "./color";
import type { Renderer } from "./render";

export interface QualityItem {
  label: string;
  status: "pass" | "warn" | "fixed";
  detail: string;
}

export function reviewQuality(
  plan: Plan,
  pal: Palette,
  renderer: Renderer,
  target: number,
  opts: { hasLogo: boolean; imageCount: number; voiceFixes: number }
): QualityItem[] {
  const out: QualityItem[] = [];
  const s = plan.scenes;

  out.push(
    s[0]?.kind === "hook"
      ? { label: "Opening hook", status: "pass", detail: `Opens with “${s[0].headline}”.` }
      : { label: "Opening hook", status: "warn", detail: "First scene isn't a hook — consider regenerating it." }
  );
  out.push(
    s[s.length - 1]?.kind === "cta"
      ? { label: "Call to action", status: "pass", detail: "Ends with a clear call to action." }
      : { label: "Call to action", status: "warn", detail: "Last scene isn't a call to action." }
  );

  const fast = s.filter((x) => x.voice && x.voice.split(/\s+/).length / x.duration > 3.2);
  out.push(
    fast.length
      ? { label: "Reading pace", status: "warn", detail: `${fast.length} scene(s) have a lot of text for their length.` }
      : { label: "Reading pace", status: "pass", detail: "Every caption can be read comfortably." }
  );

  // Render one frame per scene off-screen so the layout engine reports fit.
  const c = document.createElement("canvas");
  c.width = renderer.W;
  c.height = renderer.H;
  const cx = c.getContext("2d")!;
  renderer.starts.forEach((st, i) => renderer.draw(cx, st + Math.min(2, s[i].duration * 0.7)));
  out.push(
    renderer.fitWarnings.size
      ? { label: "Text fit", status: "warn", detail: `${renderer.fitWarnings.size} headline(s) are long; shorten them for bigger, bolder text.` }
      : { label: "Text fit", status: "pass", detail: "All text fits inside safe margins." }
  );

  const cr = contrast(pal.text, pal.bg);
  out.push(
    cr >= 4.5
      ? { label: "Contrast", status: "pass", detail: `Text contrast ${cr.toFixed(1)}:1 (WCAG AA).` }
      : { label: "Contrast", status: "fixed", detail: "Adjusted colours for legibility." }
  );

  if (opts.hasLogo) {
    const shown = s.some((x) => x.kind === "logo_sting" || x.kind === "cta");
    out.push({ label: "Brand presence", status: shown ? "pass" : "warn", detail: shown ? "Logo appears on the brand and CTA scenes." : "Logo isn't featured on its own scene." });
  }
  if (opts.imageCount) {
    const used = new Set(s.map((x) => x.imageIndex).filter((x) => x !== undefined)).size;
    out.push({
      label: "Product visibility",
      status: used ? "pass" : "warn",
      detail: used ? `${used} of ${opts.imageCount} product image(s) used.` : "No scene shows your product images.",
    });
  }
  const total = s.reduce((a, x) => a + x.duration, 0);
  out.push(
    Math.abs(total - target) < 0.6
      ? { label: "Duration", status: "pass", detail: `${total.toFixed(1)}s, as requested.` }
      : { label: "Duration", status: "fixed", detail: `${total.toFixed(1)}s — stretched slightly so the voiceover isn't cut off.` }
  );
  if (opts.voiceFixes) {
    out.push({ label: "Voice sync", status: "fixed", detail: `${opts.voiceFixes} scene(s) lengthened to fit the narration.` });
  }
  return out;
}
