"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { useVoiceDictation } from "./useVoiceDictation";
import VoiceRecordingBar from "./VoiceRecordingBar";
import { NoteSynthesisMode, VoiceNoteAnalysis } from "@/app/api/personal/notes/ai/route";

type Note = {
  id: string;
  title: string | null;
  body: string;
  created_at: string;
  updated_at: string;
};

type ActionItem = {
  text: string;
  due_date?: string | null;
};

function fmt(s: string) {
  return new Date(s).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function QuickNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [activeId, setActiveId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Voice Module State
  const [showVoiceBar, setShowVoiceBar] = useState(false);
  const [voiceTarget, setVoiceTarget] = useState<"new" | "append">("new");
  const [synthesisMode, setSynthesisMode] = useState<NoteSynthesisMode>("auto");
  const [isProcessingAi, setIsProcessingAi] = useState(false);
  const [lastRawTranscript, setLastRawTranscript] = useState<string | null>(null);
  const [showRawDrawer, setShowRawDrawer] = useState(false);

  // Cross-tool: Action items detected for To-Do List sync
  const [detectedTasks, setDetectedTasks] = useState<ActionItem[]>([]);
  const [syncingTodos, setSyncingTodos] = useState(false);
  const [todosSynced, setTodosSynced] = useState(false);

  // Copy status
  const [copied, setCopied] = useState(false);

  // Voice Hook
  const {
    isSupported,
    isRecording,
    isPaused,
    durationSec,
    transcript,
    interimTranscript,
    fullTranscript,
    error: voiceError,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    reset: resetVoice,
  } = useVoiceDictation();

  useEffect(() => {
    let mounted = true;
    async function loadNotes() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/personal/notes");
        const data = await res.json();
        if (!mounted) return;
        if (!res.ok) throw new Error(data.error || "Could not load notes.");
        const fetchedNotes: Note[] = data.notes || [];
        setNotes(fetchedNotes);
        if (fetchedNotes.length > 0) {
          selectNote(fetchedNotes[0]);
        }
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Could not load notes.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadNotes();
    return () => {
      mounted = false;
    };
  }, []);

  function selectNote(n: Note) {
    setActiveId(n.id);
    setTitle(n.title || "");
    setBody(n.body || "");
    setDetectedTasks([]);
    setTodosSynced(false);
  }

  async function createNote(customTitle = "", customBody = ""): Promise<Note | null> {
    setSaving(true);
    try {
      const res = await fetch("/api/personal/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: customTitle, body: customBody }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create note.");
      setNotes((prev) => [data.note, ...prev]);
      selectNote(data.note);
      return data.note;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create note.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  function scheduleSave(nextTitle: string, nextBody: string) {
    if (!activeId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        const res = await fetch(`/api/personal/notes/${activeId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: nextTitle, body: nextBody }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not save note.");
        setNotes((prev) =>
          prev
            .map((n) => (n.id === activeId ? data.note : n))
            .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save note.");
      } finally {
        setSaving(false);
      }
    }, 600);
  }

  async function deleteNote(id: string) {
    try {
      const res = await fetch(`/api/personal/notes/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not delete note.");
      }
      const remaining = notes.filter((n) => n.id !== id);
      setNotes(remaining);
      if (activeId === id) {
        if (remaining.length) selectNote(remaining[0]);
        else {
          setActiveId(null);
          setTitle("");
          setBody("");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete note.");
    }
  }

  // Voice Actions
  function handleOpenVoice(target: "new" | "append") {
    setVoiceTarget(target);
    setShowVoiceBar(true);
    resetVoice();
    startRecording();
  }

  function handleCancelVoice() {
    resetVoice();
    setShowVoiceBar(false);
    setIsProcessingAi(false);
  }

  async function handleSynthesizeVoice() {
    const finalSpeech = stopRecording();
    if (!finalSpeech) {
      handleCancelVoice();
      return;
    }

    setIsProcessingAi(true);
    setLastRawTranscript(finalSpeech);

    try {
      const res = await fetch("/api/personal/notes/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: finalSpeech,
          mode: synthesisMode,
          existingTitle: voiceTarget === "append" ? title : undefined,
          existingBody: voiceTarget === "append" ? body : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to structure voice note.");

      const analysis: VoiceNoteAnalysis = data.analysis;

      if (voiceTarget === "new") {
        const newNote = await createNote(analysis.title, analysis.body);
        if (newNote) {
          selectNote(newNote);
        }
      } else {
        // Append mode
        const separator = body.trim() ? "\n\n---\n\n" : "";
        const updatedBody = body + separator + analysis.body;
        const updatedTitle = title.trim() ? title : analysis.title;
        setTitle(updatedTitle);
        setBody(updatedBody);
        scheduleSave(updatedTitle, updatedBody);
      }

      // Check if action items were extracted
      if (analysis.action_items && analysis.action_items.length > 0) {
        setDetectedTasks(analysis.action_items);
        setTodosSynced(false);
      } else {
        setDetectedTasks([]);
      }

      setShowVoiceBar(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI voice processing failed.");
      // Fallback: save raw transcript so speech is never lost
      if (voiceTarget === "new") {
        await createNote("Voice Note", finalSpeech);
      } else {
        const separator = body.trim() ? "\n\n" : "";
        const fallbackBody = body + separator + finalSpeech;
        setBody(fallbackBody);
        scheduleSave(title, fallbackBody);
      }
      setShowVoiceBar(false);
    } finally {
      setIsProcessingAi(false);
      resetVoice();
    }
  }

  // Cross-Tool Bridge: Push detected tasks to To-Do List
  async function handleSyncTasksToTodos() {
    if (detectedTasks.length === 0 || syncingTodos) return;
    setSyncingTodos(true);
    try {
      for (const item of detectedTasks) {
        await fetch("/api/personal/todos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: item.text,
            due_date: item.due_date || null,
          }),
        });
      }
      setTodosSynced(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sync tasks to To-Do List.");
    } finally {
      setSyncingTodos(false);
    }
  }

  function handleCopyNote() {
    if (!body) return;
    navigator.clipboard.writeText(`${title ? `# ${title}\n\n` : ""}${body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const filteredNotes = notes.filter((n) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (n.title || "").toLowerCase().includes(q) || (n.body || "").toLowerCase().includes(q);
  });

  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0;
  const charCount = body.length;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[13px] text-ink-muted py-6">
        <svg className="animate-spin h-4 w-4 text-brand" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <span>Loading notes…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 max-w-4xl">
      {/* Top Banner Alert if Error */}
      {(error || voiceError) && (
        <div className="flex items-center justify-between bg-critical-wash border border-critical/20 text-critical text-[12px] rounded-lg px-3.5 py-2.5 shadow-xs">
          <span>{error || voiceError}</span>
          <button onClick={() => { setError(null); }} className="text-[11px] underline font-medium hover:opacity-80">
            Dismiss
          </button>
        </div>
      )}

      {/* Voice Recording Floating / Top Bar */}
      {showVoiceBar && (
        <VoiceRecordingBar
          isRecording={isRecording}
          isPaused={isPaused}
          durationSec={durationSec}
          transcript={transcript}
          interimTranscript={interimTranscript}
          isProcessing={isProcessingAi}
          mode={synthesisMode}
          onModeChange={setSynthesisMode}
          onPause={pauseRecording}
          onResume={resumeRecording}
          onCancel={handleCancelVoice}
          onSynthesize={handleSynthesizeVoice}
        />
      )}

      {/* Action Items Detected Banner (Ecosystem Bridge to To-Do List) */}
      {detectedTasks.length > 0 && (
        <div className="bg-brand-wash/60 border border-brand/30 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 animate-fadeIn">
          <div className="flex items-start sm:items-center gap-2">
            <span className="text-brand flex-shrink-0 mt-0.5 sm:mt-0">
              <Icon name="check" className="w-4 h-4 text-brand" />
            </span>
            <div className="text-[12px]">
              <span className="font-semibold text-ink">
                {detectedTasks.length} Action {detectedTasks.length === 1 ? "Item" : "Items"} detected in speech:
              </span>{" "}
              <span className="text-ink-2">
                {detectedTasks.map((t) => t.text).slice(0, 2).join("; ")}
                {detectedTasks.length > 2 ? ` (+${detectedTasks.length - 2} more)` : ""}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-auto">
            {todosSynced ? (
              <span className="flex items-center gap-1 text-[11.5px] font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md">
                <Icon name="check" className="w-3.5 h-3.5" /> Added to To-Dos
              </span>
            ) : (
              <button
                type="button"
                disabled={syncingTodos}
                onClick={handleSyncTasksToTodos}
                className="flex items-center gap-1.5 text-[11.5px] font-semibold text-white bg-brand hover:brightness-105 active:scale-95 disabled:opacity-50 px-3 py-1.5 rounded-md shadow-xs transition-all"
              >
                {syncingTodos ? (
                  "Adding…"
                ) : (
                  <>
                    <Icon name="check" className="w-3.5 h-3.5" />
                    <span>Push to To-Do List</span>
                  </>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => setDetectedTasks([])}
              className="text-ink-muted hover:text-ink text-[11px] px-1 py-0.5"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Workspace: Sidebar & Editor */}
      <div className="flex flex-col sm:flex-row gap-3 h-[480px]">
        {/* Left Sidebar */}
        <div className="w-full sm:w-64 flex-shrink-0 border border-border rounded-xl bg-surface flex flex-col overflow-hidden shadow-xs">
          {/* Action Bar: New Note & Voice Note */}
          <div className="p-2 border-b border-border bg-page/40 flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setShowVoiceBar(false);
                  createNote();
                }}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-1.5 text-[12px] font-semibold text-ink bg-surface hover:bg-page border border-border px-2.5 py-1.5 rounded-lg shadow-xs transition-colors disabled:opacity-50"
              >
                <span>+ New note</span>
              </button>

              {/* Premium Voice Dictate Button */}
              <button
                type="button"
                onClick={() => handleOpenVoice("new")}
                disabled={showVoiceBar}
                title="Dictate new note with AI"
                className="flex items-center gap-1 text-[12px] font-semibold text-brand bg-brand-wash hover:brightness-95 border border-brand/30 px-2.5 py-1.5 rounded-lg transition-all active:scale-95 disabled:opacity-50"
              >
                <Icon name="mic" className="w-3.5 h-3.5" />
                <span>Voice</span>
              </button>
            </div>

            {/* Quick Search */}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search notes…"
                className="w-full text-[11.5px] bg-surface border border-border/80 rounded-md pl-7 pr-2 py-1 outline-none text-ink placeholder:text-ink-muted focus:border-brand"
              />
              <div className="absolute left-2 top-1.5 text-ink-muted pointer-events-none">
                <Icon name="search" className="w-3 h-3" />
              </div>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1.5 text-[10px] text-ink-muted hover:text-ink"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Notes List */}
          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {filteredNotes.length === 0 ? (
              <div className="text-[12px] text-ink-muted text-center py-8 px-4">
                {searchQuery ? "No matching notes found." : "No notes yet. Click + New note or Voice to start."}
              </div>
            ) : (
              filteredNotes.map((n) => {
                const isSelected = activeId === n.id;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      selectNote(n);
                      setShowVoiceBar(false);
                    }}
                    className={`w-full text-left px-3.5 py-2.5 transition-colors ${
                      isSelected ? "bg-brand-wash/80 border-l-2 border-brand" : "hover:bg-page/80"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <div className={`text-[12.5px] font-medium truncate ${isSelected ? "text-brand font-semibold" : "text-ink"}`}>
                        {n.title || "Untitled Note"}
                      </div>
                    </div>
                    <div className="text-[11px] text-ink-muted truncate line-clamp-1">
                      {n.body.replace(/[#*`_-]/g, "").trim() || "Empty note"}
                    </div>
                    <div className="text-[10px] text-ink-muted/80 mt-1 flex items-center justify-between">
                      <span>{fmt(n.updated_at)}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Editor Panel */}
        <div className="flex-1 border border-border rounded-xl bg-surface flex flex-col overflow-hidden shadow-xs">
          {!activeId ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center text-ink-muted">
              <div className="w-12 h-12 rounded-full bg-brand-wash flex items-center justify-center text-brand">
                <Icon name="book" className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-ink">No note selected</p>
                <p className="text-[12px] text-ink-muted mt-0.5">
                  Select a note from the left, start typing, or dictate with AI Voice.
                </p>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => createNote()}
                  className="text-[12px] font-semibold text-ink bg-page border border-border hover:bg-border/40 px-3 py-1.5 rounded-lg transition-colors"
                >
                  + New note
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenVoice("new")}
                  className="flex items-center gap-1.5 text-[12px] font-semibold text-white bg-brand hover:brightness-105 px-3 py-1.5 rounded-lg shadow-xs transition-colors"
                >
                  <Icon name="mic" className="w-3.5 h-3.5" />
                  <span>Dictate Note</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Note Header Bar */}
              <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5 bg-page/30">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    scheduleSave(e.target.value, body);
                  }}
                  placeholder="Note Title…"
                  className="flex-1 text-[14px] font-semibold bg-transparent outline-none text-ink placeholder:text-ink-muted/70 min-w-0"
                />

                {/* Header Action Tools */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Append / Dictate into active note */}
                  <button
                    type="button"
                    onClick={() => handleOpenVoice("append")}
                    disabled={showVoiceBar}
                    title="Dictate and append to this note"
                    className="flex items-center gap-1 text-[11.5px] font-medium text-brand hover:bg-brand-wash px-2 py-1 rounded-md transition-colors disabled:opacity-40"
                  >
                    <Icon name="mic" className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Dictate</span>
                  </button>

                  {/* Copy Button */}
                  <button
                    type="button"
                    onClick={handleCopyNote}
                    disabled={!body}
                    title="Copy note"
                    className="flex items-center gap-1 text-[11.5px] font-medium text-ink-2 hover:bg-page px-2 py-1 rounded-md transition-colors disabled:opacity-40"
                  >
                    <Icon name={copied ? "check" : "copy"} className="w-3.5 h-3.5 text-ink-muted" />
                    <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
                  </button>

                  {/* Raw Transcript Drawer toggle if available */}
                  {lastRawTranscript && (
                    <button
                      type="button"
                      onClick={() => setShowRawDrawer((prev) => !prev)}
                      className={`text-[11px] font-medium px-2 py-1 rounded-md border transition-colors ${
                        showRawDrawer
                          ? "bg-brand text-white border-brand"
                          : "text-ink-muted bg-surface border-border hover:bg-page"
                      }`}
                      title="View original voice transcript"
                    >
                      Raw
                    </button>
                  )}

                  {/* Saving status */}
                  <span className="text-[11px] text-ink-muted font-medium w-12 text-right">
                    {saving ? "Saving…" : "Saved"}
                  </span>

                  {/* Delete Button */}
                  <button
                    type="button"
                    onClick={() => deleteNote(activeId)}
                    title="Delete note"
                    className="text-[11px] font-semibold text-critical hover:bg-critical-wash px-2 py-1 rounded-md transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Collapsible Raw Voice Transcript Drawer for full transparency */}
              {showRawDrawer && lastRawTranscript && (
                <div className="bg-page/80 border-b border-border p-3 text-[12px] text-ink-2 animate-fadeIn flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[11.5px] text-ink uppercase tracking-wider">
                      Original Audio Transcript
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowRawDrawer(false)}
                      className="text-[11px] text-ink-muted hover:text-ink"
                    >
                      ✕ Close
                    </button>
                  </div>
                  <p className="italic text-ink-muted leading-relaxed font-sans bg-surface/90 border border-border/70 p-2.5 rounded-md">
                    &ldquo;{lastRawTranscript}&rdquo;
                  </p>
                </div>
              )}

              {/* Note Content Textarea */}
              <div className="flex-1 flex flex-col relative overflow-hidden">
                <textarea
                  value={body}
                  onChange={(e) => {
                    setBody(e.target.value);
                    scheduleSave(title, e.target.value);
                  }}
                  placeholder="Start typing or click 'Voice' above to speak..."
                  className="flex-1 w-full resize-none bg-transparent outline-none p-4 text-[13px] text-ink-2 leading-relaxed font-sans"
                />
              </div>

              {/* Bottom Metadata Bar: Word count, Char count, Keyboard hint */}
              <div className="border-t border-border px-4 py-1.5 bg-page/40 flex items-center justify-between text-[11px] text-ink-muted">
                <div className="flex items-center gap-3">
                  <span>{wordCount} {wordCount === 1 ? "word" : "words"}</span>
                  <span>•</span>
                  <span>{charCount} characters</span>
                </div>
                <div className="hidden sm:flex items-center gap-1.5">
                  <span className="text-ink-muted/80">Markdown supported</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
