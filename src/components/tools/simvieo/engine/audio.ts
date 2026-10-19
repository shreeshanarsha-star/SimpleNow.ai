// SimVieo soundtrack -- original music + sound design synthesised in the
// browser (Web Audio, OfflineAudioContext). Nothing is downloaded or licensed:
// every note is generated here, so there are no copyright issues.
import type { Mood, Plan } from "@/lib/simvieo/types";

export const SAMPLE_RATE = 44100;

interface MoodSpec {
  bpm: number;
  root: number; // MIDI note of the key root
  prog: number[][]; // chords as semitone offsets from root
  drums: "full" | "light" | "none";
  arp: boolean;
  bright: number; // filter cutoff for pads
}

const MAJ = (d: number) => [d, d + 4, d + 7];
const MIN = (d: number) => [d, d + 3, d + 7];

const MOODS: Record<Mood, MoodSpec> = {
  energetic: { bpm: 122, root: 45, prog: [MIN(0), MAJ(-4), MAJ(3), MAJ(-2)], drums: "full", arp: true, bright: 2600 },
  uplifting: { bpm: 104, root: 48, prog: [MAJ(0), MAJ(7), MIN(9), MAJ(5)], drums: "light", arp: true, bright: 2000 },
  calm: { bpm: 78, root: 50, prog: [MAJ(0), MAJ(5), MIN(9), MAJ(7)], drums: "none", arp: true, bright: 1300 },
  corporate: { bpm: 96, root: 47, prog: [MAJ(0), MIN(9), MAJ(5), MAJ(7)], drums: "light", arp: true, bright: 1700 },
};

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

function noiseBuffer(ctx: BaseAudioContext, seconds = 2) {
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

export interface SoundtrackInput {
  plan: Plan;
  total: number;
  starts: number[];
  music: boolean;
  sfx: boolean;
  voice: (AudioBuffer | null)[];
  customMusic?: AudioBuffer | null;
}

export async function buildSoundtrack(inp: SoundtrackInput): Promise<AudioBuffer> {
  const { plan, total, starts } = inp;
  const len = Math.ceil((total + 0.05) * SAMPLE_RATE);
  const ctx = new OfflineAudioContext(2, len, SAMPLE_RATE);
  const master = ctx.createDynamicsCompressor();
  master.threshold.value = -14;
  master.ratio.value = 3;
  master.attack.value = 0.01;
  master.release.value = 0.2;
  const out = ctx.createGain();
  out.gain.value = 0.9;
  master.connect(out).connect(ctx.destination);

  const musicBus = ctx.createGain();
  musicBus.connect(master);
  const noise = noiseBuffer(ctx);

  // Duck music under narration.
  const hasVoice = inp.voice.some(Boolean);
  const baseLevel = hasVoice ? 0.32 : 0.55;
  musicBus.gain.setValueAtTime(0, 0);
  musicBus.gain.linearRampToValueAtTime(baseLevel, 0.4);
  inp.voice.forEach((buf, i) => {
    if (!buf) return;
    const a = starts[i] + 0.25;
    const b = Math.min(total, a + buf.duration);
    musicBus.gain.setTargetAtTime(baseLevel * 0.55, Math.max(0.41, a - 0.15), 0.08);
    musicBus.gain.setTargetAtTime(baseLevel, b + 0.05, 0.25);
  });
  musicBus.gain.setTargetAtTime(0, Math.max(0.5, total - 1.2), 0.35);

  if (inp.customMusic) {
    const src = ctx.createBufferSource();
    src.buffer = inp.customMusic;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = 0.9;
    src.connect(g).connect(musicBus);
    src.start(0);
  } else if (inp.music) {
    synthMusic(ctx, musicBus, MOODS[plan.mood] || MOODS.uplifting, total, noise);
  }

  if (inp.sfx) {
    const sfxBus = ctx.createGain();
    sfxBus.gain.value = hasVoice ? 0.35 : 0.5;
    sfxBus.connect(master);
    starts.forEach((st, i) => {
      if (i > 0) whoosh(ctx, sfxBus, noise, st - 0.18);
      const k = plan.scenes[i].kind;
      if (k === "logo_sting") impact(ctx, sfxBus, noise, st + 0.1);
      if (k === "cta" && st > 1.6) riser(ctx, sfxBus, noise, st - 1.4, 1.4);
    });
  }

  const voiceBus = ctx.createGain();
  voiceBus.gain.value = 1.0;
  voiceBus.connect(master);
  inp.voice.forEach((buf, i) => {
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(voiceBus);
    src.start(starts[i] + 0.25);
  });

  return ctx.startRendering();
}

function synthMusic(ctx: BaseAudioContext, bus: AudioNode, m: MoodSpec, total: number, noise: AudioBuffer) {
  const beat = 60 / m.bpm;
  const bar = beat * 4;
  const bars = Math.ceil(total / bar) + 1;

  const padBus = ctx.createBiquadFilter();
  padBus.type = "lowpass";
  padBus.frequency.value = m.bright;
  padBus.Q.value = 0.6;
  const padGain = ctx.createGain();
  padGain.gain.value = 0.16;
  padBus.connect(padGain).connect(bus);

  for (let b = 0; b < bars; b++) {
    const t0 = b * bar;
    if (t0 > total) break;
    const chord = m.prog[b % m.prog.length];
    // pad: two detuned saws + a triangle per note
    chord.forEach((off) => {
      const f = hz(m.root + 12 + off);
      for (const [type, det] of [["sawtooth", -7], ["sawtooth", 7], ["triangle", 0]] as [OscillatorType, number][]) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f;
        o.detune.value = det;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(type === "triangle" ? 0.5 : 0.28, t0 + Math.min(0.6, bar * 0.3));
        g.gain.setValueAtTime(type === "triangle" ? 0.5 : 0.28, t0 + bar - 0.15);
        g.gain.linearRampToValueAtTime(0, t0 + bar + 0.05);
        o.connect(g).connect(padBus);
        o.start(t0);
        o.stop(t0 + bar + 0.1);
      }
    });
    // bass
    const bassSteps = m.drums === "full" ? 8 : 2;
    for (let s = 0; s < bassSteps; s++) {
      const t = t0 + (s * bar) / bassSteps;
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = hz(m.root + chord[0]);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.42, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(bar / bassSteps, 0.9));
      o.connect(g).connect(bus);
      o.start(t);
      o.stop(t + bar / bassSteps + 0.05);
    }
    // arpeggio pluck
    if (m.arp && b > 0) {
      const steps = 8;
      const notes = [...chord.map((c) => c + 24), chord[0] + 36];
      for (let s = 0; s < steps; s++) {
        const t = t0 + s * (bar / steps);
        const n = notes[(s * (m.bpm > 100 ? 1 : 2)) % notes.length];
        const o = ctx.createOscillator();
        o.type = "square";
        o.frequency.value = hz(m.root + n);
        const f = ctx.createBiquadFilter();
        f.type = "lowpass";
        f.frequency.setValueAtTime(m.bright * 1.6, t);
        f.frequency.exponentialRampToValueAtTime(400, t + 0.25);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.07, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        o.connect(f).connect(g).connect(bus);
        o.start(t);
        o.stop(t + 0.32);
      }
    }
    // drums
    if (m.drums !== "none" && b > 0) {
      for (let s = 0; s < 4; s++) {
        const t = t0 + s * beat;
        if (m.drums === "full" || s % 2 === 0) kick(ctx, bus, t);
        hat(ctx, bus, noise, t + beat / 2, m.drums === "full" ? 0.09 : 0.05);
        if (m.drums === "full" && (s === 1 || s === 3)) clap(ctx, bus, noise, t);
      }
    }
  }
}

function kick(ctx: BaseAudioContext, bus: AudioNode, t: number) {
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.9, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + 0.4);
}

function hat(ctx: BaseAudioContext, bus: AudioNode, noise: AudioBuffer, t: number, level: number) {
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = 7000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(level, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  s.connect(f).connect(g).connect(bus);
  s.start(t, Math.random());
  s.stop(t + 0.06);
}

function clap(ctx: BaseAudioContext, bus: AudioNode, noise: AudioBuffer, t: number) {
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 1500;
  f.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.3, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  s.connect(f).connect(g).connect(bus);
  s.start(t, Math.random());
  s.stop(t + 0.2);
}

function whoosh(ctx: BaseAudioContext, bus: AudioNode, noise: AudioBuffer, t: number) {
  if (t < 0) return;
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 1.2;
  f.frequency.setValueAtTime(350, t);
  f.frequency.exponentialRampToValueAtTime(3500, t + 0.32);
  f.frequency.exponentialRampToValueAtTime(900, t + 0.55);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  s.connect(f).connect(g).connect(bus);
  s.start(t, Math.random());
  s.stop(t + 0.65);
}

function riser(ctx: BaseAudioContext, bus: AudioNode, noise: AudioBuffer, t: number, dur: number) {
  const s = ctx.createBufferSource();
  s.buffer = noise;
  s.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = "highpass";
  f.frequency.setValueAtTime(300, t);
  f.frequency.exponentialRampToValueAtTime(6000, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.22, t + dur);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
  s.connect(f).connect(g).connect(bus);
  s.start(t);
  s.stop(t + dur + 0.1);
}

function impact(ctx: BaseAudioContext, bus: AudioNode, noise: AudioBuffer, t: number) {
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(90, t);
  o.frequency.exponentialRampToValueAtTime(32, t + 0.8);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.8, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + 1.2);
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 1800;
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.35, t);
  g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  s.connect(f).connect(g2).connect(bus);
  s.start(t, Math.random());
  s.stop(t + 0.45);
}

export async function decodeBase64Audio(b64: string): Promise<AudioBuffer> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ctx = new OfflineAudioContext(1, 1, SAMPLE_RATE);
  return ctx.decodeAudioData(bytes.buffer);
}

export async function decodeFileAudio(file: File): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, 1, SAMPLE_RATE);
  return ctx.decodeAudioData(await file.arrayBuffer());
}
