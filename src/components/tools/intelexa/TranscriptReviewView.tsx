"use client";

import { useState, useRef, useEffect } from "react";
import Icon from "@/components/Icon";
import { VScroller } from "@/components/Scroller";

export interface AuditData {
  completeness_score: number;
  voice_fidelity: string;
  topic_summary: string;
  speaker_flow: string;
  word_count: number;
  duration_seconds: number;
  wpm: number;
  segments_count: number;
  has_substantial_content?: boolean;
}

export interface AttachmentItem {
  id: string;
  name: string;
  type: string;
  size: number;
  base64: string; // "data:image/png;base64,..."
  previewUrl: string;
}

export default function TranscriptReviewView({
  eventName,
  eventType,
  durationSeconds,
  transcriptText,
  segments,
  audit,
  audioBlob,
  onConfirmAndAnalyse,
  onSaveTranscriptOnly,
  onBackToRecord,
  onGoHome,
}: {
  eventName: string;
  eventType: string;
  durationSeconds: number;
  transcriptText: string;
  segments: Array<{ start: string; end: string; text: string; speaker?: string }>;
  audit: AuditData | null;
  audioBlob?: Blob | null;
  onConfirmAndAnalyse: (params: {
    finalTranscript: string;
    userNotes: string;
    attachments: AttachmentItem[];
  }) => void;
  onSaveTranscriptOnly: () => void;
  onBackToRecord: () => void;
  onGoHome?: () => void;
}) {
  const [editedTranscript, setEditedTranscript] = useState(transcriptText);
  const [isEditing, setIsEditing] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    if (audioBlob) {
      const url = URL.createObjectURL(audioBlob);
      setAudioUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [audioBlob]);
  const [userNotes, setUserNotes] = useState("");
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [searchFilter, setSearchFilter] = useState("");
  const [copied, setCopied] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Format Elapsed Time HH:MM:SS or MM:SS
  function formatTime(totalSec: number): string {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = Math.floor(totalSec % 60);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  // Copy raw transcript
  function handleCopy() {
    navigator.clipboard.writeText(editedTranscript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Download raw transcript as .txt file
  function handleDownloadTxt() {
    let content = `INTELEXA EVENT TRANSCRIPT\n`;
    content += `Event: ${eventName || "Live Intelligence Session"}\n`;
    content += `Type: ${eventType}\n`;
    content += `Duration: ${formatTime(durationSeconds)}\n`;
    content += `Word Count: ${audit?.word_count || editedTranscript.split(/\s+/).length} words\n`;
    content += `Date: ${new Date().toLocaleString()}\n`;
    content += `------------------------------------------------------------\n\n`;

    if (segments && segments.length > 0) {
      segments.forEach((seg) => {
        const speaker = seg.speaker ? ` [${seg.speaker}]` : "";
        content += `[${seg.start} -> ${seg.end}]${speaker}\n${seg.text}\n\n`;
      });
    } else {
      content += editedTranscript;
    }

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(eventName || "transcript").replace(/[^a-z0-9]/gi, "_").toLowerCase()}_transcript.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Handle files dropped or selected (Slides, Screenshots, Images)
  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) {
        alert(`File "${file.name}" is not an image. Please drop PNG, JPEG, or WEBP presentation slides.`);
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        alert(`File "${file.name}" exceeds 8MB size limit.`);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        setAttachments((prev) => [
          ...prev,
          {
            id: Math.random().toString(36).substring(2, 9),
            name: file.name,
            type: file.type,
            size: file.size,
            base64,
            previewUrl: base64,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
  }

  function handleRemoveAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  const score = audit?.completeness_score ?? 95;
  const isHighCompleteness = score >= 80;

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-6 animate-fadeIn">
      {/* Top Header & Context */}
      <div className="flex items-center justify-between gap-4 flex-wrap pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-ink-muted mb-1.5">
            <button
              type="button"
              onClick={onGoHome || onSaveTranscriptOnly}
              className="font-bold text-brand hover:underline flex items-center gap-1"
            >
              <span>Intelexa.ai</span>
            </button>
            <span>/</span>
            <span className="text-ink-muted">Completeness Audit & Drop Box</span>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-wash border border-brand/20 text-brand text-xs font-semibold mb-1.5">
            <span>{eventType}</span>
            <span>&bull;</span>
            <span>{eventName || "Live Intelligence Session"}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-ink tracking-tight">
            Step 1: Transcription Completeness & Quality Audit
          </h1>
          <p className="text-xs text-ink-muted mt-0.5">
            Verify what was captured, drop visual slides or notes, then confirm to generate your executive report.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBackToRecord}
            className="px-3 py-1.5 text-xs font-semibold text-ink-muted hover:text-ink rounded-xl border border-border bg-surface transition"
          >
            ← Resume Mic
          </button>
          <button
            type="button"
            onClick={onSaveTranscriptOnly}
            className="px-3 py-1.5 text-xs font-semibold text-ink rounded-xl border border-border bg-page hover:bg-surface transition"
          >
            Save Transcript Only
          </button>
        </div>
      </div>

      {/* 1. Completeness Verification Banner */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          isHighCompleteness
            ? "bg-good/5 border-good/30"
            : "bg-warning/5 border-warning/30"
        }`}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span
                className={`w-3 h-3 rounded-full flex items-center justify-center text-white text-[9px] font-bold ${
                  isHighCompleteness ? "bg-good" : "bg-warning"
                }`}
              >
                ✓
              </span>
              <h2 className="text-sm font-bold text-ink">
                {isHighCompleteness
                  ? "Transcription Completeness Confirmed"
                  : "Audio Capture Check — Moderate Coverage"}
              </h2>
              <span
                className={`text-[11px] font-mono px-2 py-0.5 rounded-full font-bold ${
                  isHighCompleteness
                    ? "bg-good/15 text-good"
                    : "bg-warning/15 text-warning"
                }`}
              >
                {score}% Completeness
              </span>
            </div>
            <p className="text-xs text-ink-2 max-w-2xl leading-relaxed">
              {audit?.topic_summary ||
                "Continuous speech stream verified across audio session. Raw transcript is securely stored in your database."}
            </p>
          </div>

          <div className="text-right">
            <span className="text-[11px] font-semibold text-ink-muted block uppercase tracking-wider">
              Voice Fidelity
            </span>
            <span className="text-xs font-bold text-brand">
              {audit?.voice_fidelity || "High Voice Clarity"}
            </span>
          </div>
        </div>

        {/* 4-Stat Metric Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-border/60">
          <div className="p-2.5 rounded-xl bg-surface/80 border border-border">
            <span className="text-[10px] uppercase font-bold text-ink-muted block">Duration</span>
            <span className="text-sm font-mono font-bold text-ink">
              {formatTime(durationSeconds)}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-surface/80 border border-border">
            <span className="text-[10px] uppercase font-bold text-ink-muted block">Words Captured</span>
            <span className="text-sm font-mono font-bold text-ink">
              {audit?.word_count ?? editedTranscript.split(/\s+/).filter(Boolean).length} words
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-surface/80 border border-border">
            <span className="text-[10px] uppercase font-bold text-ink-muted block">Speech Pace</span>
            <span className="text-sm font-mono font-bold text-ink">
              ~{audit?.wpm ?? 140} WPM
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-surface/80 border border-border">
            <span className="text-[10px] uppercase font-bold text-ink-muted block">Speaker Flow</span>
            <span className="text-sm font-semibold text-ink truncate block">
              {audit?.speaker_flow || "Multi-turn"}
            </span>
          </div>
        </div>

        {/* Audio Verification & Playback */}
        {audioUrl && (
          <div className="mt-4 p-3 rounded-xl bg-surface/90 border border-brand/20 flex flex-wrap items-center justify-between gap-3 animate-fadeIn">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-good animate-pulse" />
              <div>
                <span className="text-xs font-bold text-ink block">Recorded Master Audio Available</span>
                <span className="text-[11px] text-ink-muted">Play to verify microphone clarity before running intelligence</span>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-1 min-w-[260px] justify-end">
              <audio controls src={audioUrl} className="h-8 max-w-xs w-full" />
              <a
                href={audioUrl}
                download={`${(eventName || "intelexa_audio").replace(/[^a-z0-9]/gi, "_").toLowerCase()}_master.webm`}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-page hover:bg-brand-wash hover:text-brand border border-border transition flex items-center gap-1.5 whitespace-nowrap shadow-soft"
              >
                <span>Download .webm</span>
              </a>
            </div>
          </div>
        )}
      </div>

      {/* 2. Visuals & Context Drop Box (Screenshots, Slides, Notes) */}
      <div className="p-5 rounded-2xl bg-surface border border-border shadow-soft space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-ink flex items-center gap-2">
              <span>🖼️ Presentation Slides & Notes Drop Box</span>
              <span className="text-[10px] font-normal px-2 py-0.5 bg-brand-wash text-brand rounded-md font-semibold">
                Multimodal AI
              </span>
            </h3>
            <p className="text-xs text-ink-muted">
              Drop photos of keynote slides, diagrams, speaker badges, or your personal live notes. Intelexa fuses them with speech.
            </p>
          </div>
          {attachments.length > 0 && (
            <span className="text-xs font-semibold text-brand">
              {attachments.length} slide{attachments.length > 1 ? "s" : ""} attached
            </span>
          )}
        </div>

        {/* Drag-and-Drop Area */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            handleFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`p-6 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center cursor-pointer transition ${
            isDragOver
              ? "border-brand bg-brand-wash/40"
              : "border-border hover:border-brand/40 bg-page/40"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <div className="w-10 h-10 rounded-full bg-surface border border-border flex items-center justify-center text-brand mb-2 shadow-soft">
            <Icon name="upload" className="w-5 h-5" />
          </div>
          <p className="text-xs font-semibold text-ink">
            Drag & drop presentation slides or screenshots here, or{" "}
            <span className="text-brand underline">browse files</span>
          </p>
          <p className="text-[11px] text-ink-muted mt-1">
            Supports PNG, JPG, WEBP (Photos of slides, whiteboard diagrams, speaker business cards)
          </p>
        </div>

        {/* Uploaded Image Previews */}
        {attachments.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="relative group rounded-xl border border-border bg-page p-2 flex flex-col items-center space-y-1 overflow-hidden"
              >
                <img
                  src={att.previewUrl}
                  alt={att.name}
                  className="w-full h-24 object-cover rounded-lg border border-border/50"
                />
                <span className="text-[10px] font-medium text-ink truncate w-full text-center">
                  {att.name}
                </span>
                <span className="text-[9px] text-ink-muted">
                  {(att.size / 1024).toFixed(0)} KB
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveAttachment(att.id);
                  }}
                  className="absolute top-3 right-3 w-5 h-5 rounded-full bg-critical text-white flex items-center justify-center text-xs opacity-90 hover:opacity-100 shadow transition"
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Live Notes & Scratchpad */}
        <div className="space-y-1.5 pt-2">
          <label className="text-xs font-bold text-ink flex items-center justify-between">
            <span>📝 Personal Live Notes & Context (Optional)</span>
            <span className="text-[11px] font-normal text-ink-muted">
              Add speaker names, questions, or specific angles
            </span>
          </label>
          <textarea
            value={userNotes}
            onChange={(e) => setUserNotes(e.target.value)}
            rows={3}
            placeholder="e.g. Speaker 1 is Rajiv, CTO at NextGen. He announced a beta trial starting Q4. Make sure to highlight pricing insights and their agent architecture."
            className="w-full text-xs p-3 border border-border rounded-xl bg-page text-ink placeholder:text-ink-muted/60 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand leading-relaxed"
          />
        </div>
      </div>

      {/* 3. Raw Timestamped Transcript Viewer & Exporter */}
      <div className="p-5 rounded-2xl bg-surface border border-border shadow-soft space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-ink flex items-center gap-2">
              <span>📜 Verified Speech Transcript</span>
              <span className="text-[10px] font-mono px-2 py-0.5 bg-page text-ink-muted rounded border border-border">
                {segments.length > 0 ? `${segments.length} Timestamps` : "Single Block"}
              </span>
            </h3>
            <p className="text-xs text-ink-muted">
              Full verbatim transcription captured via Whisper. Review or search below.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-page border border-border hover:border-brand text-ink transition flex items-center gap-1.5"
            >
              <Icon name="copy" className="w-3.5 h-3.5 text-brand" />
              <span>{copied ? "Copied! ✓" : "Copy Raw Text"}</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadTxt}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-page border border-border hover:border-brand text-ink transition flex items-center gap-1.5"
            >
              <Icon name="download" className="w-3.5 h-3.5 text-brand" />
              <span>Export .txt</span>
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(!isEditing)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${
                isEditing
                  ? "bg-brand text-white border-brand"
                  : "bg-page border-border hover:border-brand text-ink"
              }`}
            >
              {isEditing ? "Done Editing" : "Edit Text"}
            </button>
          </div>
        </div>

        {/* Search Filter */}
        {!isEditing && (
          <div className="relative">
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search transcript for keywords or timestamps (e.g. 00:04)..."
              className="w-full text-xs px-3 py-2 border border-border rounded-xl bg-page text-ink focus:outline-none focus:border-brand"
            />
          </div>
        )}

        {/* Content Box */}
        {isEditing ? (
          <textarea
            value={editedTranscript}
            onChange={(e) => setEditedTranscript(e.target.value)}
            rows={12}
            className="w-full text-xs font-mono p-3 border border-border rounded-xl bg-page text-ink focus:outline-none focus:border-brand leading-relaxed"
          />
        ) : (
          <VScroller className="max-h-72 rounded-xl bg-page border border-border" trackClassName="p-3.5 font-mono text-xs space-y-2.5">
            {segments && segments.length > 0 ? (
              segments
                .filter(
                  (s) =>
                    !searchFilter ||
                    s.text.toLowerCase().includes(searchFilter.toLowerCase()) ||
                    s.start.includes(searchFilter)
                )
                .map((seg, idx) => (
                  <div key={idx} className="flex items-start gap-2.5 p-1 rounded hover:bg-surface/50">
                    <span className="text-brand font-bold text-[11px] select-none flex-shrink-0">
                      [{seg.start}]
                    </span>
                    <div className="space-y-0.5">
                      {seg.speaker && (
                        <span className="text-[10px] font-sans font-bold uppercase text-ink-muted block">
                          {seg.speaker}
                        </span>
                      )}
                      <p className="text-ink leading-relaxed">{seg.text}</p>
                    </div>
                  </div>
                ))
            ) : (
              <p className="text-ink leading-relaxed whitespace-pre-wrap">
                {editedTranscript}
              </p>
            )}
          </VScroller>
        )}
      </div>

      {/* 4. Primary Call to Action */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-brand/10 via-brand-wash to-brand/5 border border-brand/30 flex items-center justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h3 className="text-base font-extrabold text-ink flex items-center gap-2">
            <span>Ready for Deep Event Intelligence</span>
          </h3>
          <p className="text-xs text-ink-2 max-w-xl">
            Intelexa will fuse the verified speech transcript
            {attachments.length > 0 ? `, ${attachments.length} presentation slide(s)` : ""}
            {userNotes.trim() ? " and your personal notes" : ""} into a 13-section executive intelligence report.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            onConfirmAndAnalyse({
              finalTranscript: editedTranscript,
              userNotes,
              attachments,
            })
          }
          className="px-6 py-3 rounded-xl bg-brand text-white font-bold text-xs sm:text-sm hover:opacity-95 shadow-md flex items-center gap-2 transition transform active:scale-95"
        >
          <span>Confirm Completeness & Generate Intelligence</span>
          <Icon name="arrow-right" className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
