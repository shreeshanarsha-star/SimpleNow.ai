// Client-side asset prep. Nothing here leaves the browser except the small
// low-res JPEG previews sent to the AI director so it can "see" the product.
import type { ImgAsset, LogoAsset } from "./render";

const MAX_SIDE = 1600;

export async function fileToImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } catch {
    URL.revokeObjectURL(url);
    throw new Error(`Couldn't read ${file.name}. Use a JPG, PNG or WebP image.`);
  }
}

function canvasOf(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function downscale(img: HTMLImageElement, maxSide: number) {
  const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const c = canvasOf(img.naturalWidth * s, img.naturalHeight * s);
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

// Cheap, cross-browser blur: shrink hard, then scale back up with smoothing.
function makeBlur(src: HTMLCanvasElement) {
  const tiny = canvasOf(Math.max(8, src.width / 40), Math.max(8, src.height / 40));
  tiny.getContext("2d")!.drawImage(src, 0, 0, tiny.width, tiny.height);
  const mid = canvasOf(tiny.width * 4, tiny.height * 4);
  const m = mid.getContext("2d")!;
  m.imageSmoothingQuality = "high";
  m.drawImage(tiny, 0, 0, mid.width, mid.height);
  const out = canvasOf(Math.min(640, src.width), Math.min(640, src.width) * (src.height / src.width));
  const o = out.getContext("2d")!;
  o.imageSmoothingQuality = "high";
  o.drawImage(mid, 0, 0, out.width, out.height);
  return out;
}

export async function prepareImage(file: File): Promise<{ asset: ImgAsset; preview: string; thumb: string }> {
  const img = await fileToImage(file);
  const big = downscale(img, MAX_SIDE);
  const small = downscale(img, 512);
  const thumb = downscale(img, 200).toDataURL("image/jpeg", 0.8);
  URL.revokeObjectURL(img.src);
  const { packshot, edge } = detectPackshot(big);
  return {
    asset: { src: big, w: big.width, h: big.height, blur: makeBlur(big), packshot, edge },
    preview: small.toDataURL("image/jpeg", 0.72),
    thumb,
  };
}

export async function prepareLogo(file: File): Promise<{ asset: LogoAsset; image: HTMLCanvasElement; thumb: string }> {
  const img = await fileToImage(file);
  const big = downscale(img, 800);
  const thumb = downscale(img, 200).toDataURL("image/png");
  URL.revokeObjectURL(img.src);
  const ctx = big.getContext("2d", { willReadFrequently: true })!;
  const { width: w, height: h } = big;
  const corners = [
    ctx.getImageData(1, 1, 1, 1).data,
    ctx.getImageData(w - 2, 1, 1, 1).data,
    ctx.getImageData(1, h - 2, 1, 1).data,
    ctx.getImageData(w - 2, h - 2, 1, 1).data,
  ];
  const opaqueCorners = corners.filter((c) => c[3] > 200).length >= 3;
  const data = ctx.getImageData(0, 0, w, h).data;
  let lum = 0, n = 0;
  for (let i = 0; i < data.length; i += 16) {
    if (data[i + 3] < 128) continue;
    lum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    n++;
  }
  const avg = n ? lum / n : 1;
  return {
    asset: { src: big, w, h, blur: big, needsBadge: opaqueCorners || avg < 0.3 },
    image: big,
    thumb,
  };
}

// A product shot on a plain backdrop (typical e-commerce image) has a near-
// uniform border. Those are shown whole, never cropped by Ken Burns.
function detectPackshot(src: HTMLCanvasElement): { packshot: boolean; edge: string } {
  const n = 48;
  const c = canvasOf(n, n);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, n, n);
  const d = ctx.getImageData(0, 0, n, n).data;
  const px: number[][] = [];
  for (let i = 0; i < n; i++) {
    for (const [x, y] of [[i, 0], [i, n - 1], [0, i], [n - 1, i]]) {
      const k = (y * n + x) * 4;
      px.push([d[k], d[k + 1], d[k + 2]]);
    }
  }
  const mean = [0, 1, 2].map((ch) => px.reduce((a, p) => a + p[ch], 0) / px.length);
  const sd = Math.sqrt(px.reduce((a, p) => a + [0, 1, 2].reduce((b, ch) => b + (p[ch] - mean[ch]) ** 2, 0), 0) / (px.length * 3));
  const edge = "#" + mean.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  return { packshot: sd < 22, edge };
}
