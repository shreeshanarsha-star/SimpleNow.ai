"use client";
// Presenter.ai — browser helpers shared by the TV, control and console pages.
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type PresenterCommand =
  | { type: "wake" }
  | { type: "standby" }
  | { type: "start" }
  | { type: "present" }
  | { type: "next" }
  | { type: "prev" }
  | { type: "goto"; idx: number }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "stop" }
  | { type: "say"; text: string }
  | { type: "direct"; text: string }
  | { type: "mic"; on: boolean }
  | { type: "layout"; layout: "slides" | "twin" | "handover" | "hub" }
  | { type: "auto"; on: boolean }
  | { type: "reconnect" }
  | { type: "hub" }
  | { type: "intros"; on: boolean }
  | { type: "skip-montage" }
  | { type: "sound"; volume?: number; muted?: boolean }
  | { type: "cue"; cue: "snap" | "reveal" | "tick" | "correct" | "drumroll" | "win" | "whoosh" | "pop" }
  | { type: "entrance-test"; on: boolean }
  | { type: "entrance-sens"; level: "low" | "med" | "high" }
  | { type: "flyer-build"; inputs: { name: string; date: string; venue: string; highlights: string[] } };

export type PresenterStatus = {
  connected: boolean;
  speaking: boolean;
  paused: boolean;
  auto: boolean;
  micOn: boolean;
  layout: "standby" | "slides" | "twin" | "handover" | "hub" | "montage";
  slide: number;
  slideCount: number;
  lastHeard?: string;
  lastSaid?: string;
  note?: string;
  /** Dark-screen entrance listeners (snap + "Hey Shree"). */
  listening?: { snap: boolean; voice: boolean; test: boolean; sens: "low" | "med" | "high" } | null;
  /** How Shree was brought in: "snap" | "voice" | "button". */
  entrance?: string;
  /** Latest test-mode detection, e.g. "Snap detected (strength 0.41)". */
  testHit?: string;
  intros?: boolean;
  introSaved?: string;
  sound?: { volume: number; muted: boolean };
  at: number;
};

export async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || `Request failed (${res.status})`);
  return data as T;
}

export function presenterChannel(sessionId: string): RealtimeChannel {
  const sb = createClient();
  return sb.channel(`presenter-${sessionId}`, { config: { broadcast: { self: false, ack: false } } });
}

/* ---------------- PDF (pdf.js, loaded lazily in the browser) ---------------- */

const PDFJS_VERSION = "4.10.38";
let pdfjsPromise: Promise<any> | null = null;

export function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((m) => {
      m.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;
      return m;
    });
  }
  return pdfjsPromise;
}

export async function openPdf(url: string): Promise<any> {
  const pdfjs = await loadPdfJs();
  return pdfjs.getDocument({ url }).promise;
}

export async function pageText(doc: any, pageNo: number): Promise<string> {
  const page = await doc.getPage(pageNo);
  const tc = await page.getTextContent();
  let out = "";
  for (const it of tc.items as Array<{ str?: string; hasEOL?: boolean }>) {
    out += (it.str || "") + (it.hasEOL ? "\n" : " ");
  }
  return out.replace(/[ \t]+/g, " ").replace(/\n\s+/g, "\n").trim();
}

// Only one render per canvas at a time: overlapping pdf.js renders on the same
// canvas corrupt its transform (slides drawn upside down or half-drawn).
const renderTasks = new WeakMap<HTMLCanvasElement, { cancel: () => void; promise: Promise<unknown> }>();
let renderSeq = 0;

export async function renderPage(doc: any, pageNo: number, canvas: HTMLCanvasElement, maxW: number, maxH: number) {
  const mySeq = ++renderSeq;
  const prev = renderTasks.get(canvas);
  if (prev) {
    prev.cancel();
    await prev.promise.catch(() => {});
  }
  if (mySeq !== renderSeq) return; // a newer slide was requested meanwhile
  const page = await doc.getPage(pageNo);
  if (mySeq !== renderSeq) return;
  const dpr = window.devicePixelRatio || 1;
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(maxW / base.width, maxH / base.height) * dpr;
  const vp = page.getViewport({ scale });
  // Draw off-screen first, then copy, so the visible slide never flashes or flips.
  const off = document.createElement("canvas");
  off.width = Math.floor(vp.width);
  off.height = Math.floor(vp.height);
  const octx = off.getContext("2d");
  if (!octx) return;
  const task = page.render({ canvasContext: octx, viewport: vp });
  renderTasks.set(canvas, { cancel: () => task.cancel(), promise: task.promise });
  try {
    await task.promise;
  } catch {
    return; // cancelled by a newer render
  } finally {
    if (renderTasks.get(canvas)?.promise === task.promise) renderTasks.delete(canvas);
  }
  if (mySeq !== renderSeq) return;
  canvas.width = off.width;
  canvas.height = off.height;
  canvas.style.width = `${Math.floor(vp.width / dpr)}px`;
  canvas.style.height = `${Math.floor(vp.height / dpr)}px`;
  canvas.getContext("2d")?.drawImage(off, 0, 0);
}

const BRIDGES = [
  "Good one, let me think about that.",
  "Hmm, interesting.",
  "Right, give me a second on that one.",
  "Okay, fair question.",
  "Ah, I like that.",
];
let lastBridge = -1;
export function bridgePhrase() {
  let i = Math.floor(Math.random() * BRIDGES.length);
  if (i === lastBridge) i = (i + 1) % BRIDGES.length;
  lastBridge = i;
  return BRIDGES[i];
}
