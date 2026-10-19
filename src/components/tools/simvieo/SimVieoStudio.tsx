"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import {
  SCENE_LABELS,
  STYLE_LABELS,
  type Palette,
  type Plan,
  type Scene,
  type StyleId,
  type VideoFormat,
} from "@/lib/simvieo/types";
import { buildPalette, extractBrandColors } from "./engine/color";
import { prepareImage, prepareLogo } from "./engine/assets";
import { Renderer, type Assets, type ImgAsset, type LogoAsset, DIMENSIONS } from "./engine/render";
import { buildSoundtrack, decodeBase64Audio, decodeFileAudio } from "./engine/audio";
import { exportVideo } from "./engine/export";
import { reviewQuality, type QualityItem } from "./engine/quality";
import { ensureFontsLoaded, FONTS } from "./fonts";

type Duration = 15 | 30 | 45 | 60;
type Phase = "idle" | "planning" | "voicing" | "mixing" | "ready" | "exporting";

interface UploadedImage {
  id: string;
  asset: ImgAsset;
  preview: string;
  thumb: string;
}

const VOICES = [
  { id: "nova", label: "Warm (female)" },
  { id: "onyx", label: "Deep (male)" },
  { id: "alloy", label: "Neutral" },
  { id: "shimmer", label: "Bright (female)" },
];

const SAMPLE = {
  idea: "Tulsi Glow — an Ayurvedic herbal tea with tulsi, ginger and lemongrass that helps busy professionals feel calm and refreshed",
  content:
    "100% natural ingredients. No added sugar. Ready in 3 minutes. 20 tea bags per box. Sourced from organic farms in Kerala. Perfect for a mid-afternoon reset instead of another coffee.",
  brandName: "Tulsi Glow",
  website: "tulsiglow.in",
};

const PHASE_TEXT: Record<Phase, string> = {
  idle: "",
  planning: "Directing your video — writing the hook, script and scenes…",
  voicing: "Recording the voiceover…",
  mixing: "Composing music and sound design…",
  ready: "",
  exporting: "Rendering your MP4…",
};

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

function Chip({ active, onClick, children, disabled }: { active: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition ${
        active ? "bg-brand text-white border-brand" : "bg-surface text-ink-2 border-border hover:border-brand/50"
      } disabled:opacity-50`}
    >
      {children}
    </button>
  );
}

function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer select-none">
      <span
        role="switch"
        aria-checked={on}
        tabIndex={0}
        onKeyDown={(e) => (e.key === " " || e.key === "Enter") && onChange(!on)}
        onClick={() => onChange(!on)}
        className={`mt-0.5 w-9 h-5 rounded-full relative transition flex-shrink-0 ${on ? "bg-brand" : "bg-border-strong"}`}
      >
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
      </span>
      <span className="text-[13px] text-ink leading-tight">
        {label}
        {hint && <span className="block text-[11px] text-ink-muted mt-0.5">{hint}</span>}
      </span>
    </label>
  );
}

export default function SimVieoStudio() {
  // ---------- brief ----------
  const [idea, setIdea] = useState("");
  const [content, setContent] = useState("");
  const [instructions, setInstructions] = useState("");
  const [brandName, setBrandName] = useState("");
  const [website, setWebsite] = useState("");
  const [duration, setDuration] = useState<Duration>(30);
  const [format, setFormat] = useState<VideoFormat>("9:16");
  const [style, setStyle] = useState<StyleId | "auto">("auto");
  const [voiceOn, setVoiceOn] = useState(true);
  const [voice, setVoice] = useState("nova");
  const [musicOn, setMusicOn] = useState(true);
  const [sfxOn, setSfxOn] = useState(true);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [brandColors, setBrandColors] = useState<string[]>([]);
  const [colorsTouched, setColorsTouched] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [logo, setLogo] = useState<{ asset: LogoAsset; thumb: string } | null>(null);
  const [customMusic, setCustomMusic] = useState<{ name: string; buffer: AudioBuffer } | null>(null);

  // ---------- production ----------
  const [plan, setPlan] = useState<Plan | null>(null);
  const [voiceClips, setVoiceClips] = useState<Record<string, AudioBuffer>>({});
  const [soundtrack, setSoundtrack] = useState<AudioBuffer | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [quality, setQuality] = useState<QualityItem[]>([]);
  const [voiceFixes, setVoiceFixes] = useState(0);
  const [progress, setProgress] = useState(0);
  const [hq, setHq] = useState(true);
  const [download, setDownload] = useState<{ url: string; name: string; size: number; method: string } | null>(null);
  const [busyScene, setBusyScene] = useState<number | null>(null);
  const [openScene, setOpenScene] = useState<number | null>(null);
  const [voiceStale, setVoiceStale] = useState(false);

  // ---------- playback ----------
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const timeRef = useRef(0);
  const playRef = useRef<{ ac: AudioContext; src: AudioBufferSourceNode | null; startedAt: number; offset: number } | null>(null);
  const rafRef = useRef<number>(0);
  const cancelRef = useRef({ cancelled: false });

  const fonts = FONTS;
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    try {
      const lowEnd = (navigator.hardwareConcurrency || 8) <= 4 || ((navigator as unknown as { deviceMemory?: number }).deviceMemory || 8) <= 4;
      if (lowEnd) setHq(false);
    } catch {}
    ensureFontsLoaded().then(() => setFontsReady(true));
  }, []);

  const palette: Palette | null = useMemo(() => (plan ? buildPalette(plan.style, brandColors) : null), [plan, brandColors]);
  const assets: Assets = useMemo(() => ({ images: images.map((i) => i.asset), logo: logo?.asset }), [images, logo]);

  const voiceLengths = useMemo(
    () => (plan ? plan.scenes.map((s) => voiceClips[`${s.id}|${s.voice}`]?.duration ?? null) : []),
    [plan, voiceClips]
  );

  const previewRenderer = useMemo(() => {
    if (!plan || !palette) return null;
    return new Renderer(format, plan, palette, assets, fonts, { captions: captionsOn, watermarkLogo: true, voiceLengths }, 0.5);
    // fontsReady: rebuild once web fonts arrive so text metrics are right.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, palette, assets, fonts, captionsOn, voiceLengths, format, fontsReady]);

  // ---------- drawing ----------
  const drawAt = useCallback(
    (t: number) => {
      const c = canvasRef.current;
      if (!c || !previewRenderer) return;
      if (c.width !== previewRenderer.W || c.height !== previewRenderer.H) {
        c.width = previewRenderer.W;
        c.height = previewRenderer.H;
      }
      previewRenderer.draw(c.getContext("2d")!, t);
    },
    [previewRenderer]
  );

  useEffect(() => {
    if (!playing) drawAt(timeRef.current);
  }, [drawAt, playing]);

  const stopPlayback = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    const p = playRef.current;
    if (p?.src) {
      try {
        p.src.stop();
      } catch {}
      p.src = null;
    }
    setPlaying(false);
  }, []);

  const startPlayback = useCallback(
    (from: number) => {
      if (!previewRenderer) return;
      stopPlayback();
      const total = previewRenderer.total;
      if (from >= total - 0.05) from = 0;
      let p = playRef.current;
      if (!p) {
        p = { ac: new AudioContext(), src: null, startedAt: 0, offset: 0 };
        playRef.current = p;
      }
      const ac = p.ac;
      ac.resume();
      if (soundtrack) {
        const src = ac.createBufferSource();
        src.buffer = soundtrack;
        src.connect(ac.destination);
        src.start(ac.currentTime + 0.03, from);
        p.src = src;
      }
      p.startedAt = ac.currentTime + 0.03;
      p.offset = from;
      setPlaying(true);
      const tick = () => {
        const t = Math.max(0, p!.offset + (ac.currentTime - p!.startedAt));
        timeRef.current = t;
        setTime(t);
        drawAt(t);
        if (t >= total) {
          stopPlayback();
          timeRef.current = total;
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [previewRenderer, soundtrack, drawAt, stopPlayback]
  );

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    playRef.current?.ac.close().catch(() => {});
  }, []);

  const seek = (t: number) => {
    timeRef.current = t;
    setTime(t);
    if (playing) startPlayback(t);
    else drawAt(t);
  };

  // ---------- uploads ----------
  const onImages = async (files: FileList | null) => {
    if (!files) return;
    setError("");
    const room = 6 - images.length;
    const list = Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, room);
    for (const f of list) {
      if (f.size > 15 * 1024 * 1024) {
        setError(`${f.name} is larger than 15 MB.`);
        continue;
      }
      try {
        const r = await prepareImage(f);
        setImages((prev) => [...prev, { id: Math.random().toString(36).slice(2), ...r }].slice(0, 6));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't read that image.");
      }
    }
  };

  const onLogo = async (file: File | undefined) => {
    if (!file) return;
    try {
      const r = await prepareLogo(file);
      setLogo({ asset: r.asset, thumb: r.thumb });
      if (!colorsTouched) setBrandColors(extractBrandColors(r.image));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read the logo.");
    }
  };

  const onMusic = async (file: File | undefined) => {
    if (!file) return;
    try {
      const buffer = await decodeFileAudio(file);
      setCustomMusic({ name: file.name, buffer });
    } catch {
      setError("Couldn't read that audio file. Use MP3, WAV or M4A.");
    }
  };

  // ---------- production pipeline ----------
  const briefPayload = useCallback(
    () => ({
      idea,
      content,
      instructions,
      brandName,
      website,
      duration,
      format,
      style,
      imageCount: images.length,
      hasLogo: !!logo,
    }),
    [idea, content, instructions, brandName, website, duration, format, style, images.length, logo]
  );

  // Fit scene durations to narration, then mix the soundtrack.
  const produce = useCallback(
    async (p: Plan, clips: Record<string, AudioBuffer>) => {
      let fixes = 0;
      const scenes = p.scenes.map((s) => {
        const clip = clips[`${s.id}|${s.voice}`];
        const need = clip ? clip.duration + 0.25 + 0.35 : 0;
        if (need > s.duration) {
          fixes++;
          return { ...s, duration: Math.round(need * 10) / 10 };
        }
        return s;
      });
      const fitted: Plan = { ...p, scenes };
      setVoiceFixes(fixes);
      setPhase("mixing");
      const starts: number[] = [];
      let acc = 0;
      scenes.forEach((s) => {
        starts.push(acc);
        acc += s.duration;
      });
      const track = await buildSoundtrack({
        plan: fitted,
        total: acc,
        starts,
        music: musicOn,
        sfx: sfxOn,
        voice: scenes.map((s) => clips[`${s.id}|${s.voice}`] || null),
        customMusic: musicOn ? customMusic?.buffer : null,
      });
      setPlan(fitted);
      setSoundtrack(track);
      setPhase("ready");
      return fitted;
    },
    [musicOn, sfxOn, customMusic]
  );

  const recordVoice = useCallback(
    async (p: Plan, existing: Record<string, AudioBuffer>) => {
      const missing = p.scenes.map((s) => (existing[`${s.id}|${s.voice}`] ? "" : s.voice));
      if (!missing.some(Boolean)) return existing;
      setPhase("voicing");
      const res = await fetch("/api/simvieo/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: missing, voice, mood: p.mood }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(data.error || "Voiceover unavailable — your video has captions and music instead.");
        return existing;
      }
      const next = { ...existing };
      await Promise.all(
        p.scenes.map(async (s, i) => {
          const b64 = data.clips?.[i];
          if (!b64) return;
          try {
            next[`${s.id}|${s.voice}`] = await decodeBase64Audio(b64);
          } catch {}
        })
      );
      if (data.truncated) setNotice("Voiceover covers the main scenes; the rest is captioned (free voice limit per video).");
      return next;
    },
    [voice]
  );

  const createVideo = async (variation?: string) => {
    if (!idea.trim()) {
      setError("Tell SimVieo what you're promoting first.");
      return;
    }
    stopPlayback();
    setError("");
    setNotice("");
    setDownload(null);
    setVoiceStale(false);
    setPhase("planning");
    try {
      await ensureFontsLoaded();
      const res = await fetch("/api/simvieo/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: briefPayload(), images: images.map((i) => i.preview), variation }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.plan) throw new Error(data.error || "Couldn't plan the video. Please try again.");
      if (data.notice) setNotice(data.notice);
      const p: Plan = data.plan;
      const clips = voiceOn ? await recordVoice(p, {}) : {};
      setVoiceClips(clips);
      await produce(p, clips);
      timeRef.current = 0;
      setTime(0);
      setOpenScene(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setPhase(plan ? "ready" : "idle");
    }
  };

  // Rebuild audio when sound options change on an existing plan.
  const firstMix = useRef(true);
  useEffect(() => {
    if (firstMix.current) {
      firstMix.current = false;
      return;
    }
    if (plan && phase === "ready") produce(plan, voiceClips).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musicOn, sfxOn, customMusic]);

  // Voiceover toggled on an existing cut: off removes narration now; on
  // offers a one-click "Update voiceover" (it costs an AI call, so not automatic).
  const firstVoice = useRef(true);
  useEffect(() => {
    if (firstVoice.current) {
      firstVoice.current = false;
      return;
    }
    if (!plan || phase !== "ready") return;
    if (!voiceOn) {
      setVoiceClips({});
      setVoiceStale(false);
      produce(plan, {}).catch(() => {});
    } else {
      setVoiceStale(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceOn]);

  // Quality review whenever the cut changes.
  useEffect(() => {
    if (!plan || !palette || !previewRenderer || phase !== "ready") return;
    const r = new Renderer(format, plan, palette, assets, fonts, { captions: captionsOn, watermarkLogo: true, voiceLengths }, 0.25);
    setQuality(reviewQuality(plan, palette, r, duration, { hasLogo: !!logo, imageCount: images.length, voiceFixes }));
  }, [plan, palette, previewRenderer, phase, format, assets, fonts, captionsOn, voiceLengths, duration, logo, images.length, voiceFixes]);

  const updateScene = (i: number, patch: Partial<Scene>) => {
    if (!plan) return;
    stopPlayback();
    const scenes = plan.scenes.map((s, k) => (k === i ? { ...s, ...patch } : s));
    if (patch.voice !== undefined && voiceOn) setVoiceStale(true);
    setPlan({ ...plan, scenes });
    setDownload(null);
  };

  const applyVoiceChanges = async () => {
    if (!plan) return;
    setError("");
    const clips = await recordVoice(plan, voiceClips);
    setVoiceClips(clips);
    await produce(plan, clips);
    setVoiceStale(false);
  };

  const regenerateScene = async (i: number) => {
    if (!plan) return;
    stopPlayback();
    setBusyScene(i);
    setError("");
    try {
      const res = await fetch("/api/simvieo/scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: briefPayload(), plan, index: i }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.scene) throw new Error(data.error || "Couldn't rewrite that scene.");
      const scenes = plan.scenes.map((s, k) => (k === i ? data.scene : s));
      const p = { ...plan, scenes };
      const clips = voiceOn ? await recordVoice(p, voiceClips) : voiceClips;
      setVoiceClips(clips);
      await produce(p, clips);
      seek(p.scenes.slice(0, i).reduce((a, s) => a + s.duration, 0));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't rewrite that scene.");
    } finally {
      setBusyScene(null);
      setPhase("ready");
    }
  };

  const doExport = async () => {
    if (!plan || !palette) return;
    stopPlayback();
    setError("");
    setPhase("exporting");
    setProgress(0);
    cancelRef.current = { cancelled: false };
    try {
      await ensureFontsLoaded();
      const r = new Renderer(format, plan, palette, assets, fonts, { captions: captionsOn, watermarkLogo: true, voiceLengths }, hq ? 1 : 2 / 3);
      const res = await exportVideo(r, soundtrack, setProgress, cancelRef.current);
      const slug = (plan.brandName || plan.title || "video").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "video";
      const name = `simvieo-${slug}-${format.replace(":", "x")}.${res.ext}`;
      const url = URL.createObjectURL(res.blob);
      if (download) URL.revokeObjectURL(download.url);
      setDownload({ url, name, size: res.blob.size, method: res.codec });
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      if (!(e instanceof Error && e.message === "cancelled")) {
        setError(e instanceof Error ? e.message : "Export failed.");
      }
    } finally {
      setPhase("ready");
    }
  };

  const clearAll = () => {
    stopPlayback();
    if (download) URL.revokeObjectURL(download.url);
    setDownload(null);
    setPlan(null);
    setSoundtrack(null);
    setVoiceClips({});
    setImages([]);
    setLogo(null);
    setCustomMusic(null);
    setQuality([]);
    setPhase("idle");
    setNotice("");
    setError("");
    timeRef.current = 0;
    setTime(0);
  };

  const busy = phase === "planning" || phase === "voicing" || phase === "mixing" || phase === "exporting";
  const total = previewRenderer?.total || duration;
  const sceneNow = previewRenderer ? previewRenderer.sceneAt(time) : -1;
  const [dw, dh] = DIMENSIONS[format];

  // ---------- UI ----------
  return (
    <div className={`grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-5`} style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* Brief */}
      <section className="bg-surface border border-border rounded-lg shadow-soft-sm p-4 sm:p-5 flex flex-col gap-4 h-fit">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-bold text-ink">Your brief</h2>
          <button
            type="button"
            className="text-[12px] font-semibold text-brand hover:underline"
            onClick={() => {
              setIdea(SAMPLE.idea);
              setContent(SAMPLE.content);
              setBrandName(SAMPLE.brandName);
              setWebsite(SAMPLE.website);
            }}
          >
            Try a sample
          </button>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-ink-2">What are you promoting? *</span>
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            rows={3}
            maxLength={600}
            placeholder="e.g. A cold-pressed coconut oil for skin and hair, made in small batches in Kerala"
            className="w-full rounded-md border border-border bg-page px-3 py-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-ink-2">Details, features or copy (optional)</span>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            maxLength={3000}
            placeholder="Paste product details, key benefits, offers, numbers…"
            className="w-full rounded-md border border-border bg-page px-3 py-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-ink-2">Brand name</span>
            <input value={brandName} onChange={(e) => setBrandName(e.target.value)} maxLength={60} className="rounded-md border border-border bg-page px-3 py-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-brand/30" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-ink-2">Website / CTA</span>
            <input value={website} onChange={(e) => setWebsite(e.target.value)} maxLength={100} placeholder="yourbrand.com" className="rounded-md border border-border bg-page px-3 py-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-brand/30" />
          </label>
        </div>

        {/* images */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-ink-2">Product images (up to 6)</span>
          <div className="grid grid-cols-6 gap-2">
            {images.map((im) => (
              <div key={im.id} className="relative aspect-square rounded-md overflow-hidden border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={im.thumb} alt="" className="w-full h-full object-cover" />
                <button
                  type="button"
                  aria-label="Remove image"
                  onClick={() => setImages((prev) => prev.filter((x) => x.id !== im.id))}
                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 text-white text-[11px] leading-5"
                >
                  ×
                </button>
              </div>
            ))}
            {images.length < 6 && (
              <label className="aspect-square rounded-md border border-dashed border-border-strong flex items-center justify-center text-ink-muted hover:border-brand hover:text-brand cursor-pointer text-[20px]">
                +
                <input type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(e) => { onImages(e.target.files); e.target.value = ""; }} />
              </label>
            )}
          </div>
        </div>

        {/* logo + colours */}
        <div className="flex items-center gap-3">
          <label className="w-14 h-14 rounded-md border border-dashed border-border-strong flex items-center justify-center cursor-pointer overflow-hidden bg-page hover:border-brand flex-shrink-0">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo.thumb} alt="Logo" className="max-w-full max-h-full object-contain" />
            ) : (
              <span className="text-[10px] text-ink-muted text-center leading-tight">Logo</span>
            )}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => { onLogo(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-semibold text-ink-2">Brand colours</div>
            <div className="flex items-center gap-2 mt-1">
              {[0, 1].map((k) => (
                <input
                  key={k}
                  type="color"
                  aria-label={k ? "Secondary colour" : "Primary colour"}
                  value={brandColors[k] || (k ? "#22D3EE" : "#7C5CFF")}
                  onChange={(e) => {
                    setColorsTouched(true);
                    const next = [...brandColors];
                    next[0] = next[0] || "#7C5CFF";
                    next[k] = e.target.value;
                    setBrandColors(next);
                  }}
                  className="w-8 h-8 rounded border border-border cursor-pointer bg-transparent"
                />
              ))}
              <span className="text-[11px] text-ink-muted">{logo && !colorsTouched ? "Picked from your logo" : brandColors.length ? "Custom" : "Style default"}</span>
              {logo && (
                <button type="button" onClick={() => setLogo(null)} className="ml-auto text-[11px] text-ink-muted hover:text-critical">
                  Remove logo
                </button>
              )}
            </div>
          </div>
        </div>

        {/* format / duration / style */}
        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-semibold text-ink-2">Format</span>
          <div className="flex flex-wrap gap-2">
            {(["9:16", "1:1", "16:9"] as VideoFormat[]).map((f) => (
              <Chip key={f} active={format === f} onClick={() => setFormat(f)} disabled={busy}>
                {f === "9:16" ? "9:16 Reels / Shorts" : f === "1:1" ? "1:1 Feed" : "16:9 YouTube"}
              </Chip>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-semibold text-ink-2">Length</span>
          <div className="flex flex-wrap gap-2">
            {([15, 30, 45, 60] as Duration[]).map((d) => (
              <Chip key={d} active={duration === d} onClick={() => setDuration(d)} disabled={busy}>
                {d}s
              </Chip>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-semibold text-ink-2">Style</span>
          <div className="flex flex-wrap gap-2">
            <Chip active={style === "auto"} onClick={() => setStyle("auto")} disabled={busy}>
              AI picks
            </Chip>
            {(Object.keys(STYLE_LABELS) as StyleId[]).map((s) => (
              <Chip key={s} active={style === s} onClick={() => setStyle(s)} disabled={busy}>
                {STYLE_LABELS[s]}
              </Chip>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-3">
          <Toggle on={voiceOn} onChange={setVoiceOn} label="AI voiceover" hint="Narrates each scene, in sync with captions." />
          {voiceOn && (
            <select value={voice} onChange={(e) => setVoice(e.target.value)} className="ml-11 w-fit rounded-md border border-border bg-page px-2 py-1.5 text-[12px] text-ink">
              {VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          )}
          <Toggle on={musicOn} onChange={setMusicOn} label="Background music" hint="Original music composed for your video's mood." />
          <Toggle on={sfxOn} onChange={setSfxOn} label="Sound effects" hint="Whooshes, risers and a logo hit." />
          <Toggle on={captionsOn} onChange={setCaptionsOn} label="Captions" hint="Most social videos are watched on mute." />
        </div>

        <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="text-left text-[12px] font-semibold text-ink-muted hover:text-ink">
          {showAdvanced ? "▾" : "▸"} Advanced
        </button>
        {showAdvanced && (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-semibold text-ink-2">Instructions for the director</span>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={2}
                maxLength={400}
                placeholder="e.g. Target young mothers. Mention the Diwali offer. Keep it calm and premium."
                className="w-full rounded-md border border-border bg-page px-3 py-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </label>
            <div className="flex items-center gap-2 text-[12px]">
              <label className="px-3 py-1.5 rounded-md border border-border cursor-pointer hover:border-brand text-ink-2 font-semibold">
                Use my own music
                <input type="file" accept="audio/*" className="hidden" onChange={(e) => { onMusic(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
              {customMusic && (
                <span className="text-ink-muted truncate">
                  {customMusic.name}{" "}
                  <button type="button" className="text-critical" onClick={() => setCustomMusic(null)}>
                    remove
                  </button>
                </span>
              )}
            </div>
            <p className="text-[11px] text-ink-muted">Only upload music you have the rights to use.</p>
          </div>
        )}

        <button
          type="button"
          onClick={() => createVideo()}
          disabled={busy}
          className="w-full rounded-md bg-brand text-white font-bold text-[14px] py-3 shadow-button hover:bg-brand-dark disabled:opacity-60 flex items-center justify-center gap-2"
        >
          <Icon name="sparkle" className="w-4 h-4" />
          {plan ? "Create again from brief" : "Create my video"}
        </button>
        <p className="text-[11px] text-ink-muted leading-snug">
          Free, no sign-up. Your images never leave your device — the video is built in your browser. SimVieo creates motion-graphics videos from your
          own images and words; it doesn&apos;t generate camera footage.
        </p>
      </section>

      {/* Studio */}
      <section className="flex flex-col gap-4 min-w-0">
        {(error || notice) && (
          <div className={`rounded-md px-3 py-2 text-[12.5px] border ${error ? "bg-critical-wash border-critical/30 text-critical" : "bg-warning-wash border-warning/40 text-ink"}`}>
            {error || notice}
          </div>
        )}

        <div className="bg-surface border border-border rounded-lg shadow-soft-sm p-3 sm:p-4 flex flex-col gap-3">
          <div className="relative mx-auto w-full flex items-center justify-center bg-[#0b0b10] rounded-md overflow-hidden" style={{ maxHeight: "68vh", aspectRatio: `${dw} / ${dh}`, maxWidth: format === "9:16" ? "min(100%, calc(68vh * 9 / 16))" : "100%" }}>
            <canvas ref={canvasRef} className="w-full h-full" style={{ display: plan ? "block" : "none" }} onClick={() => (playing ? stopPlayback() : startPlayback(timeRef.current))} />
            {!plan && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 gap-3">
                <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-white">
                  <Icon name="film" className="w-6 h-6" />
                </div>
                <p className="text-white/80 text-[13px] max-w-xs">Describe your product, add images and a logo, then press Create. Your video appears here.</p>
              </div>
            )}
            {busy && (
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="w-10 h-10 rounded-full border-4 border-white/20 border-t-white animate-spin" />
                <p className="text-white text-[13px] font-semibold">{PHASE_TEXT[phase]}</p>
                {phase === "exporting" && (
                  <>
                    <div className="w-56 h-2 rounded-full bg-white/20 overflow-hidden">
                      <div className="h-full bg-white" style={{ width: `${Math.round(progress * 100)}%` }} />
                    </div>
                    <button type="button" onClick={() => (cancelRef.current.cancelled = true)} className="text-white/80 text-[12px] underline">
                      Cancel
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {plan && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => (playing ? stopPlayback() : startPlayback(timeRef.current))}
                disabled={busy}
                className="w-9 h-9 rounded-full bg-brand text-white flex items-center justify-center flex-shrink-0 disabled:opacity-50"
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? <span className="block w-3 h-3 border-l-[4px] border-r-[4px] border-white" style={{ borderTop: 0, borderBottom: 0 }} /> : <Icon name="play" className="w-4 h-4" />}
              </button>
              <input type="range" min={0} max={total} step={0.05} value={Math.min(time, total)} onChange={(e) => seek(Number(e.target.value))} className="flex-1 accent-[rgb(var(--brand-rgb))]" aria-label="Seek" />
              <span className="text-[12px] tabular-nums text-ink-muted w-[76px] text-right">
                {fmtTime(time)} / {fmtTime(total)}
              </span>
            </div>
          )}

          {plan && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={doExport} disabled={busy} className="rounded-md bg-brand text-white font-bold text-[13px] px-4 py-2 shadow-button hover:bg-brand-dark disabled:opacity-60">
                Download MP4
              </button>
              <label className="flex items-center gap-1.5 text-[12px] text-ink-2">
                <select value={hq ? "hq" : "fast"} onChange={(e) => setHq(e.target.value === "hq")} className="rounded-md border border-border bg-page px-2 py-1.5 text-[12px]">
                  <option value="hq">1080p (best)</option>
                  <option value="fast">720p (faster)</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => createVideo(`Make a clearly different version from the current one titled "${plan.title}" whose hook was "${plan.scenes[0]?.headline}". New angle, new hook, different scene mix.`)}
                disabled={busy}
                className="rounded-md border border-border text-ink-2 font-semibold text-[13px] px-3 py-2 hover:border-brand disabled:opacity-60"
              >
                New variation
              </button>
              {voiceStale && (
                <button type="button" onClick={applyVoiceChanges} disabled={busy} className="rounded-md border border-warning text-ink font-semibold text-[13px] px-3 py-2 bg-warning-wash disabled:opacity-60">
                  Update voiceover
                </button>
              )}
              <span className="ml-auto text-[11px] text-ink-muted">
                {STYLE_LABELS[plan.style]} · {plan.source === "ai" ? "AI-directed" : "Template"} · {format}
              </span>
            </div>
          )}

          {download && (
            <div className="rounded-md bg-good-wash border border-good/30 px-3 py-2 text-[12.5px] text-good-text flex flex-wrap items-center gap-2">
              <span>
                Downloaded <b>{download.name}</b> ({(download.size / 1024 / 1024).toFixed(1)} MB).
              </span>
              <a href={download.url} download={download.name} className="underline font-semibold">
                Download again
              </a>
              <button type="button" onClick={clearAll} className="ml-auto underline">
                Clear everything
              </button>
              {download.method !== "avc" && (
                <span className="w-full text-[11.5px] text-ink-muted">
                  Your browser saved this with the {download.method.toUpperCase()} codec. It plays in Chrome, VLC, YouTube and most social uploads; for
                  iPhone or PowerPoint playback, create it in Chrome, Edge or Safari for H.264.
                </span>
              )}
            </div>
          )}
        </div>

        {plan && (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-4">
            {/* storyboard */}
            <div className="bg-surface border border-border rounded-lg shadow-soft-sm p-3 sm:p-4">
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <h3 className="text-[14px] font-bold text-ink">Storyboard</h3>
                {plan.audience && <span className="text-[11px] text-ink-muted truncate">For: {plan.audience}</span>}
              </div>
              <ol className="flex flex-col gap-2">
                {plan.scenes.map((s, i) => {
                  const start = plan.scenes.slice(0, i).reduce((a, x) => a + x.duration, 0);
                  const open = openScene === i;
                  return (
                    <li key={s.id} className={`rounded-md border ${sceneNow === i ? "border-brand" : "border-border"} bg-page`}>
                      <div className="flex items-center gap-2 px-3 py-2">
                        <button type="button" onClick={() => seek(start + 0.01)} className="text-[11px] font-bold text-brand tabular-nums w-10 text-left">
                          {fmtTime(start)}
                        </button>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted w-24 flex-shrink-0">{SCENE_LABELS[s.kind]}</span>
                        <button type="button" onClick={() => setOpenScene(open ? null : i)} className="flex-1 min-w-0 text-left text-[13px] text-ink truncate">
                          {s.headline || <i className="text-ink-muted">(brand)</i>}
                        </button>
                        <span className="text-[11px] text-ink-muted tabular-nums">{s.duration.toFixed(1)}s</span>
                        <button
                          type="button"
                          onClick={() => regenerateScene(i)}
                          disabled={busy || busyScene !== null}
                          className="text-[11px] font-semibold text-brand hover:underline disabled:opacity-50 flex-shrink-0"
                        >
                          {busyScene === i ? "Rewriting…" : "Regenerate"}
                        </button>
                      </div>
                      {open && (
                        <div className="px-3 pb-3 grid gap-2">
                          <label className="grid gap-1">
                            <span className="text-[11px] font-semibold text-ink-muted">On-screen headline</span>
                            <input value={s.headline} maxLength={70} onChange={(e) => updateScene(i, { headline: e.target.value })} className="rounded border border-border bg-surface px-2 py-1.5 text-[13px] text-ink" />
                          </label>
                          {(s.sub !== undefined || ["product_hero", "feature", "split", "cta"].includes(s.kind)) && (
                            <label className="grid gap-1">
                              <span className="text-[11px] font-semibold text-ink-muted">Supporting line</span>
                              <input value={s.sub || ""} maxLength={110} onChange={(e) => updateScene(i, { sub: e.target.value })} className="rounded border border-border bg-surface px-2 py-1.5 text-[13px] text-ink" />
                            </label>
                          )}
                          {s.bullets && (
                            <label className="grid gap-1">
                              <span className="text-[11px] font-semibold text-ink-muted">Bullets (one per line)</span>
                              <textarea
                                rows={3}
                                value={s.bullets.join("\n")}
                                onChange={(e) => updateScene(i, { bullets: e.target.value.split("\n").slice(0, 4) })}
                                className="rounded border border-border bg-surface px-2 py-1.5 text-[13px] text-ink"
                              />
                            </label>
                          )}
                          <label className="grid gap-1">
                            <span className="text-[11px] font-semibold text-ink-muted">Narration / caption</span>
                            <textarea rows={2} value={s.voice} maxLength={260} onChange={(e) => updateScene(i, { voice: e.target.value })} className="rounded border border-border bg-surface px-2 py-1.5 text-[13px] text-ink" />
                          </label>
                          {images.length > 0 && s.imageIndex !== undefined && (
                            <div className="flex gap-1.5 items-center">
                              <span className="text-[11px] font-semibold text-ink-muted mr-1">Image</span>
                              {images.map((im, k) => (
                                <button key={im.id} type="button" onClick={() => updateScene(i, { imageIndex: k })} className={`w-9 h-9 rounded overflow-hidden border-2 ${s.imageIndex === k ? "border-brand" : "border-transparent"}`}>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={im.thumb} alt="" className="w-full h-full object-cover" />
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>

            {/* quality */}
            <div className="bg-surface border border-border rounded-lg shadow-soft-sm p-3 sm:p-4 h-fit">
              <h3 className="text-[14px] font-bold text-ink mb-2">Quality check</h3>
              <ul className="flex flex-col gap-2">
                {quality.map((q) => (
                  <li key={q.label} className="flex gap-2 text-[12px] leading-snug">
                    <span className={`mt-0.5 w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white ${q.status === "pass" ? "bg-good" : q.status === "fixed" ? "bg-brand" : "bg-warning"}`}>
                      {q.status === "pass" ? "✓" : q.status === "fixed" ? "↺" : "!"}
                    </span>
                    <span>
                      <b className="text-ink">{q.label}.</b> <span className="text-ink-muted">{q.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
