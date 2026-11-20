"use client";
// Presenter Studio — the presenter's face and voice on the TV.
// Anam avatar (its own brain off: it only speaks the text we give it), with
// - a relay that swaps to a fresh session between lines before the 10-minute cap,
// - an automatic fallback to the browser's voice if the avatar can't start or drops.
import { createClient, AnamEvent } from "@anam-ai/js-sdk";
import type { AnamClient } from "@anam-ai/js-sdk";

type Status = "starting" | "ok" | "voice" | "off";

export class Presenter {
  private client: AnamClient | null = null;
  private standby: AnamClient | null = null;
  private standbyReady = false;
  private slot = 0;
  private startedAt = 0;
  private retiring = new WeakSet<AnamClient>();
  private pending: { resolve: () => void; timer: ReturnType<typeof setTimeout>; started: number; words: number } | null = null;
  private relayTimer: ReturnType<typeof setInterval> | null = null;
  speaking = false;
  status: Status = "off";

  constructor(
    private opts: {
      videoId: (slot: number) => string;
      onStatus: (s: Status, note?: string) => void;
      onSlot: (slot: number) => void;
      personaId?: string;
      voiceOnly?: boolean;
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
    }
    this.relayTimer = setInterval(() => this.relayTick(), 5000);
  }

  private async open(slot: number, standby = false): Promise<AnamClient> {
    const res = await fetch("/api/presenter/anam-token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personaId: this.opts.personaId || undefined }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.sessionToken) throw new Error(data.error || "No avatar token");
    const c = createClient(data.sessionToken);
    c.addListener(AnamEvent.SESSION_READY, () => {
      try {
        c.muteInputAudio(); // no room listening in Studio v1
      } catch {}
      if (this.standby === c) this.standbyReady = true;
    });
    c.addListener(AnamEvent.MESSAGE_STREAM_EVENT_RECEIVED, (ev) => {
      if (c !== this.client || ev.role !== "persona" || !ev.endOfSpeech) return;
      if ((ev as { interrupted?: boolean }).interrupted) return; // a cut-off is never "finished"
      const p = this.pending;
      if (!p) return;
      // An end that arrives far too early for the length of the line is not the real end.
      const est = (p.words / 2.7) * 1000;
      const elapsed = Date.now() - p.started;
      if (elapsed < est * 0.6) {
        clearTimeout(p.timer);
        p.timer = setTimeout(() => this.finish(), est - elapsed + 500);
        return;
      }
      this.finish();
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
      this.finish();
      // Unplanned drop: use a warm standby, else reconnect; meanwhile the browser voice covers.
      if (this.standby && this.standbyReady) this.promote();
      else {
        this.setStatus("voice", "Avatar dropped: reconnecting, using the backup voice meanwhile");
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
    return c;
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
    this.slot = 1 - this.slot;
    this.client = next;
    this.standby = null;
    this.standbyReady = false;
    this.startedAt = Date.now();
    const v = document.getElementById(this.opts.videoId(this.slot)) as HTMLVideoElement | null;
    if (v) v.muted = false;
    this.opts.onSlot(this.slot);
    this.setStatus("ok");
    if (old) setTimeout(() => old.stopStreaming().catch(() => {}), 400);
    return true;
  }

  /** Explorer caps a session at 10 min: warm a second one at 8 min, swap between lines after 9. */
  private relayTick() {
    if (!this.client) return;
    const age = Date.now() - this.startedAt;
    if (age > 8 * 60_000 && !this.standby) this.open(1 - this.slot, true).catch(() => (this.standby = null));
    if (age > 9 * 60_000 && this.standbyReady && !this.speaking) this.promote();
  }

  private finish() {
    const p = this.pending;
    this.pending = null;
    this.speaking = false;
    if (p) {
      clearTimeout(p.timer);
      p.resolve();
    }
  }

  /** Speak a line; resolves when finished or stopped. */
  speak(text: string): Promise<void> {
    this.stop();
    const t = text.trim();
    if (!t) return Promise.resolve();
    const words = t.split(/\s+/).length;
    return new Promise<void>((resolve) => {
      this.speaking = true;
      // Safety net if the end-of-speech event never arrives.
      const timer = setTimeout(() => this.finish(), (words / 2.3) * 1000 + 6000);
      this.pending = { resolve, timer, started: Date.now(), words };
      const v = document.getElementById(this.opts.videoId(this.slot)) as HTMLVideoElement | null;
      if (v) v.muted = false;
      if (this.client) {
        this.client.talk(t).catch(() => this.browserVoice(t));
      } else {
        this.browserVoice(t);
      }
    });
  }

  private browserVoice(t: string) {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(t);
    const voices = synth.getVoices();
    u.voice = voices.find((v) => /en-IN/i.test(v.lang)) || voices.find((v) => /^en/i.test(v.lang)) || null;
    u.rate = 1.0;
    u.onend = () => this.finish();
    u.onerror = () => this.finish();
    synth.speak(u);
  }

  /** Stop talking at once (Hold, jump, new line). */
  stop() {
    const v = document.getElementById(this.opts.videoId(this.slot)) as HTMLVideoElement | null;
    if (this.speaking && v) {
      v.muted = true; // silence instantly even if the service is slow to stop
      setTimeout(() => {
        if (v) v.muted = false;
      }, 700);
    }
    try {
      this.client?.interruptPersona();
    } catch {}
    try {
      window.speechSynthesis?.cancel();
    } catch {}
    this.finish();
  }

  async close() {
    if (this.relayTimer) clearInterval(this.relayTimer);
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
