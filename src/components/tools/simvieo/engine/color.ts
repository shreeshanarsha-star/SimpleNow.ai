// Colour utilities + palette construction + brand-colour extraction from a logo.
import type { Palette, StyleId } from "@/lib/simvieo/types";

type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: RGB) {
  return "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
}

export function mix(a: string, b: string, t: number) {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

export function rgba(hex: string, a: number) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function lin(c: number) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a: string, b: string) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number) {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return rgbToHex([f(0) * 255, f(8) * 255, f(4) * 255]);
}

// Nudge a colour lighter/darker until it reaches the target contrast on bg.
export function ensureContrast(fg: string, bg: string, target: number) {
  let [h, s, l] = rgbToHsl(hexToRgb(fg));
  const darkBg = luminance(bg) < 0.4;
  for (let i = 0; i < 20 && contrast(hslToHex(h, s, l), bg) < target; i++) {
    l = darkBg ? Math.min(0.95, l + 0.04) : Math.max(0.05, l - 0.04);
  }
  return hslToHex(h, s, l);
}

const DEFAULTS: Record<StyleId, { primary: string; accent: string; dark: boolean }> = {
  showcase: { primary: "#7C5CFF", accent: "#22D3EE", dark: true },
  kinetic: { primary: "#FF4D2E", accent: "#FFD23F", dark: true },
  corporate: { primary: "#2563EB", accent: "#10B981", dark: false },
  social: { primary: "#FF2E7E", accent: "#8B5CF6", dark: true },
};

export function buildPalette(style: StyleId, brand: string[]): Palette {
  const d = DEFAULTS[style];
  const primary = brand[0] || d.primary;
  const second = brand[1] || (brand[0] ? rotateHue(brand[0], 0.08) : d.accent);
  const bg = d.dark ? mix("#07070C", primary, 0.1) : mix("#F7F8FB", primary, 0.03);
  const bg2 = d.dark ? mix("#07070C", primary, 0.28) : mix("#FFFFFF", primary, 0.1);
  const text = d.dark ? "#FFFFFF" : "#0E1424";
  const textMuted = d.dark ? "#C9CBD8" : "#475069";
  const accent = ensureContrast(brand[1] || d.accent, bg, 3);
  return {
    primary,
    secondary: second,
    accent,
    bg,
    bg2,
    text,
    textMuted,
    onPrimary: contrast("#FFFFFF", primary) >= 3 ? "#FFFFFF" : "#0E1424",
  };
}

function rotateHue(hex: string, by: number) {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  return hslToHex((h + by) % 1, Math.min(1, s * 1.05), l);
}

// Dominant saturated colours of a logo (ignores transparent / near-white /
// near-black / grey pixels). Returns up to 2 hex colours.
export function extractBrandColors(img: CanvasImageSource & { width: number; height: number }): string[] {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 160) continue;
    const [, s, l] = rgbToHsl([r, g, b]);
    if (s < 0.25 || l < 0.12 || l > 0.9) continue;
    const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
    const e = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    buckets.set(key, e);
  }
  const sorted = Array.from(buckets.values()).sort((a, b) => b.n - a.n);
  const out: string[] = [];
  for (const e of sorted) {
    const hex = rgbToHex([e.r / e.n, e.g / e.n, e.b / e.n]);
    if (out.every((o) => colorDistance(o, hex) > 80)) out.push(hex);
    if (out.length === 2) break;
  }
  return out;
}

function colorDistance(a: string, b: string) {
  const x = hexToRgb(a), y = hexToRgb(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}
