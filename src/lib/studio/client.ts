"use client";
// Presenter Studio — browser helpers.
import { loadPdfJs, pageText } from "@/lib/presenter/client";

export { api } from "@/lib/presenter/client";

export const jsonInit = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export async function openPdfData(data: ArrayBuffer | string): Promise<any> {
  const pdfjs = await loadPdfJs();
  return typeof data === "string" ? pdfjs.getDocument({ url: data }).promise : pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
}

/** Text of every page (for the script and the Library). */
export async function extractPages(doc: any): Promise<string[]> {
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    // Letter-spaced headings ("A S K  A N Y T H I N G") are joined back up.
    const t = (await pageText(doc, i)).replace(/\b(?:[A-Z] ){3,}[A-Z]\b/g, (m: string) => m.replace(/ /g, ""));
    out.push(t.slice(0, 4000));
  }
  return out;
}

/** Render one page into a canvas, fitted to maxW × maxH. Independent per canvas. */
const tasks = new WeakMap<HTMLCanvasElement, { cancel: () => void; promise: Promise<unknown> }>();
const seqs = new WeakMap<HTMLCanvasElement, number>();
export async function drawPage(doc: any, pageNo: number, canvas: HTMLCanvasElement, maxW: number, maxH: number) {
  const my = (seqs.get(canvas) || 0) + 1;
  seqs.set(canvas, my);
  const prev = tasks.get(canvas);
  if (prev) {
    prev.cancel();
    await prev.promise.catch(() => {});
  }
  if (seqs.get(canvas) !== my) return;
  const page = await doc.getPage(pageNo);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const base = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: Math.min(maxW / base.width, maxH / base.height) * dpr });
  const off = document.createElement("canvas");
  off.width = Math.floor(vp.width);
  off.height = Math.floor(vp.height);
  const ctx = off.getContext("2d");
  if (!ctx) return;
  const task = page.render({ canvasContext: ctx, viewport: vp });
  tasks.set(canvas, { cancel: () => task.cancel(), promise: task.promise });
  try {
    await task.promise;
  } catch {
    return;
  }
  if (seqs.get(canvas) !== my) return;
  canvas.width = off.width;
  canvas.height = off.height;
  canvas.style.width = `${Math.floor(vp.width / dpr)}px`;
  canvas.style.height = `${Math.floor(vp.height / dpr)}px`;
  canvas.getContext("2d")?.drawImage(off, 0, 0);
}

const TOKEN_KEY = "studio-device-token";
export function deviceToken() {
  let t = "";
  try {
    t = localStorage.getItem(TOKEN_KEY) || "";
  } catch {}
  if (!t) {
    t = (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(/[^a-zA-Z0-9-]/g, "") + Math.random().toString(36).slice(2, 8);
    try {
      localStorage.setItem(TOKEN_KEY, t);
    } catch {}
  }
  return t;
}

export function uid() {
  return Math.random().toString(36).slice(2, 9);
}
