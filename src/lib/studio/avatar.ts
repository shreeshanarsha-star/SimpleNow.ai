"use client";
// Presenter Studio — the presenter's face and voice on the TV.
// - Anam avatar with its own brain off: it speaks only the text we give it.
// - Each line is split into short beats, sent as ordered utterances in ONE talk stream
//   (Cara 4 multi-utterance), so delivery is natural and Hold/Resume works per beat.
// - Relay: a fresh Anam session is warmed before the plan's 10-minute cap and swapped in
//   between lines (or, at the hard limit, mid-line, carrying on from the current beat).
// - Backup: if the avatar can't start or drops, the browser voice carries on from the same beat.
import { createClient, AnamEvent } from "@anam-ai/js-sdk";
import type { AnamClient } from "@anam-ai/js-sdk";
import { sanitizeCues, splitBeats, stripCues } from "./engine";

type Status = "starting" | "ok" | "voice" | "off";
export type SpeakResult = { completed: boolean; beat: number };

// Session plan: Anam ends the session at MAX_S (set on the token, under Explorer's 10 min).
export const MAX_SESSION_S = 570;
const PREWARM_MS = 495_000; // 8:15 — start the standby session
const SWAP_IDLE_MS = 525_000; // 8:45 — swap at the next pause between lines
const SWAP_FORCE_MS = 555_000; // 9:15 — swap even mid-line (continue from the current beat)

type Turn = {
  beats: string[];
  ids: string[];
  idx: number; // beat currently playing
  from: number; // first beat sent in the current stream
  resolve: (r: SpeakResult) => void;
  timer: ReturnType<typeof setTimeout>;
  started: number;
  firstHeard: boolean;
  correlationId: string;
  viaBrowser: boolean;
};

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16))).toLowerCase();
const wordCount = (s: string) => (s.trim() ? stripCues(s).split(/\s+/).length : 0);

export class Presenter {
  private client: AnamClient | null = null;
  private standby: AnamClient | null = null;
  private standbyReady = false;
  private slot = 0;
  private startedAt = 0;
  private retiring = new WeakSet<AnamClient>();
  private turn: Turn | null = null;
  private relayTimer: ReturnType<typeof setInterval> | null = null;
  // End-of-line detection from the actual audio: once the last beat is playing and the
  // avatar has been silent for a moment, the line is finished (no dead air waiting for timers).
  private audio: { ctx: AudioContext; an: AnalyserNode; src: MediaStreamAudioSourceNode | null; slot: number; buf: Float32Array } | null = null;
  private heardAt = 0;
  private silenceTimer: ReturnType<typeof setInterval> | null = null;
  private speakCalledAt = 0;
  private lastInterruptAt = 0;
  private wantMic = false;
  private seenUser = new Set<string>();
  private micTimer: ReturnType<typeof setTimeout> | null = null;
  speaking = false;
  status: Status = "off";
  /** ms from speak() to the first word arriving (last line). */
  lastLatencyMs: number | null = null;

  constructor(
    private opts: {
      videoId: (slot: number) => string;
      onStatus: (s: Status, note?: string) => void;
      onSlot: (slot: number) => void;
      onBeat?: (beat: number, of: number) => void;
      token: () => Promise<string>;
      voiceOnly?: boolean;
      /** Q&A by voice: open the microphone (muted unless listening and not speaking). */
      listen?: boolean;
      onHeard?: (text: string) => void;
    }
  ) {}

  private setStatus(s: Status, note?: string) {
    this.status = s;
    this.opts.onStatus(s, note);
  }

  async start() {
    if (this.opts.voiceOnly) {
      this.setStatus("voice");
      return;
    }
    this.setStatus("starting");
    try {
      this.client = await this.open(this.slot);
      this.startedAt = Date.now();
      this.setStatus("ok");
    } catch (err) {
      this.client = null;
      this.setStatus("voice", err instanceof Error ? err.message : "Avatar failed to start");
      setTimeout(() => this.reconnect(), 5000);
    }
    this.relayTimer = setInterval(() => this.relayTick(), 2000);
    this.silenceTimer = setInterval(() => this.silenceTick(), 150);
  }

  private attachAudio() {
    try {
      const v = document.getElementById(this.opts.videoId(this.slot)) as HTMLVideoElement | null;
      const stream = v?.srcObject as MediaStream | null;
      if (!stream || !stream.getAudioTracks().length) return;
      if (!this.audio) {
        const ctx = new AudioContext();
        const an = ctx.createAnalyser();
        an.fftSize = 1024;
        this.audio = { ctx, an, src: null, slot: -1, buf: new Float32Array(1024) };
      }
      if (this.audio.slot === this.slot && this.audio.src) return;
      this.audio.src?.disconnect();
      this.audio.src = this.audio.ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
      this.audio.src.connect(this.audio.an);
      this.audio.slot = this.slot;
      this.audio.ctx.resume().catch(() => {});
    } catch {
      /* no Web Audio: timers and events still end the line */
    }
  }

  private silenceTick() {
    const t = this.turn;
    if (!t || t.viaBrowser || !this.client) return;
    this.attachAudio();
    const a = this.audio;
    if (!a || a.slot !== this.slot) return;
    a.an.getFloatTimeDomainData(a.buf as Float32Array<ArrayBuffer>);
    let sum = 0;
    for (let i = 0; i < a.buf.length; i++) sum += a.buf[i] * a.buf[i];
    const rms = Math.sqrt(sum / a.buf.length);
    const now = Date.now();
    if (rms > 0.012) {
      this.heardAt = now;
      if (!t.firstHeard) {
        t.firstHeard = true;
        this.lastLatencyMs = now - this.speakCalledAt;
      }
      return;
    }
    // Finished: the last beat has started, we heard it, and 1.5 s of silence since.
    const lastStarted = t.idx >= t.beats.length - 1;
    if (lastStarted && t.firstHeard && this.heardAt > t.started && now - this.heardAt > 1500) this.finish(true);
  }

  /** Session age in seconds (for the remote). */
  sessionAge() {
    return this.client ? Math.round((Date.now() - this.startedAt) / 1000) : 0;
  }

  private async open(slot: number, standby = false): Promise<AnamClient> {
    const sessionToken = await this.opts.token();
    // Microphone only when voice questions are on; it stays muted except while listening in Q&A
    // and never while the presenter is talking (no echo, no barge-in during slides).
    const c = createClient(sessionToken, { disableInputAudio: !this.opts.listen });
    if (this.opts.listen) {
      c.addListener(AnamEvent.MESSAGE_HISTORY_UPDATED, (msgs) => {
        let heard = "";
        for (const m of msgs) {
          if (m.role !== "user" || this.seenUser.has(m.id)) continue;
          this.seenUser.add(m.id);
          if (c === this.client && this.wantMic) heard = m.content;
        }
        if (heard) this.opts.onHeard?.(heard);
      });
      c.addListener(AnamEvent.SESSION_READY, () => this.applyMic());
    }
    c.addListener(AnamEvent.SESSION_READY, () => {
      if (this.standby === c) this.standbyReady = true;
    });
    c.addListener(AnamEvent.MESSAGE_STREAM_EVENT_RECEIVED, (ev) => {
      if (c !== this.client || ev.role !== "persona") return;
      const t = this.turn;
      if (!t || t.viaBrowser) return;
      if (!t.firstHeard) {
        t.firstHeard = true;
        this.lastLatencyMs = Date.now() - this.speakCalledAt;
      }
      const uid = (ev as { utteranceId?: string }).utteranceId;
      if (uid) {
        const i = t.ids.indexOf(uid);
        if (i > t.idx) {
          t.idx = i;
          this.opts.onBeat?.(i, t.beats.length);
        }
      }
      if (!ev.endOfSpeech || (ev as { interrupted?: boolean }).interrupted) return; // a cut-off is never "finished"
      if (uid && uid !== t.ids[t.ids.length - 1]) return; // end of an earlier beat
      // An end that comes far too early for the words left is not the real end.
      const est = (t.beats.slice(t.idx).reduce((a, b) => a + wordCount(b), 0) / 2.7) * 1000;
      const elapsed = Date.now() - t.started;
      const total = (t.beats.slice(t.from).reduce((a, b) => a + wordCount(b), 0) / 2.7) * 1000;
      if (elapsed < total * 0.55) {
        clearTimeout(t.timer);
        t.timer = setTimeout(() => this.finish(true), Math.max(500, Math.min(est, total - elapsed) + 500));
        return;
      }
      this.finish(true);
    });
    c.addListener(AnamEvent.MESSAGE_DELIVERY_FAILED, (f) => {
      const t = this.turn;
      if (c !== this.client || !t || t.viaBrowser || f.correlationId !== t.correlationId) return;
      // The stream couldn't be confirmed: carry on from the current beat with the backup voice.
      this.speakViaBrowser(t.idx);
    });
    c.addListener(AnamEvent.CONNECTION_CLOSED, () => {
      if (this.retiring.has(c)) return;
      if (this.standby === c) {
        this.standby = null;
        this.standbyReady = false;
        return;
      }
      if (c !== this.client) return;
      this.client = null;
      // Unplanned drop: use a warm standby if there is one, else the backup voice while we reconnect.
      if (this.standby && this.standbyReady) this.promote();
      else {
        if (this.turn && !this.turn.viaBrowser) this.speakViaBrowser(this.turn.idx);
        this.setStatus("voice", "Avatar dropped: reconnecting, backup voice meanwhile");
        setTimeout(() => this.reconnect(), 1000);
      }
    });
    const v = document.getElementById(this.opts.videoId(slot)) as HTMLVideoElement | null;
    if (v) v.muted = standby;
    if (standby) {
      this.standby = c;
      this.standbyReady = false;
    }
    await c.streamToVideoElement(this.opts.videoId(slot));
    if (this.opts.listen) {
      try {
        c.muteInputAudio();
      } catch {}
    }
    return c;
  }

  /** Listen to the room (Q&A only). The mic is open only while listening AND not speaking. */
  setListening(on: boolean) {
    this.wantMic = on && !!this.opts.listen;
    this.applyMic();
  }

  private applyMic(delayed = false) {
    if (!this.opts.listen) return;
    if (this.micTimer) clearTimeout(this.micTimer);
    const apply = () => {
      const open = this.wantMic && !this.speaking;
      for (const c of [this.client, this.standby]) {
        if (!c) continue;
        try {
          if (open && c === this.client) c.unmuteInputAudio();
          else c.muteInputAudio();
        } catch {}
      }
    };
    // Re-open a moment after speech ends so the tail of our own voice isn't heard as a question.
    if (delayed) this.micTimer = setTimeout(apply, 700);
    else apply();
  }

  private async reconnect() {
    if (this.client || this.opts.voiceOnly) return;
    try {
      this.client = await this.open(this.slot);
      this.startedAt = Date.now();
      this.setStatus("ok");
    } catch {
      setTimeout(() => this.reconnect(), 5000);
    }
  }

  private promote() {
    const next = this.standby;
    if (!next || !this.standbyReady) return false;
    const old = this.client;
    if (old) this.retiring.add(old);
    const t = this.turn;
    this.slot = 1 - this.slot;
    this.client = next;
    this.standby = null;
    this.standbyReady = false;
    this.startedAt = Date.now();
    const v = document.getElementById(this.opts.videoId(this.slot)) as HTMLVideoElement | null;
    if (v) v.muted = false;
    this.opts.onSlot(this.slot);
    this.setStatus("ok");
    this.applyMic();
    if (old) {
      try {
        old.interruptPersona();
      } catch {}
      const ov = document.getElementById(this.opts.videoId(1 - this.slot)) as HTMLVideoElement | null;
      if (ov) ov.muted = true;
      setTimeout(() => old.stopStreaming().catch(() => {}), 400);
    }
    // Mid-line swap: the new session carries on from the beat that was playing.
    if (t) this.sendBeats(t.idx);
    return true;
  }

  private relayTick() {
    if (!this.client) return;
    const age = Date.now() - this.startedAt;
    if (age > PREWARM_MS && !this.standby) {
      this.open(1 - this.slot, true).catch(() => {
        this.standby = null;
        this.standbyReady = false;
      });
    }
    if (this.standbyReady && ((age > SWAP_IDLE_MS && !this.speaking) || age > SWAP_FORCE_MS)) this.promote();
  }

  private finish(completed: boolean) {
    const t = this.turn;
    this.turn = null;
    this.speaking = false;
    if (t) {
      clearTimeout(t.timer);
      t.resolve({ completed, beat: completed ? t.beats.length - 1 : t.idx });
    }
    this.applyMic(true);
    // Planned swap at the first pause after 8:45.
    if (this.client && this.standbyReady && Date.now() - this.startedAt > SWAP_IDLE_MS) setTimeout(() => !this.speaking && this.promote(), 200);
  }

  private armTimer(t: Turn, fromBeat: number) {
    clearTimeout(t.timer);
    const left = t.beats.slice(fromBeat).reduce((a, b) => a + wordCount(b), 0);
    t.timer = setTimeout(() => this.finish(true), (left / 2.3) * 1000 + 6000); // safety net
  }

  /** Send beats [from..] to the avatar as ordered utterances in one talk stream. */
  private sendBeats(from: number) {
    const t = this.turn;
    const c = this.client;
    if (!t) return;
    if (!c) return this.speakViaBrowser(from);
    t.viaBrowser = false;
    t.idx = from;
    t.from = from;
    t.ids = t.beats.map(() => uuid());
    t.correlationId = uuid();
    t.firstHeard = false;
    t.started = Date.now();
    this.armTimer(t, from);
    const v = document.getElementById(this.opts.videoId(this.slot)) as HTMLVideoElement | null;
    if (v) v.muted = false;
    (async () => {
      // Give a just-sent interrupt a moment to settle so it can't swallow this line.
      const since = Date.now() - this.lastInterruptAt;
      if (since < 450) await new Promise((r) => setTimeout(r, 450 - since));
      if (this.turn !== t) return;
      try {
        const stream = c.createTalkMessageStream(t.correlationId);
        // All beats go at once (no 15-second gaps between chunks); Anam plays them in order.
        for (let i = from; i < t.beats.length; i++) {
          if (this.turn !== t || !stream.isActive()) return;
          await stream.streamMessageChunk(t.beats[i], i === t.beats.length - 1, t.ids[i]);
        }
      } catch {
        if (this.turn === t && !t.firstHeard) {
          // Streams unavailable: fall back to a plain talk() of the rest of the line.
          c.talk(t.beats.slice(from).join(" ")).catch(() => this.speakViaBrowser(from));
        }
      }
    })();
  }

  private speakViaBrowser(from: number) {
    const t = this.turn;
    const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
    if (!t) return;
    t.viaBrowser = true;
    t.idx = from;
    this.armTimer(t, from);
    if (!synth) return;
    synth.cancel();
    const voices = synth.getVoices();
    const voice = voices.find((v) => /en-IN/i.test(v.lang)) || voices.find((v) => /^en/i.test(v.lang)) || null;
    const say = (i: number) => {
      if (this.turn !== t) return;
      if (i >= t.beats.length) return this.finish(true);
      t.idx = i;
      this.opts.onBeat?.(i, t.beats.length);
      const u = new SpeechSynthesisUtterance(stripCues(t.beats[i]));
      u.voice = voice;
      u.onend = () => say(i + 1);
      u.onerror = () => say(i + 1);
      if (!t.firstHeard) {
        t.firstHeard = true;
        this.lastLatencyMs = Date.now() - this.speakCalledAt;
      }
      synth.speak(u);
    };
    say(from);
  }

  /** Speak a line from a given beat; resolves when finished or stopped (with the beat it reached). */
  speak(text: string, fromBeat = 0): Promise<SpeakResult> {
    this.stop();
    const beats = splitBeats(sanitizeCues(text));
    if (!beats.length) return Promise.resolve({ completed: true, beat: 0 });
    const from = Math.min(Math.max(0, fromBeat), beats.length - 1);
    this.speakCalledAt = Date.now();
    this.lastLatencyMs = null;
    return new Promise<SpeakResult>((resolve) => {
      this.speaking = true;
      this.applyMic();
      this.turn = { beats, ids: [], idx: from, from, resolve, timer: setTimeout(() => {}, 0), started: Date.now(), firstHeard: false, correlationId: "", viaBrowser: false };
      this.opts.onBeat?.(from, beats.length);
      if (this.client) this.sendBeats(from);
      else this.speakViaBrowser(from);
    });
  }

  /** Stop talking at once (Hold, jump, new line). Resolves the current line as not completed. */
  stop() {
    const v = document.getElementById(this.opts.videoId(this.slot)) as HTMLVideoElement | null;
    if (this.speaking && v) {
      v.muted = true; // silence instantly even if the service is slow to stop
      setTimeout(() => {
        if (v) v.muted = false;
      }, 700);
    }
    // Interrupt only when something is actually playing: an interrupt sent while the avatar is
    // idle swallows the next line if it follows immediately (found in the 23 Nov re-test).
    if (this.speaking && this.turn && !this.turn.viaBrowser) {
      try {
        this.client?.interruptPersona();
        this.lastInterruptAt = Date.now();
      } catch {}
    }
    try {
      window.speechSynthesis?.cancel();
    } catch {}
    this.finish(false);
  }

  async close() {
    if (this.relayTimer) clearInterval(this.relayTimer);
    if (this.silenceTimer) clearInterval(this.silenceTimer);
    this.stop();
    for (const c of [this.client, this.standby]) {
      if (!c) continue;
      this.retiring.add(c);
      await c.stopStreaming().catch(() => {});
    }
    this.client = this.standby = null;
    this.setStatus("off");
  }
}
