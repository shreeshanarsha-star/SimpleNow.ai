"use client";
// Presenter.ai — TV sound: music beds and cues, synthesised in the browser
// (no audio files, no licences, nothing to download on the day). Music sits on
// its own bus that ducks automatically while Shree speaks.

type Bed = "off" | "lobby" | "montage" | "quiz" | "build" | "closing";

let ctx: AudioContext | null = null;
let master: GainNode;
let musicBus: GainNode;
let sfxBus: GainNode;
let comp: DynamicsCompressorNode;
let bed: Bed = "off";
let bedTimer: ReturnType<typeof setInterval> | null = null;
let bedStep = 0;
let nextTime = 0;
let volume = 0.8; // overall (phone control)
let ducked = false;
let muted = false;

const BED_LEVEL: Record<Bed, number> = { off: 0, lobby: 0.22, montage: 0.5, quiz: 0.28, build: 0.14, closing: 0.24 };

export function soundReady() {
  return !!ctx;
}

/** Must be called from a user gesture (the TV's "Click to start"). */
export function initSound() {
  if (ctx) return;
  const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext) as typeof AudioContext;
  ctx = new AC();
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master = ctx.createGain();
  master.gain.value = volume;
  musicBus = ctx.createGain();
  musicBus.gain.value = 0;
  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.9;
  musicBus.connect(comp);
  sfxBus.connect(comp);
  comp.connect(master);
  master.connect(ctx.destination);
}

export function setVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
  if (ctx) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.1);
}
export function setMuted(m: boolean) {
  muted = m;
  setVolume(volume);
}
export function getSoundState() {
  return { volume, muted, bed };
}

function applyBedLevel(t = 0.4) {
  if (!ctx) return;
  const target = BED_LEVEL[bed] * (ducked ? 0.18 : 1);
  musicBus.gain.cancelScheduledValues(ctx.currentTime);
  musicBus.gain.setTargetAtTime(target, ctx.currentTime, t);
}

/** Dip music under Shree's voice. */
export function duck(on: boolean) {
  if (ducked === on) return;
  ducked = on;
  applyBedLevel(on ? 0.08 : 0.6);
}

/* ------------------------------ building blocks ------------------------------ */
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

function tone(dest: AudioNode, freq: number, start: number, dur: number, opts: { type?: OscillatorType; gain?: number; attack?: number; release?: number; cutoff?: number } = {}) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  o.type = opts.type || "sine";
  o.frequency.value = freq;
  const g = ctx.createGain();
  const peak = opts.gain ?? 0.2;
  const a = opts.attack ?? 0.01;
  const r = opts.release ?? 0.2;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(peak, start + a);
  g.gain.setValueAtTime(peak, start + Math.max(a, dur - r));
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  let node: AudioNode = o;
  if (opts.cutoff) {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = opts.cutoff;
    o.connect(f);
    node = f;
  }
  node.connect(g);
  g.connect(dest);
  o.start(start);
  o.stop(start + dur + 0.05);
}

let noiseBuf: AudioBuffer | null = null;
function noise(dest: AudioNode, start: number, dur: number, opts: { gain?: number; hp?: number; lp?: number; decay?: number } = {}) {
  if (!ctx) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  let node: AudioNode = s;
  if (opts.hp) {
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = opts.hp;
    node.connect(f);
    node = f;
  }
  if (opts.lp) {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = opts.lp;
    node.connect(f);
    node = f;
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(opts.gain ?? 0.3, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + (opts.decay ?? dur));
  node.connect(g);
  g.connect(dest);
  s.start(start);
  s.stop(start + dur + 0.05);
}

function kick(dest: AudioNode, t: number, gain = 0.6) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + 0.4);
}

/* ------------------------------ music beds ------------------------------ */
// Chord progressions (MIDI roots + triads), all in a warm minor/major key.
const PROG = [
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [48, 52, 55], // C
  [55, 59, 62], // G
];

function scheduleBed() {
  if (!ctx || bed === "off") return;
  const bpm = bed === "quiz" ? 124 : bed === "montage" ? 112 : bed === "build" ? 96 : 72;
  const sixteenth = 60 / bpm / 4;
  while (nextTime < ctx.currentTime + 0.25) {
    const step = bedStep % 64; // 4 bars of 16 steps
    const chord = PROG[Math.floor(step / 16) % PROG.length];
    const t = nextTime;
    if (bed === "lobby" || bed === "closing") {
      if (step % 16 === 0) chord.forEach((n) => tone(musicBus, midi(n), t, sixteenth * 16, { type: "triangle", gain: 0.08, attack: 0.8, release: 1.2, cutoff: 1400 }));
      if (step % 4 === 2) tone(musicBus, midi(chord[(step / 4) % 3 | 0] + 12), t, sixteenth * 3, { type: "sine", gain: bed === "closing" ? 0.06 : 0.05, attack: 0.02, release: 0.3 });
      if (bed === "closing" && step % 16 === 0) tone(musicBus, midi(chord[0] - 12), t, sixteenth * 16, { type: "sine", gain: 0.12, attack: 0.3, release: 1 });
    } else if (bed === "build") {
      if (step % 2 === 0) tone(musicBus, midi(chord[(step / 2) % 3] + 12), t, sixteenth * 2, { type: "sine", gain: 0.07, release: 0.12 });
      if (step % 16 === 0) tone(musicBus, midi(chord[0] - 12), t, sixteenth * 16, { type: "triangle", gain: 0.06, attack: 0.5, release: 1, cutoff: 600 });
    } else if (bed === "quiz") {
      if (step % 4 === 0) kick(musicBus, t, 0.45);
      if (step % 2 === 1) noise(musicBus, t, 0.05, { gain: 0.08, hp: 7000, decay: 0.05 });
      if (step % 4 === 2) tone(musicBus, midi(chord[0] - 12), t, sixteenth * 2, { type: "sawtooth", gain: 0.07, cutoff: 500, release: 0.1 });
      if (step % 8 === 6) tone(musicBus, midi(chord[2] + 12), t, sixteenth, { type: "square", gain: 0.03, cutoff: 2000, release: 0.05 });
    } else if (bed === "montage") {
      // Builds over ~28 s: pad → arpeggio → drums.
      const bar = Math.floor(bedStep / 16);
      if (step % 16 === 0) chord.forEach((n) => tone(musicBus, midi(n), t, sixteenth * 16, { type: "sawtooth", gain: 0.05, attack: 0.4, release: 0.8, cutoff: 900 + bar * 120 }));
      if (bar >= 2) tone(musicBus, midi(chord[step % 3] + 12 + (step % 6 === 5 ? 12 : 0)), t, sixteenth, { type: "triangle", gain: 0.06, release: 0.08 });
      if (bar >= 4 && step % 4 === 0) kick(musicBus, t, 0.5);
      if (bar >= 4 && step % 2 === 1) noise(musicBus, t, 0.04, { gain: 0.06, hp: 8000, decay: 0.04 });
      if (step % 16 === 0) tone(musicBus, midi(chord[0] - 24), t, sixteenth * 16, { type: "sine", gain: 0.18, attack: 0.05, release: 1 });
    }
    nextTime += sixteenth;
    bedStep++;
  }
}

export function setBed(next: Bed) {
  if (!ctx || next === bed) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  bed = next;
  if (bedTimer) clearInterval(bedTimer);
  bedTimer = null;
  if (next === "off") {
    musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    return;
  }
  bedStep = 0;
  nextTime = ctx.currentTime + 0.1;
  applyBedLevel(next === "montage" ? 0.05 : 0.8);
  bedTimer = setInterval(scheduleBed, 60);
  scheduleBed();
}

/* ------------------------------ cues ------------------------------ */
export type Cue = "snap" | "reveal" | "tick" | "correct" | "drumroll" | "win" | "whoosh" | "pop";

export function cue(c: Cue, opts: { length?: number } = {}) {
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  const t = ctx.currentTime + 0.02;
  switch (c) {
    case "snap": // cinematic impact: boom + bright crack
      kick(sfxBus, t, 0.9);
      tone(sfxBus, 45, t, 1.8, { type: "sine", gain: 0.5, attack: 0.005, release: 1.6 });
      noise(sfxBus, t, 0.25, { gain: 0.5, hp: 2500, decay: 0.2 });
      break;
    case "whoosh":
      noise(sfxBus, t, 1.2, { gain: 0.25, lp: 3000, decay: 1.2 });
      break;
    case "reveal": {
      // rising swell into a bright major chord
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(880, t + 1.4);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 1.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 2500;
      o.connect(f);
      f.connect(g);
      g.connect(sfxBus);
      o.start(t);
      o.stop(t + 1.6);
      noise(sfxBus, t, 1.4, { gain: 0.12, hp: 3000, decay: 1.4 });
      [60, 64, 67, 72].forEach((n) => tone(sfxBus, midi(n), t + 1.45, 2.2, { type: "triangle", gain: 0.12, attack: 0.01, release: 1.6 }));
      break;
    }
    case "tick":
      tone(sfxBus, 1800, t, 0.05, { type: "square", gain: 0.12, release: 0.03 });
      break;
    case "correct":
      tone(sfxBus, midi(76), t, 0.18, { type: "triangle", gain: 0.18, release: 0.1 });
      tone(sfxBus, midi(83), t + 0.1, 0.3, { type: "triangle", gain: 0.18, release: 0.2 });
      break;
    case "pop":
      tone(sfxBus, midi(84), t, 0.08, { type: "sine", gain: 0.12, release: 0.05 });
      break;
    case "drumroll": {
      const len = opts.length ?? 2.5;
      const n = Math.floor(len * 22);
      for (let i = 0; i < n; i++) {
        const tt = t + (i / n) * len;
        noise(sfxBus, tt, 0.06, { gain: 0.08 + 0.25 * (i / n), lp: 1800, hp: 150, decay: 0.05 });
      }
      kick(sfxBus, t + len, 0.9);
      noise(sfxBus, t + len, 1.6, { gain: 0.35, hp: 5000, decay: 1.5 }); // cymbal
      break;
    }
    case "win":
      [60, 64, 67].forEach((n, i) => tone(sfxBus, midi(n + 12), t + i * 0.12, 0.5, { type: "triangle", gain: 0.15, release: 0.3 }));
      [60, 64, 67, 72].forEach((n) => tone(sfxBus, midi(n + 12), t + 0.4, 1.8, { type: "triangle", gain: 0.1, attack: 0.02, release: 1.4 }));
      break;
  }
}
