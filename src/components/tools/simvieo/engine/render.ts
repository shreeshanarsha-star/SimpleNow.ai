// SimVieo scene renderer -- a deterministic function of time. The same code
// drives the live preview (requestAnimationFrame) and the MP4 export
// (frame-by-frame), so what you preview is exactly what you download.
import type { Palette, Plan, Scene, VideoFormat } from "@/lib/simvieo/types";
import { contrast, mix, rgba } from "./color";

export interface ImgAsset {
  src: CanvasImageSource;
  w: number;
  h: number;
  blur: HTMLCanvasElement; // pre-blurred backdrop
  packshot?: boolean; // product on a plain backdrop -> never crop it
  edge?: string; // backdrop colour of a packshot
}

export interface LogoAsset extends ImgAsset {
  needsBadge: boolean; // opaque/dark logo that needs a light plate
}

export interface Assets {
  images: ImgAsset[];
  logo?: LogoAsset;
}

export interface Fonts {
  display: string;
  body: string;
  serif: string;
}

export interface RenderOptions {
  captions: boolean;
  watermarkLogo: boolean;
  voiceLengths?: (number | null)[]; // seconds of narration per scene
}

export const DIMENSIONS: Record<VideoFormat, [number, number]> = {
  "9:16": [1080, 1920],
  "1:1": [1080, 1080],
  "16:9": [1920, 1080],
};

const TRANSITION_S = 0.55;

// ---------- easing ----------
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const easeOut = (x: number) => 1 - Math.pow(1 - clamp(x), 3);
const easeInOut = (x: number) => {
  x = clamp(x);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
const easeBack = (x: number) => {
  x = clamp(x);
  const c1 = 1.7, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

interface Box { x: number; y: number; w: number; h: number }
interface TextLayout { size: number; lines: string[]; lh: number; font: string; shrunk: boolean; widths: number[] }
interface SceneTheme { dark: boolean; text: string; muted: string; accent: string; fill: (ctx: CanvasRenderingContext2D, t: number) => void }

type Ctx = CanvasRenderingContext2D;

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function textOn(bg: string) {
  return contrast("#FFFFFF", bg) >= contrast("#0E1424", bg) ? "#FFFFFF" : "#0E1424";
}

export class Renderer {
  readonly W: number;
  readonly H: number;
  readonly u: number;
  readonly starts: number[] = [];
  readonly total: number;
  readonly fitWarnings = new Set<string>();
  private layoutCache = new Map<string, TextLayout>();
  private offA: HTMLCanvasElement;
  private offB: HTMLCanvasElement;
  private grain: HTMLCanvasElement | null = null;
  private measure: Ctx;
  private portrait: boolean;
  private landscape: boolean;

  constructor(
    format: VideoFormat,
    private plan: Plan,
    private pal: Palette,
    private assets: Assets,
    private fonts: Fonts,
    private opts: RenderOptions,
    scale = 1
  ) {
    const [w, h] = DIMENSIONS[format];
    this.W = Math.round(w * scale);
    this.H = Math.round(h * scale);
    this.u = Math.min(this.W, this.H) / 1080;
    this.portrait = format === "9:16";
    this.landscape = format === "16:9";
    let acc = 0;
    for (const s of plan.scenes) {
      this.starts.push(acc);
      acc += s.duration;
    }
    this.total = acc;
    this.offA = this.makeCanvas();
    this.offB = this.makeCanvas();
    this.measure = this.makeCanvas().getContext("2d")!;
    this.grain = this.makeGrain();
  }

  private makeCanvas() {
    const c = document.createElement("canvas");
    c.width = this.W;
    c.height = this.H;
    return c;
  }

  private makeGrain() {
    const c = document.createElement("canvas");
    c.width = c.height = 192;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(192, 192);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  get styleDark() {
    return this.plan.style !== "corporate";
  }

  sceneAt(t: number) {
    let i = this.starts.length - 1;
    while (i > 0 && t < this.starts[i]) i--;
    return i;
  }

  // ---------- regions ----------
  private safe(): Box {
    const { W, H, u } = this;
    if (this.portrait) return { x: 80 * u, y: 170 * u, w: W - 160 * u, h: H - 170 * u - 380 * u };
    if (this.landscape) return { x: 120 * u, y: 90 * u, w: W - 240 * u, h: H - 90 * u - 190 * u };
    return { x: 80 * u, y: 80 * u, w: W - 160 * u, h: H - 80 * u - 200 * u };
  }

  // ---------- themes ----------
  private theme(i: number): SceneTheme {
    const p = this.pal;
    const style = this.plan.style;
    const blobs = (ctx: Ctx, t: number, base: string, a: string, b: string, strength = 1) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, this.W, this.H);
      const R = Math.max(this.W, this.H) * 0.75;
      const pts: [number, number, string, number][] = [
        [0.2 + 0.12 * Math.sin(t * 0.35 + i), 0.25 + 0.1 * Math.cos(t * 0.3), a, 0.55],
        [0.85 + 0.1 * Math.cos(t * 0.27 + i), 0.75 + 0.12 * Math.sin(t * 0.33), b, 0.4],
      ];
      for (const [x, y, c, al] of pts) {
        const g = ctx.createRadialGradient(x * this.W, y * this.H, 0, x * this.W, y * this.H, R);
        g.addColorStop(0, rgba(c, al * strength));
        g.addColorStop(1, rgba(c, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, this.W, this.H);
      }
    };
    if (style === "corporate") {
      const base = i % 2 === 0 ? p.bg : "#FFFFFF";
      return {
        dark: false, text: p.text, muted: p.textMuted, accent: p.primary,
        fill: (ctx, t) => blobs(ctx, t, base, p.primary, p.accent, 0.18),
      };
    }
    if (style === "kinetic") {
      const k = i % 3;
      if (k === 1) {
        const tx = textOn(p.primary);
        return { dark: tx === "#FFFFFF", text: tx, muted: rgba(tx, 0.8), accent: tx === "#FFFFFF" ? "#0E1424" : "#FFFFFF", fill: (ctx) => { ctx.fillStyle = p.primary; ctx.fillRect(0, 0, this.W, this.H); } };
      }
      if (k === 2) {
        const bgc = mix(p.accent, "#FFFFFF", 0.1);
        const tx = textOn(bgc);
        return { dark: tx === "#FFFFFF", text: tx, muted: rgba(tx, 0.8), accent: p.primary, fill: (ctx) => { ctx.fillStyle = bgc; ctx.fillRect(0, 0, this.W, this.H); } };
      }
      return { dark: true, text: "#FFFFFF", muted: p.textMuted, accent: p.accent, fill: (ctx, t) => blobs(ctx, t, p.bg, p.primary, p.accent, 0.5) };
    }
    if (style === "social") {
      if (i % 2 === 1) {
        const mid = mix(p.primary, p.secondary, 0.5);
        const tx = textOn(mid);
        return {
          dark: tx === "#FFFFFF", text: tx, muted: rgba(tx, 0.85), accent: tx === "#FFFFFF" ? "#FFFFFF" : p.bg,
          fill: (ctx, t) => {
            const g = ctx.createLinearGradient(0, 0, this.W, this.H);
            g.addColorStop(0, p.primary);
            g.addColorStop(1, p.secondary);
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, this.W, this.H);
            blobs(ctx, t, "rgba(0,0,0,0)", "#FFFFFF", p.accent, 0.25);
          },
        };
      }
      return { dark: true, text: "#FFFFFF", muted: p.textMuted, accent: p.accent, fill: (ctx, t) => blobs(ctx, t, p.bg, p.primary, p.secondary, 0.9) };
    }
    return { dark: true, text: "#FFFFFF", muted: p.textMuted, accent: p.accent, fill: (ctx, t) => blobs(ctx, t, p.bg, p.primary, p.accent, 0.75) };
  }

  // ---------- text ----------
  private layout(key: string, text: string, weight: number, family: string, maxW: number, maxH: number, start: number, min: number, lhMul = 1.12): TextLayout {
    const ck = `${key}|${text}|${Math.round(maxW)}|${Math.round(maxH)}|${start}|${family}|${weight}`;
    const hit = this.layoutCache.get(ck);
    if (hit) return hit;
    const ctx = this.measure;
    let size = start;
    let lines: string[] = [];
    let font = "";
    for (; size >= min; size = Math.floor(size * 0.93)) {
      font = `${weight} ${size}px ${family}`;
      ctx.font = font;
      lines = this.wrap(ctx, text, maxW);
      const tooWide = lines.some((l) => ctx.measureText(l).width > maxW);
      if (!tooWide && lines.length * size * lhMul <= maxH) break;
    }
    const shrunk = size < min;
    if (shrunk) {
      size = min;
      font = `${weight} ${size}px ${family}`;
      ctx.font = font;
      lines = this.wrap(ctx, text, maxW);
      this.fitWarnings.add(key);
    }
    const widths = lines.map((l) => ctx.measureText(l).width);
    const out = { size, lines, lh: size * lhMul, font, shrunk, widths };
    this.layoutCache.set(ck, out);
    return out;
  }

  private wrap(ctx: Ctx, text: string, maxW: number) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(test).width <= maxW || !cur) cur = test;
      else {
        lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  // Word-by-word reveal. mode "rise" (slide up + fade) or "pop" (scale).
  private drawText(ctx: Ctx, L: TextLayout, x: number, y: number, align: "left" | "center", color: string, lt: number, delay = 0, mode: "rise" | "pop" = "rise", stagger = 0.07, shadow = false) {
    ctx.save();
    ctx.font = L.font;
    ctx.fillStyle = color;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    if (shadow) {
      ctx.shadowColor = "rgba(0,0,0,0.45)";
      ctx.shadowBlur = 24 * this.u;
      ctx.shadowOffsetY = 4 * this.u;
    }
    const space = ctx.measureText(" ").width;
    let wi = 0;
    L.lines.forEach((line, li) => {
      const lw = L.widths[li];
      let cx = align === "center" ? x - lw / 2 : x;
      const ly = y + li * L.lh;
      for (const word of line.split(" ")) {
        const ww = ctx.measureText(word).width;
        const p = easeOut((lt - delay - wi * stagger) / 0.5);
        if (p > 0) {
          ctx.globalAlpha = clamp(p * 1.4);
          if (mode === "pop") {
            const s = 0.6 + 0.4 * easeBack((lt - delay - wi * stagger) / 0.45);
            ctx.save();
            ctx.translate(cx + ww / 2, ly + L.size / 2);
            ctx.scale(s, s);
            ctx.fillText(word, -ww / 2, -L.size / 2);
            ctx.restore();
          } else {
            ctx.fillText(word, cx, ly + (1 - p) * L.size * 0.55);
          }
        }
        cx += ww + space;
        wi++;
      }
    });
    ctx.restore();
    return y + L.lines.length * L.lh;
  }

  private headlineFamily() {
    return this.fonts.display;
  }

  // ---------- images ----------
  private cover(ctx: Ctx, img: ImgAsset | { src: CanvasImageSource; w: number; h: number }, b: Box, zoom: number, px: number, py: number) {
    const s = Math.max(b.w / img.w, b.h / img.h) * zoom;
    const w = img.w * s, h = img.h * s;
    const x = b.x + (b.w - w) / 2 + px * (w - b.w) / 2;
    const y = b.y + (b.h - h) / 2 + py * (h - b.h) / 2;
    ctx.drawImage(img.src, x, y, w, h);
  }

  private kenBurns(s: Scene, p: number) {
    const e = easeInOut(p);
    switch (s.motion) {
      case "pull_out": return { zoom: 1.16 - 0.12 * e, px: 0, py: 0 };
      case "pan_left": return { zoom: 1.14, px: 0.8 - 1.6 * e, py: 0 };
      case "pan_right": return { zoom: 1.14, px: -0.8 + 1.6 * e, py: 0 };
      default: return { zoom: 1.04 + 0.12 * e, px: 0, py: 0 };
    }
  }

  private img(i?: number) {
    if (i === undefined) return undefined;
    return this.assets.images[i] || this.assets.images[0];
  }

  private blurBackdrop(ctx: Ctx, img: ImgAsset, dark: boolean, p: number) {
    this.cover(ctx, { src: img.blur, w: img.blur.width, h: img.blur.height }, { x: 0, y: 0, w: this.W, h: this.H }, 1.1 + 0.05 * p, 0, 0);
    ctx.fillStyle = dark ? "rgba(6,6,12,0.55)" : "rgba(255,255,255,0.55)";
    ctx.fillRect(0, 0, this.W, this.H);
  }

  private floatingProduct(ctx: Ctx, img: ImgAsset, b: Box, lt: number, dur: number, glow: string) {
    const enter = easeBack(lt / 0.8);
    const s = Math.min(b.w / img.w, b.h / img.h) * (0.86 + 0.14 * enter) * (1 + 0.04 * (lt / dur));
    const w = img.w * s, h = img.h * s;
    const bob = Math.sin(lt * 1.6) * 10 * this.u;
    const x = b.x + (b.w - w) / 2;
    const y = b.y + (b.h - h) / 2 + bob + (1 - easeOut(lt / 0.8)) * 120 * this.u;
    ctx.save();
    ctx.globalAlpha = clamp(lt / 0.4);
    const g = ctx.createRadialGradient(b.x + b.w / 2, b.y + b.h / 2, 0, b.x + b.w / 2, b.y + b.h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, rgba(glow, 0.55));
    g.addColorStop(1, rgba(glow, 0));
    ctx.fillStyle = g;
    ctx.fillRect(b.x - b.w * 0.3, b.y - b.h * 0.3, b.w * 1.6, b.h * 1.6);
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 60 * this.u;
    ctx.shadowOffsetY = 30 * this.u;
    roundRect(ctx, x, y, w, h, 28 * this.u);
    ctx.save();
    ctx.clip();
    ctx.drawImage(img.src, x, y, w, h);
    ctx.restore();
    // subtle sheen sweep
    const sweep = ((lt * 0.35) % 1.6) - 0.3;
    if (sweep > 0 && sweep < 1) {
      ctx.save();
      roundRect(ctx, x, y, w, h, 28 * this.u);
      ctx.clip();
      const sg = ctx.createLinearGradient(x + w * (sweep - 0.25), y, x + w * (sweep + 0.25), y + h);
      sg.addColorStop(0, "rgba(255,255,255,0)");
      sg.addColorStop(0.5, "rgba(255,255,255,0.18)");
      sg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = sg;
      ctx.fillRect(x, y, w, h);
      ctx.restore();
    }
    ctx.restore();
  }

  private drawLogo(ctx: Ctx, cx: number, cy: number, maxW: number, maxH: number, alpha = 1, scale = 1) {
    const L = this.assets.logo;
    if (!L) return 0;
    const s = Math.min(maxW / L.w, maxH / L.h) * scale;
    const w = L.w * s, h = L.h * s;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (L.needsBadge) {
      const pad = Math.max(w, h) * 0.18;
      ctx.fillStyle = "#FFFFFF";
      ctx.shadowColor = "rgba(0,0,0,0.25)";
      ctx.shadowBlur = 30 * this.u;
      roundRect(ctx, cx - w / 2 - pad, cy - h / 2 - pad, w + pad * 2, h + pad * 2, 22 * this.u * scale);
      ctx.fill();
      ctx.shadowColor = "transparent";
    }
    ctx.drawImage(L.src, cx - w / 2, cy - h / 2, w, h);
    ctx.restore();
    return h;
  }

  private accentBar(ctx: Ctx, x: number, y: number, w: number, color: string, lt: number, delay = 0.3) {
    const p = easeOut((lt - delay) / 0.6);
    ctx.fillStyle = color;
    roundRect(ctx, x, y, w * p, 10 * this.u, 5 * this.u);
    ctx.fill();
  }

  // ---------- scenes ----------
  private drawScene(ctx: Ctx, i: number, lt: number) {
    const s = this.plan.scenes[i];
    const th = this.theme(i);
    const p = clamp(lt / s.duration);
    const tGlobal = this.starts[i] + lt;
    const B = this.safe();
    const u = this.u;
    const D = this.headlineFamily();
    const kinetic = this.plan.style === "kinetic";
    const upper = kinetic;
    const H = (t: string) => (upper ? t.toUpperCase() : t);
    const img = this.img(s.imageIndex);

    th.fill(ctx, tGlobal);

    switch (s.kind) {
      case "hook": {
        if (img && !kinetic) this.blurBackdrop(ctx, img, th.dark, p);
        const L = this.layout(`hook-${i}`, H(s.headline), 800, D, B.w, B.h * 0.6, Math.round((this.landscape ? 150 : 140) * u), Math.round(64 * u), 1.05);
        const totalH = L.lines.length * L.lh;
        const y = B.y + (B.h - totalH) / 2;
        this.drawText(ctx, L, this.W / 2, y, "center", th.text, lt, 0.1, kinetic || this.plan.style === "social" ? "pop" : "rise", 0.12, !!img);
        const bw = Math.min(B.w * 0.35, 260 * u);
        this.accentBar(ctx, this.W / 2 - bw / 2, y + totalH + 36 * u, bw, th.accent, lt, 0.5);
        break;
      }
      case "product_hero": {
        if (img) this.blurBackdrop(ctx, img, th.dark, p);
        const textH = this.portrait ? B.h * 0.3 : B.h * 0.28;
        let imgBox: Box, tx: number, ty: number, align: "left" | "center", tw: number;
        if (this.landscape) {
          imgBox = { x: B.x + B.w * 0.5, y: B.y, w: B.w * 0.5, h: B.h };
          tx = B.x; tw = B.w * 0.46; align = "left";
          ty = B.y + B.h * 0.3;
        } else {
          imgBox = { x: B.x, y: B.y, w: B.w, h: B.h - textH - 40 * u };
          tx = this.W / 2; tw = B.w; align = "center";
          ty = B.y + B.h - textH;
        }
        if (img) this.floatingProduct(ctx, img, imgBox, lt, s.duration, th.accent);
        const L = this.layout(`hero-${i}`, H(s.headline), 800, D, tw, textH * 0.6, Math.round(96 * u), Math.round(44 * u));
        let y = this.drawText(ctx, L, tx, ty, align, th.text, lt, 0.35, "rise", 0.06, true);
        if (s.sub) {
          const S = this.layout(`herosub-${i}`, s.sub, 500, this.fonts.body, tw, textH * 0.38, Math.round(44 * u), Math.round(26 * u), 1.3);
          this.drawText(ctx, S, tx, y + 18 * u, align, th.muted, lt, 0.75, "rise", 0.025, true);
        }
        break;
      }
      case "benefits": {
        const bullets = s.bullets || [];
        const L = this.layout(`ben-${i}`, H(s.headline), 800, D, B.w, B.h * 0.25, Math.round(96 * u), Math.round(48 * u));
        const hasImg = !!img && this.landscape;
        const listX = B.x;
        const listW = hasImg ? B.w * 0.55 : B.w;
        if (hasImg && img) {
          const ib = { x: B.x + B.w * 0.6, y: B.y, w: B.w * 0.4, h: B.h };
          this.floatingProduct(ctx, img, ib, lt, s.duration, th.accent);
        }
        let y = this.drawText(ctx, L, listX, B.y + (this.portrait ? B.h * 0.08 : 0), "left", th.text, lt, 0.1);
        this.accentBar(ctx, listX, y + 22 * u, 140 * u, th.accent, lt, 0.4);
        y += 80 * u;
        const rowH = Math.min((B.y + B.h - y) / Math.max(bullets.length, 1), 200 * u);
        bullets.forEach((b, bi) => {
          const d = 0.6 + bi * 0.35;
          const e = easeOut((lt - d) / 0.55);
          if (e <= 0) return;
          const ry = y + bi * rowH;
          ctx.save();
          ctx.globalAlpha = e;
          ctx.translate((1 - e) * -60 * u, 0);
          const r = 34 * u;
          ctx.fillStyle = th.accent;
          ctx.beginPath();
          ctx.arc(listX + r, ry + rowH / 2, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = textOn(th.accent);
          ctx.lineWidth = 7 * u;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.beginPath();
          ctx.moveTo(listX + r * 0.55, ry + rowH / 2);
          ctx.lineTo(listX + r * 0.9, ry + rowH / 2 + r * 0.35);
          ctx.lineTo(listX + r * 1.5, ry + rowH / 2 - r * 0.38);
          ctx.stroke();
          const T = this.layout(`bul-${i}-${bi}`, b, 600, this.fonts.body, listW - r * 2 - 40 * u, rowH * 0.9, Math.round(58 * u), Math.round(30 * u), 1.15);
          const ty = ry + rowH / 2 - (T.lines.length * T.lh) / 2;
          ctx.font = T.font;
          ctx.fillStyle = th.text;
          ctx.textBaseline = "top";
          T.lines.forEach((ln, k) => ctx.fillText(ln, listX + r * 2 + 34 * u, ty + k * T.lh));
          ctx.restore();
        });
        break;
      }
      case "stat": {
        const st = s.stat!;
        const cx = this.W / 2;
        const cy = B.y + B.h * (this.portrait ? 0.38 : 0.42);
        const R = Math.min(B.w, B.h) * (this.portrait ? 0.32 : 0.36);
        const prog = easeOut((lt - 0.2) / 1.6);
        ctx.save();
        ctx.lineWidth = 22 * u;
        ctx.strokeStyle = rgba(th.text, 0.12);
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = th.accent;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * 0.82 * prog);
        ctx.stroke();
        ctx.restore();
        const decimals = Math.abs(st.value) < 10 && st.value % 1 !== 0 ? 1 : 0;
        const val = (st.value * prog).toFixed(decimals);
        const text = `${st.prefix || ""}${Number(val).toLocaleString("en-IN", { minimumFractionDigits: decimals })}${st.suffix || ""}`;
        const N = this.layout(`statn-${i}-${text.length}`, text, 800, D, R * 1.6, R * 0.9, Math.round(200 * u), Math.round(60 * u), 1);
        ctx.save();
        ctx.globalAlpha = clamp(lt / 0.3);
        ctx.font = N.font;
        ctx.fillStyle = th.text;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, cx, cy + 6 * u);
        ctx.restore();
        const lab = st.label || s.headline;
        const LL = this.layout(`statl-${i}`, H(lab), 700, D, B.w, B.h - (cy + R - B.y) - 60 * u, Math.round(72 * u), Math.round(36 * u));
        this.drawText(ctx, LL, cx, cy + R + 60 * u, "center", th.text, lt, 0.9);
        break;
      }
      case "split": {
        const first = this.landscape || !this.portrait ? "left" : "top";
        const prog = easeInOut(lt / 0.9);
        const ib: Box = first === "left"
          ? { x: 0, y: 0, w: this.W * 0.5, h: this.H }
          : { x: 0, y: 0, w: this.W, h: this.H * 0.5 };
        if (img) {
          ctx.save();
          ctx.beginPath();
          if (first === "left") ctx.rect(0, 0, ib.w * prog, ib.h);
          else ctx.rect(0, 0, ib.w, ib.h * prog);
          ctx.clip();
          if (img.packshot) {
            ctx.fillStyle = img.edge || "#FFFFFF";
            ctx.fillRect(ib.x, ib.y, ib.w, ib.h);
            const z = 0.82 + 0.06 * easeInOut(p);
            const sc = Math.min(ib.w / img.w, ib.h / img.h) * z;
            ctx.drawImage(img.src, ib.x + (ib.w - img.w * sc) / 2, ib.y + (ib.h - img.h * sc) / 2, img.w * sc, img.h * sc);
          } else {
            const k = this.kenBurns(s, p);
            this.cover(ctx, img, ib, k.zoom, k.px, k.py);
          }
          ctx.restore();
          ctx.fillStyle = th.accent;
          if (first === "left") ctx.fillRect(ib.w * prog - 6 * u, 0, 12 * u, ib.h);
          else ctx.fillRect(0, ib.h * prog - 6 * u, ib.w, 12 * u);
        }
        const tb: Box = first === "left"
          ? { x: this.W * 0.5 + 70 * u, y: B.y, w: this.W * 0.5 - 70 * u - (this.W - B.x - B.w), h: B.h }
          : { x: B.x, y: this.H * 0.5 + 70 * u, w: B.w, h: B.y + B.h - this.H * 0.5 - 70 * u };
        const L = this.layout(`split-${i}`, H(s.headline), 800, D, tb.w, tb.h * 0.55, Math.round(96 * u), Math.round(44 * u));
        const S = s.sub ? this.layout(`splits-${i}`, s.sub, 500, this.fonts.body, tb.w, tb.h * 0.4, Math.round(44 * u), Math.round(26 * u), 1.3) : null;
        const blockH = L.lines.length * L.lh + (S ? S.lines.length * S.lh + 30 * u : 0);
        let y = tb.y + (tb.h - blockH) / 2;
        y = this.drawText(ctx, L, tb.x, y, "left", th.text, lt, 0.5);
        if (S) this.drawText(ctx, S, tb.x, y + 30 * u, "left", th.muted, lt, 0.9, "rise", 0.03);
        break;
      }
      case "quote": {
        if (img) this.blurBackdrop(ctx, img, th.dark, p);
        ctx.save();
        ctx.globalAlpha = 0.9 * easeOut(lt / 0.6);
        ctx.fillStyle = th.accent;
        ctx.font = `700 ${Math.round(320 * u)}px ${this.fonts.serif}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText("“", this.W / 2, B.y + B.h * 0.08);
        ctx.restore();
        const L = this.layout(`quote-${i}`, s.headline, 700, this.fonts.serif, B.w * 0.92, B.h * 0.5, Math.round(92 * u), Math.round(44 * u), 1.2);
        const y = B.y + B.h * 0.32;
        const end = this.drawText(ctx, L, this.W / 2, y, "center", th.text, lt, 0.3, "rise", 0.06);
        if (s.sub) {
          const S = this.layout(`quotes-${i}`, s.sub, 600, this.fonts.body, B.w, 120 * u, Math.round(40 * u), Math.round(24 * u));
          this.drawText(ctx, S, this.W / 2, end + 40 * u, "center", th.accent, lt, 1.0);
        }
        break;
      }
      case "logo_sting": {
        const cx = this.W / 2;
        const cy = B.y + B.h * 0.42;
        for (let r = 0; r < 3; r++) {
          const rp = clamp((lt - r * 0.25) / 1.6);
          if (rp <= 0 || rp >= 1) continue;
          ctx.save();
          ctx.globalAlpha = (1 - rp) * 0.6;
          ctx.strokeStyle = th.accent;
          ctx.lineWidth = 6 * u;
          ctx.beginPath();
          ctx.arc(cx, cy, 120 * u + rp * Math.min(this.W, this.H) * 0.45, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
        let below = cy;
        if (this.assets.logo) {
          const sc = 0.5 + 0.5 * easeBack(lt / 0.7);
          const h = this.drawLogo(ctx, cx, cy, B.w * 0.6, B.h * 0.28, clamp(lt / 0.3), sc);
          below = cy + h / 2 + 70 * u;
        }
        const name = s.headline || this.plan.brandName || "";
        if (name) {
          const L = this.layout(`brand-${i}`, this.assets.logo ? name : name.toUpperCase(), 800, D, B.w, this.assets.logo ? 120 * u : B.h * 0.4, Math.round((this.assets.logo ? 64 : 150) * u), Math.round(36 * u));
          const y = this.assets.logo ? below : cy - (L.lines.length * L.lh) / 2;
          this.drawText(ctx, L, cx, y, "center", th.text, lt, this.assets.logo ? 0.5 : 0.1, this.assets.logo ? "rise" : "pop", 0.1);
        }
        break;
      }
      case "cta": {
        if (img && this.plan.style !== "kinetic") this.blurBackdrop(ctx, img, th.dark, p);
        const cx = this.W / 2;
        const L = this.layout(`cta-${i}`, H(s.headline), 800, D, B.w, B.h * 0.35, Math.round(120 * u), Math.round(56 * u), 1.05);
        const logoH = this.assets.logo ? Math.min(140 * u, (B.w * 0.4 * this.assets.logo.h) / this.assets.logo.w) : 0;
        const bh = 110 * u;
        const blockH = (logoH ? logoH + 80 * u : 0) + L.lines.length * L.lh + 70 * u + bh;
        let y = B.y + Math.max(0, (B.h - blockH) / 2);
        if (this.assets.logo) {
          this.drawLogo(ctx, cx, y + logoH / 2, B.w * 0.4, 140 * u, clamp(lt / 0.4));
          y += logoH + 80 * u;
        }
        y = this.drawText(ctx, L, cx, y, "center", th.text, lt, 0.2, kinetic ? "pop" : "rise", 0.08, !!img);
        const btnText = (s.sub || this.plan.cta.url || this.plan.cta.text || "Learn more").replace(/^https?:\/\//, "");
        const e = easeBack((lt - 0.8) / 0.6);
        if (e > 0) {
          ctx.save();
          ctx.font = `700 ${Math.round(46 * u)}px ${this.fonts.body}`;
          const tw = Math.min(ctx.measureText(btnText).width, B.w - 140 * u);
          const bw = tw + 120 * u;
          const by = y + 70 * u;
          const pulse = 1 + 0.03 * Math.sin(lt * 5);
          ctx.translate(cx, by + bh / 2);
          ctx.scale(e * pulse, e * pulse);
          ctx.shadowColor = rgba(this.pal.primary, 0.6);
          ctx.shadowBlur = 50 * u;
          ctx.fillStyle = th.accent === th.text ? this.pal.primary : th.accent;
          roundRect(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2);
          ctx.fill();
          ctx.shadowColor = "transparent";
          ctx.fillStyle = textOn(ctx.fillStyle as string);
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(btnText, 0, 2 * u, B.w - 140 * u);
          ctx.restore();
        }
        break;
      }
      default: {
        // feature
        if (img && img.packshot) {
          this.blurBackdrop(ctx, img, th.dark, p);
          let ib: Box, tb: Box;
          if (this.portrait) {
            ib = { x: B.x, y: B.y, w: B.w, h: B.h * 0.55 };
            tb = { x: B.x, y: B.y + B.h * 0.6, w: B.w, h: B.h * 0.4 };
          } else {
            const left = i % 2 === 0;
            ib = { x: left ? B.x : B.x + B.w * 0.52, y: B.y, w: B.w * 0.48, h: B.h };
            tb = { x: left ? B.x + B.w * 0.54 : B.x, y: B.y, w: B.w * 0.46, h: B.h };
          }
          this.floatingProduct(ctx, img, ib, lt, s.duration, th.accent);
          const L = this.layout(`featp-${i}`, H(s.headline), 800, D, tb.w, tb.h * 0.55, Math.round(96 * u), Math.round(44 * u));
          const S = s.sub ? this.layout(`featps-${i}`, s.sub, 500, this.fonts.body, tb.w, tb.h * 0.35, Math.round(42 * u), Math.round(26 * u), 1.3) : null;
          const blockH = L.lines.length * L.lh + (S ? S.lines.length * S.lh + 28 * u : 0);
          const align = this.portrait ? "center" : "left";
          const tx = this.portrait ? this.W / 2 : tb.x;
          let y = tb.y + (tb.h - blockH) / 2;
          y = this.drawText(ctx, L, tx, y, align, th.text, lt, 0.35, "rise", 0.06, true);
          if (S) this.drawText(ctx, S, tx, y + 28 * u, align, th.muted, lt, 0.7, "rise", 0.03, true);
        } else if (img) {
          const k = this.kenBurns(s, p);
          this.cover(ctx, img, { x: 0, y: 0, w: this.W, h: this.H }, k.zoom, k.px, k.py);
          const g = ctx.createLinearGradient(0, this.H * 0.35, 0, this.H);
          g.addColorStop(0, "rgba(0,0,0,0)");
          g.addColorStop(1, "rgba(0,0,0,0.82)");
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, this.W, this.H);
          const L = this.layout(`feat-${i}`, H(s.headline), 800, D, B.w, B.h * 0.3, Math.round(104 * u), Math.round(48 * u));
          const S = s.sub ? this.layout(`feats-${i}`, s.sub, 500, this.fonts.body, B.w, B.h * 0.18, Math.round(44 * u), Math.round(26 * u), 1.3) : null;
          const blockH = L.lines.length * L.lh + (S ? S.lines.length * S.lh + 26 * u : 0);
          let y = B.y + B.h - blockH;
          this.accentBar(ctx, B.x, y - 40 * u, 120 * u, this.pal.accent, lt, 0.2);
          y = this.drawText(ctx, L, B.x, y, "left", "#FFFFFF", lt, 0.3, "rise", 0.06, true);
          if (S) this.drawText(ctx, S, B.x, y + 26 * u, "left", "#E6E7EE", lt, 0.7, "rise", 0.03, true);
        } else {
          // typographic feature with a rotating geometric accent
          ctx.save();
          ctx.translate(this.W * 0.82, this.H * 0.22);
          ctx.rotate(tGlobal * 0.3);
          ctx.strokeStyle = rgba(th.accent, 0.5);
          ctx.lineWidth = 8 * u;
          ctx.strokeRect(-110 * u, -110 * u, 220 * u, 220 * u);
          ctx.restore();
          const L = this.layout(`feat-${i}`, H(s.headline), 800, D, B.w, B.h * 0.5, Math.round(120 * u), Math.round(52 * u), 1.05);
          const S = s.sub ? this.layout(`feats-${i}`, s.sub, 500, this.fonts.body, B.w * 0.9, B.h * 0.25, Math.round(48 * u), Math.round(28 * u), 1.3) : null;
          const blockH = L.lines.length * L.lh + (S ? S.lines.length * S.lh + 40 * u : 0);
          let y = B.y + (B.h - blockH) / 2;
          y = this.drawText(ctx, L, B.x, y, "left", th.text, lt, 0.1, kinetic ? "pop" : "rise", 0.08);
          if (S) this.drawText(ctx, S, B.x, y + 40 * u, "left", th.muted, lt, 0.6, "rise", 0.03);
        }
      }
    }

    // grain + vignette for a filmic finish on dark scenes
    if (th.dark && this.grain) {
      ctx.save();
      ctx.globalAlpha = 0.045;
      const pat = ctx.createPattern(this.grain, "repeat");
      if (pat) {
        ctx.translate((tGlobal * 997) % 192, (tGlobal * 619) % 192);
        ctx.fillStyle = pat;
        ctx.fillRect(-192, -192, this.W + 384, this.H + 384);
      }
      ctx.restore();
      const v = ctx.createRadialGradient(this.W / 2, this.H / 2, Math.min(this.W, this.H) * 0.35, this.W / 2, this.H / 2, Math.max(this.W, this.H) * 0.75);
      v.addColorStop(0, "rgba(0,0,0,0)");
      v.addColorStop(1, "rgba(0,0,0,0.35)");
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, this.W, this.H);
    }

    // small brand mark on scenes that don't already feature the logo
    if (this.opts.watermarkLogo && this.assets.logo && s.kind !== "logo_sting" && s.kind !== "cta") {
      const m = 46 * u;
      const size = 70 * u;
      this.drawLogo(ctx, this.W - m - size, m + size / 2 + (this.portrait ? 40 * u : 0), size * 2, size, 0.85 * clamp(lt / 0.5));
    }
  }

  // ---------- captions ----------
  private drawCaptions(ctx: Ctx, t: number) {
    const i = this.sceneAt(t);
    const s = this.plan.scenes[i];
    if (!s.voice) return;
    const lt = t - this.starts[i];
    const vlen = this.opts.voiceLengths?.[i] ?? null;
    const span = Math.max(0.8, (vlen ?? s.duration * 0.9) - 0.1);
    const offset = vlen ? 0.25 : 0.15;
    const words = s.voice.split(/\s+/).filter(Boolean);
    const per = 6;
    const chunks: string[][] = [];
    for (let k = 0; k < words.length; k += per) chunks.push(words.slice(k, k + per));
    const prog = clamp((lt - offset) / span);
    if (lt < offset || lt > offset + span + 0.4) return;
    const wordIdx = Math.min(words.length - 1, Math.floor(prog * words.length));
    const ci = Math.floor(wordIdx / per);
    const chunk = chunks[ci];
    if (!chunk) return;
    const u = this.u;
    const size = Math.round((this.landscape ? 46 : 50) * u);
    ctx.save();
    ctx.font = `700 ${size}px ${this.fonts.body}`;
    const space = ctx.measureText(" ").width;
    const widths = chunk.map((w) => ctx.measureText(w).width);
    let total = widths.reduce((a, b) => a + b, 0) + space * (chunk.length - 1);
    const maxW = this.W - 140 * u;
    const sc = total > maxW ? maxW / total : 1;
    total *= sc;
    const padX = 34 * u, padY = 22 * u;
    const bh = size * sc + padY * 2;
    const bottom = this.portrait ? 300 * u : this.landscape ? 70 * u : 90 * u;
    const by = this.H - bottom - bh;
    ctx.fillStyle = "rgba(10,10,16,0.72)";
    roundRect(ctx, this.W / 2 - total / 2 - padX, by, total + padX * 2, bh, 22 * u);
    ctx.fill();
    ctx.font = `700 ${Math.round(size * sc)}px ${this.fonts.body}`;
    ctx.textBaseline = "middle";
    let x = this.W / 2 - total / 2;
    chunk.forEach((w, k) => {
      const gi = ci * per + k;
      ctx.fillStyle = gi === wordIdx ? this.pal.accent : gi < wordIdx ? "#FFFFFF" : "rgba(255,255,255,0.7)";
      ctx.fillText(w, x, by + bh / 2 + 2 * u);
      x += (widths[k] + space) * sc;
    });
    ctx.restore();
  }

  // ---------- frame ----------
  draw(ctx: Ctx, t: number) {
    t = clamp(t, 0, this.total - 1e-3);
    const i = this.sceneAt(t);
    const lt = t - this.starts[i];
    const s = this.plan.scenes[i];
    if (i > 0 && lt < TRANSITION_S) {
      const e = easeInOut(lt / TRANSITION_S);
      const prev = i - 1;
      const a = this.offA.getContext("2d")!;
      const b = this.offB.getContext("2d")!;
      a.save(); this.drawScene(a, prev, this.plan.scenes[prev].duration + lt); a.restore();
      b.save(); this.drawScene(b, i, lt); b.restore();
      ctx.save();
      switch (s.transition) {
        case "slide":
          ctx.drawImage(this.offA, -this.W * e, 0);
          ctx.drawImage(this.offB, this.W * (1 - e), 0);
          break;
        case "zoom":
          ctx.drawImage(this.offA, 0, 0);
          ctx.globalAlpha = e;
          ctx.translate(this.W / 2, this.H / 2);
          ctx.scale(0.88 + 0.12 * e, 0.88 + 0.12 * e);
          ctx.drawImage(this.offB, -this.W / 2, -this.H / 2);
          break;
        case "wipe": {
          ctx.drawImage(this.offA, 0, 0);
          ctx.beginPath();
          ctx.arc(this.W / 2, this.H / 2, e * Math.hypot(this.W, this.H) * 0.55, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(this.offB, 0, 0);
          break;
        }
        default:
          ctx.drawImage(this.offA, 0, 0);
          ctx.globalAlpha = e;
          ctx.drawImage(this.offB, 0, 0);
      }
      ctx.restore();
    } else {
      ctx.save();
      this.drawScene(ctx, i, lt);
      ctx.restore();
    }
    // fade in from black / out to black
    const fadeIn = 1 - clamp(t / 0.35);
    const fadeOut = clamp((t - (this.total - 0.5)) / 0.5);
    const f = Math.max(fadeIn, fadeOut);
    if (f > 0) {
      ctx.fillStyle = `rgba(0,0,0,${f})`;
      ctx.fillRect(0, 0, this.W, this.H);
    }
    if (this.opts.captions) this.drawCaptions(ctx, t);
  }
}
