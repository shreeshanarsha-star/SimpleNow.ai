"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import type { RecipientData } from "./ProfileModal";

const EVENT_TYPES = [
  "Conference",
  "Seminar",
  "Meeting",
  "Networking",
  "Workshop",
  "Training",
  "Sales",
  "Investor",
  "Other",
] as const;

const OBJECTIVE_OPTIONS = [
  "Find business opportunities",
  "Networking",
  "Competitive intelligence",
  "Find customers",
  "Learn",
  "Market research",
  "Recruitment",
  "Partnership",
  "General",
] as const;

export interface NewEventParams {
  eventName: string;
  eventType: string;
  objectives: string[];
  watchFor: string;
  location: string;
  recipients: RecipientData[];
  audioFile?: File | null;
}

export default function NewEventModal({
  open,
  onClose,
  defaultRecipients,
  onStartEvent,
}: {
  open: boolean;
  onClose: () => void;
  defaultRecipients: RecipientData[];
  onStartEvent: (params: NewEventParams) => Promise<void>;
}) {
  const [eventName, setEventName] = useState("");
  const [eventType, setEventType] = useState<string>("Conference");
  const [objectives, setObjectives] = useState<string[]>(["Find business opportunities", "Networking"]);
  const [watchFor, setWatchFor] = useState("");
  const [location, setLocation] = useState("");
  const [recipients, setRecipients] = useState<RecipientData[]>(defaultRecipients || []);
  const [mode, setMode] = useState<"mic" | "upload">("mic");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function toggleObjective(obj: string) {
    if (objectives.includes(obj)) {
      setObjectives(objectives.filter((o) => o !== obj));
    } else {
      setObjectives([...objectives, obj]);
    }
  }

  async function handleStart() {
    if (mode === "upload" && !audioFile) {
      setError("Please select an audio file to upload.");
      return;
    }

    setStarting(true);
    setError(null);

    try {
      await onStartEvent({
        eventName: eventName.trim(),
        eventType,
        objectives,
        watchFor: watchFor.trim(),
        location: location.trim(),
        recipients,
        audioFile: mode === "upload" ? audioFile : null,
      });
      onClose();
    } catch (e) {
      setError((e as Error).message || "Failed to start event.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
      <div className="bg-surface border border-border w-full max-w-xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-page/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-critical/10 text-critical flex items-center justify-center font-bold text-sm">
              🔴
            </div>
            <div>
              <h2 className="text-base font-bold text-ink leading-tight">Start New Event Intelligence</h2>
              <p className="text-[12px] text-ink-muted">
                Intelexa will listen, extract opportunities, and generate your report.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-ink-muted hover:text-ink p-1 rounded-lg hover:bg-page transition"
          >
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="p-3 bg-critical/10 border border-critical/30 text-critical text-xs rounded-lg font-medium">
              {error}
            </div>
          )}

          {/* Mode Switcher: Live Mic vs Upload */}
          <div className="flex p-1 bg-page rounded-xl border border-border">
            <button
              type="button"
              onClick={() => setMode("mic")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg transition ${
                mode === "mic"
                  ? "bg-surface text-ink shadow-soft"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-critical animate-pulse" />
              Live Microphone Session
            </button>
            <button
              type="button"
              onClick={() => setMode("upload")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg transition ${
                mode === "upload"
                  ? "bg-surface text-ink shadow-soft"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              <Icon name="upload" className="w-3.5 h-3.5" />
              Upload Audio File / Memo
            </button>
          </div>

          {/* Event Name */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-ink">Event Name</label>
              <span className="text-[11px] text-ink-muted">Optional (Auto-generated if left blank)</span>
            </div>
            <input
              type="text"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              placeholder="e.g. B2B SaaS Summit 2026 or leave blank for auto-title"
              className="w-full text-xs px-3.5 py-2.5 border border-border rounded-xl bg-surface text-ink focus:outline-none focus:border-brand"
            />
          </div>

          {/* Event Type & Location */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-ink mb-1">Event Type</label>
              <select
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-border rounded-xl bg-surface text-ink focus:outline-none focus:border-brand"
              >
                {EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1">Location / Venue</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Marriott, Bengaluru"
                className="w-full text-xs px-3 py-2 border border-border rounded-xl bg-surface text-ink focus:outline-none focus:border-brand"
              />
            </div>
          </div>

          {/* Objectives (Multi-select) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-ink">Event Objectives</label>
              <span className="text-[11px] text-ink-muted">Select all that apply</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {OBJECTIVE_OPTIONS.map((obj) => {
                const selected = objectives.includes(obj);
                return (
                  <button
                    key={obj}
                    type="button"
                    onClick={() => toggleObjective(obj)}
                    className={`text-[11px] font-medium px-2.5 py-1.5 rounded-lg border transition ${
                      selected
                        ? "bg-brand text-white border-brand shadow-sm"
                        : "bg-surface text-ink-2 border-border hover:bg-page"
                    }`}
                  >
                    {selected ? "✓ " : "+ "}
                    {obj}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Anything specific to watch for */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-ink">
                Anything specific I should watch for?
              </label>
              <span className="text-[11px] text-brand font-medium">Custom Radar</span>
            </div>
            <textarea
              rows={2}
              value={watchFor}
              onChange={(e) => setWatchFor(e.target.value)}
              placeholder="e.g. Look for TA heads and HR directors who may need AI recruitment automation or complain about ATS integrations."
              className="w-full text-xs p-3 border border-border rounded-xl bg-surface text-ink focus:outline-none focus:border-brand leading-relaxed"
            />
          </div>

          {/* Audio Upload File Picker (if upload mode) */}
          {mode === "upload" && (
            <div className="p-4 border border-dashed border-border rounded-xl bg-page/40 text-center">
              <input
                type="file"
                accept="audio/*,video/mp4"
                id="audio-upload-input"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) setAudioFile(e.target.files[0]);
                }}
              />
              <label
                htmlFor="audio-upload-input"
                className="cursor-pointer block space-y-2"
              >
                <div className="w-10 h-10 rounded-full bg-brand-wash text-brand mx-auto flex items-center justify-center">
                  <Icon name="upload" className="w-5 h-5" />
                </div>
                {audioFile ? (
                  <div>
                    <div className="text-xs font-bold text-ink">{audioFile.name}</div>
                    <div className="text-[11px] text-ink-muted">
                      {(audioFile.size / (1024 * 1024)).toFixed(2)} MB &bull; Tap to replace
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="text-xs font-semibold text-brand hover:underline">
                      Click to choose an audio recording
                    </div>
                    <div className="text-[11px] text-ink-muted mt-0.5">
                      Supports .m4a, .mp3, .wav, .webm, .mp4 (Voice memos, meeting recordings)
                    </div>
                  </div>
                )}
              </label>
            </div>
          )}

          {/* Delivery Preview */}
          <div className="p-3 bg-page/50 border border-border rounded-xl text-xs space-y-1">
            <div className="font-semibold text-ink flex items-center gap-1.5">
              <span>📬 Delivery Configuration:</span>
            </div>
            <p className="text-[11px] text-ink-muted leading-relaxed">
              When stopped, your intelligence report will be constructed and dispatched automatically via Email & WhatsApp to all configured recipients.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-border bg-page/50 flex items-center justify-between">
          <div className="text-[11px] text-ink-muted hidden sm:block">
            {mode === "mic" ? "Requires microphone permission" : "Processed via Whisper AI"}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-ink-2 hover:bg-page rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleStart}
              disabled={starting}
              className="px-6 py-2.5 text-xs font-bold bg-brand text-white rounded-xl hover:bg-brand/90 transition shadow-sm flex items-center gap-2 disabled:opacity-50"
            >
              {starting ? (
                "Initializing..."
              ) : mode === "mic" ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-critical animate-ping" />
                  START INTELEXA
                </>
              ) : (
                <>
                  <Icon name="upload" className="w-3.5 h-3.5" />
                  ANALYSE RECORDING
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
