// MP4 export entirely in the browser: WebCodecs (H.264 + AAC) muxed by
// Mediabunny (MPL-2.0). Falls back to real-time MediaRecorder on browsers
// without WebCodecs.
import type { Renderer } from "./render";

export interface ExportResult {
  blob: Blob;
  ext: "mp4" | "webm";
  method: "webcodecs" | "recorder";
  codec: string;
}

export const FPS = 30;
const MEDIABUNNY_URL = "/simvieo/mediabunny-1.61.6.min.mjs";

export async function exportVideo(
  renderer: Renderer,
  audio: AudioBuffer | null,
  onProgress: (p: number) => void,
  signal: { cancelled: boolean }
): Promise<ExportResult> {
  const canvas = document.createElement("canvas");
  canvas.width = renderer.W;
  canvas.height = renderer.H;
  // CPU-backed canvas: frames are read back for encoding every tick, and
  // GPU-canvas + hardware-encoder combos can stall on some machines.
  const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true })!;

  if (typeof window !== "undefined" && "VideoEncoder" in window) {
    for (const hw of ["no-preference", "prefer-software"] as const) {
      try {
        return await viaWebCodecs(renderer, canvas, ctx, audio, onProgress, signal, hw);
      } catch (err) {
        if (signal.cancelled) throw err;
        console.warn(`WebCodecs export (${hw}) failed:`, err);
        onProgress(0);
      }
    }
  }
  return viaRecorder(renderer, canvas, ctx, audio, onProgress, signal);
}

async function viaWebCodecs(
  renderer: Renderer,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  audio: AudioBuffer | null,
  onProgress: (p: number) => void,
  signal: { cancelled: boolean },
  hardwareAcceleration: "no-preference" | "prefer-software"
): Promise<ExportResult> {
  // Load Mediabunny's prebuilt browser bundle as-is (served from /public)
  // rather than the webpack-processed source: the bundled build stalled the
  // H.264 encoder on its first frame in some Chromium builds, the prebuilt
  // one does not.
  const mb = (await import(/* webpackIgnore: true */ MEDIABUNNY_URL)) as typeof import("mediabunny");
  const log = (m: string) => console.info(`[simvieo-export] ${m}`);
  log(`module loaded (${hardwareAcceleration})`);
  const videoCodec = await mb.getFirstEncodableVideoCodec(["avc", "hevc", "vp9", "av1"], {
    width: canvas.width,
    height: canvas.height,
  });
  if (!videoCodec) throw new Error("no_video_codec");
  const audioCodec = audio
    ? await mb.getFirstEncodableAudioCodec(["aac", "opus"], { numberOfChannels: 2, sampleRate: audio.sampleRate })
    : null;

  const output = new mb.Output({
    format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new mb.BufferTarget(),
  });
  const video = new mb.CanvasSource(canvas, {
    codec: videoCodec,
    bitrate: canvas.width * canvas.height > 1_500_000 ? 8_000_000 : 5_000_000,
    keyFrameInterval: 2,
    hardwareAcceleration,
  });
  output.addVideoTrack(video, { frameRate: FPS });
  let audioSrc: InstanceType<typeof mb.AudioBufferSource> | null = null;
  if (audio && audioCodec) {
    audioSrc = new mb.AudioBufferSource({ codec: audioCodec, bitrate: 160_000 });
    output.addAudioTrack(audioSrc);
  }
  await output.start();
  log(`started ${videoCodec}/${audioCodec} ${canvas.width}x${canvas.height}`);

  const frames = Math.ceil(renderer.total * FPS);
  for (let f = 0; f < frames; f++) {
    if (signal.cancelled) {
      await output.cancel();
      throw new Error("cancelled");
    }
    const t = f / FPS;
    renderer.draw(ctx, t);
    // Watchdog: an encoder that stops accepting frames is abandoned so the
    // next strategy can run, instead of spinning forever.
    await withTimeout(video.add(t, 1 / FPS), f === 0 ? 20000 : 10000, async () => {
      await output.cancel().catch(() => {});
    });
    if (f === 0) log("first frame accepted");
    if (f % 6 === 0) {
      onProgress((f / frames) * 0.95);
      await new Promise((r) => setTimeout(r, 0)); // keep the UI responsive
    }
  }
  if (audioSrc && audio) await withTimeout(audioSrc.add(audio), 30000, () => output.cancel().catch(() => {}));
  await withTimeout(output.finalize(), 30000, () => output.cancel().catch(() => {}));
  onProgress(1);
  const buf = (output.target as InstanceType<typeof mb.BufferTarget>).buffer!;
  return { blob: new Blob([buf], { type: "video/mp4" }), ext: "mp4", method: "webcodecs", codec: videoCodec };
}

async function viaRecorder(
  renderer: Renderer,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  audio: AudioBuffer | null,
  onProgress: (p: number) => void,
  signal: { cancelled: boolean }
): Promise<ExportResult> {
  if (typeof MediaRecorder === "undefined" || !canvas.captureStream) {
    throw new Error("This browser can't create videos. Please use a recent Chrome, Edge, Safari or Firefox.");
  }
  const stream = canvas.captureStream(FPS);
  const ac = new AudioContext();
  if (audio) {
    const dest = ac.createMediaStreamDestination();
    const src = ac.createBufferSource();
    src.buffer = audio;
    src.connect(dest);
    dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
    src.start(ac.currentTime + 0.05);
  }
  const types = ["video/mp4;codecs=avc1,mp4a", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"];
  const mime = types.find((m) => MediaRecorder.isTypeSupported(m)) || "";
  const rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: 6_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((r) => (rec.onstop = () => r()));
  const t0 = performance.now() + 50;
  rec.start(250);
  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      if (signal.cancelled || t >= renderer.total) return resolve();
      renderer.draw(ctx, Math.max(0, t));
      onProgress(t / renderer.total);
      requestAnimationFrame(tick);
    };
    tick();
  });
  rec.stop();
  await done;
  ac.close();
  if (signal.cancelled) throw new Error("cancelled");
  if (!chunks.length) throw new Error("This browser couldn't encode the video. Please reload the page or try Chrome or Edge.");
  const isMp4 = (rec.mimeType || mime).includes("mp4");
  onProgress(1);
  return { blob: new Blob(chunks, { type: isMp4 ? "video/mp4" : "video/webm" }), ext: isMp4 ? "mp4" : "webm", method: "recorder", codec: isMp4 ? "avc" : "vp9" };
}

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => unknown): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    p.finally(() => clearTimeout(timer)),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => {
        onTimeout();
        reject(new Error("encoder_stalled"));
      }, ms);
    }),
  ]);
}
