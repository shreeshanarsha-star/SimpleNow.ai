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
  | { type: "hub" };

export type PresenterStatus = {
  connected: boolean;
  speaking: boolean;
  paused: boolean;
  auto: boolean;
  micOn: boolean;
  layout: "standby" | "slides" | "twin" | "handover" | "hub";
  slide: number;
  slideCount: number;
  lastHeard?: string;
  lastSaid?: string;
  note?: string;
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

export async function renderPage(doc: any, pageNo: number, canvas: HTMLCanvasElement, maxW: number, maxH: number) {
  const page = await doc.getPage(pageNo);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(maxW / base.width, maxH / base.height) * (window.devicePixelRatio || 1);
  const vp = page.getViewport({ scale });
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  canvas.style.width = `${Math.floor(vp.width / (window.devicePixelRatio || 1))}px`;
  canvas.style.height = `${Math.floor(vp.height / (window.devicePixelRatio || 1))}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
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
