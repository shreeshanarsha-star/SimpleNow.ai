"use client";

import { useState, useEffect, useCallback } from "react";
import Icon from "@/components/Icon";
import { useRegisterToolHome } from "@/components/ToolHomeContext";
import ProfileModal, { type IntelexaProfileData, type RecipientData } from "./ProfileModal";
import NewEventModal, { type NewEventParams } from "./NewEventModal";
import LiveRecordingView from "./LiveRecordingView";
import TranscriptReviewView from "./TranscriptReviewView";
import EventDetailView, { type EventDetailData } from "./EventDetailView";
import { DEMO_EVENT_ID } from "@/lib/intelexaDemoData";

export default function IntelexaApp({
  initialUser,
}: {
  initialUser: { id: string; email: string };
}) {
  const [view, setView] = useState<"dashboard" | "recording" | "review_completeness" | "processing" | "detail">("dashboard");

  // User Profile & Recipients
  const [profile, setProfile] = useState<Partial<IntelexaProfileData>>({
    email: initialUser.email,
  });
  const [recipients, setRecipients] = useState<RecipientData[]>([]);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [newEventModalOpen, setNewEventModalOpen] = useState(false);

  // Review & Completeness Audit State
  const [reviewData, setReviewData] = useState<{
    eventId: string;
    eventName: string;
    eventType: string;
    durationSeconds: number;
    transcriptText: string;
    segments: Array<{ start: string; end: string; text: string; speaker?: string }>;
    audit: any;
    audioBlob?: Blob;
  } | null>(null);

  // Events list & selected event
  const [events, setEvents] = useState<EventDetailData[]>([]);
  const [stats, setStats] = useState<{
    totalEvents: number;
    connections?: number;
    keyConnections?: number;
    highValueOpportunities?: number;
    keyPeopleConnected?: number;
    actionItemsCreated?: number;
    avgCommercialYield?: number | null;
  }>({
    totalEvents: 0,
    connections: 0,
    keyConnections: 0,
    highValueOpportunities: 0,
    keyPeopleConnected: 0,
    actionItemsCreated: 0,
    avgCommercialYield: null,
  });
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedEventData, setSelectedEventData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Active Session & Processing
  const [activeSession, setActiveSession] = useState<{
    id: string;
    eventName: string;
    eventType: string;
    watchFor: string;
  } | null>(null);

  const [processingStep, setProcessingStep] = useState<string>("Initializing AI analysis pipeline...");
  const [searchQuery, setSearchQuery] = useState("");
  const [quickStarting, setQuickStarting] = useState(false);

  // Handler to return directly to Intelexa.ai Home Page (Dashboard)
  const handleGoHome = useCallback(() => {
    setView("dashboard");
    setSelectedEventId(null);
    setSelectedEventData(null);
    setActiveSession(null);
    setReviewData(null);
  }, []);

  // Register with AppShell / Topbar so clicking "Intelexa.ai" in header returns home
  useRegisterToolHome(handleGoHome);

  // Also listen for custom events from Sidebar
  useEffect(() => {
    window.addEventListener("intelexa-go-home", handleGoHome);
    return () => window.removeEventListener("intelexa-go-home", handleGoHome);
  }, [handleGoHome]);

  // 1. Fetch Profile and Events on Mount
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [profileRes, eventsRes] = await Promise.all([
          fetch("/api/intelexa/profile"),
          fetch("/api/intelexa/events"),
        ]);

        if (profileRes.ok) {
          const pData = await profileRes.json();
          if (pData.profile) setProfile(pData.profile);
          if (pData.recipients) setRecipients(pData.recipients);
        }

        if (eventsRes.ok) {
          const eData = await eventsRes.json();
          setEvents(eData.events || []);
          if (eData.stats) setStats(eData.stats);
        }
      } catch (err) {
        console.error("Failed to load Intelexa data:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  // 2. Open Event Detail
  async function openEventDetail(id: string) {
    setLoading(true);
    setSelectedEventId(id);
    try {
      const res = await fetch(`/api/intelexa/events/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedEventData(data);
        setView("detail");
      } else {
        alert("Failed to load event details.");
      }
    } catch (err) {
      alert("Error loading event.");
    } finally {
      setLoading(false);
    }
  }

  // 3. Save Profile
  async function handleSaveProfile(newProfile: IntelexaProfileData, newRecipients: RecipientData[]) {
    const res = await fetch("/api/intelexa/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile: newProfile, recipients: newRecipients }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to save profile.");
    }

    const data = await res.json();
    setProfile(data.profile);
    setRecipients(data.recipients);
  }

  // 4. Start Event
  async function handleStartEvent(params: NewEventParams) {
    // If user uploaded an audio file directly
    if (params.audioFile) {
      setView("processing");
      setProcessingStep("Uploading audio recording to transcription server...");

      const createRes = await fetch("/api/intelexa/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_name: params.eventName,
          event_type: params.eventType,
          objectives: params.objectives,
          watch_for: params.watchFor,
          location: params.location,
          recipients: params.recipients,
        }),
      });

      const { event } = await createRes.json();

      setProcessingStep("Transcribing audio via Whisper AI with timestamps...");
      const formData = new FormData();
      formData.append("file", params.audioFile);

      const transcribeRes = await fetch("/api/intelexa/transcribe", {
        method: "POST",
        body: formData,
      });

      const transcribeData = await transcribeRes.json();
      const fullText = transcribeData.text || "Uploaded audio recording.";
      const segments = transcribeData.segments || [];
      const durationSeconds = Math.round(transcribeData.duration || 600);

      // Verify completeness first & permanently store raw transcript
      setProcessingStep("Auditing transcription completeness & voice fidelity...");
      const verifyRes = await fetch(`/api/intelexa/events/${event.id}/verify-transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript_text: fullText,
          transcript_segments: segments,
          duration_seconds: durationSeconds,
        }),
      });

      let audit = null;
      if (verifyRes.ok) {
        const vData = await verifyRes.json();
        audit = vData.audit;
      }

      setReviewData({
        eventId: event.id,
        eventName: params.eventName || "Audio Recording Session",
        eventType: params.eventType || "Recording",
        durationSeconds,
        transcriptText: fullText,
        segments,
        audit,
      });

      setView("review_completeness");
      return;
    }

    // Live Mic Session
    const res = await fetch("/api/intelexa/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_name: params.eventName,
        event_type: params.eventType,
        objectives: params.objectives,
        watch_for: params.watchFor,
        location: params.location,
        recipients: params.recipients,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to create event session.");
    }

    const { event } = await res.json();
    setActiveSession({
      id: event.id,
      eventName: event.event_name,
      eventType: event.event_type,
      watchFor: event.watch_for,
    });

    setView("recording");
  }

  // 4b. Immediate 1-Click Start Capture (Bypasses setup modal, begins capturing instantly)
  async function handleQuickStart() {
    if (quickStarting) return;
    setQuickStarting(true);
    try {
      const now = new Date();
      const dateStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      const defaultName = `Live Session • ${dateStr}, ${timeStr}`;

      await handleStartEvent({
        eventName: defaultName,
        eventType: "Conference",
        objectives: ["Find business opportunities", "Networking"],
        watchFor: profile.what_matters_to_me || "",
        location: "",
        recipients: recipients || [],
        audioFile: null,
      });
    } catch (err) {
      console.error("Quick start error:", err);
      alert("Could not start event capture. Please check microphone permissions.");
    } finally {
      setQuickStarting(false);
    }
  }

  // 5. Stop Recording -> Verify Completeness -> Transcript Review Screen
  async function handleStopAndAnalyse(data: {
    transcriptText: string;
    segments: Array<{ start: string; end: string; text: string }>;
    durationSeconds: number;
    audioBlob?: Blob;
  }) {
    if (!activeSession) return;
    const eventId = activeSession.id;

    setView("processing");
    setProcessingStep("Finalizing transcription and auditing completeness...");

    try {
      // 1. Audit Completeness and permanently store raw transcript
      const verifyRes = await fetch(`/api/intelexa/events/${eventId}/verify-transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript_text: data.transcriptText,
          transcript_segments: data.segments,
          duration_seconds: data.durationSeconds,
        }),
      });

      let audit = null;
      if (verifyRes.ok) {
        const vData = await verifyRes.json();
        audit = vData.audit;
      }

      setReviewData({
        eventId,
        eventName: activeSession.eventName,
        eventType: activeSession.eventType,
        durationSeconds: data.durationSeconds,
        transcriptText: data.transcriptText,
        segments: data.segments,
        audit,
        audioBlob: data.audioBlob,
      });

      setView("review_completeness");
    } catch (e) {
      console.error("Verification step error:", e);
      setReviewData({
        eventId,
        eventName: activeSession.eventName,
        eventType: activeSession.eventType,
        durationSeconds: data.durationSeconds,
        transcriptText: data.transcriptText,
        segments: data.segments,
        audit: null,
        audioBlob: data.audioBlob,
      });
      setView("review_completeness");
    }
  }

  // 6. Confirm Completeness & Run Multimodal Intelligence Analysis
  async function handleConfirmAndAnalyse(params: {
    finalTranscript: string;
    userNotes: string;
    attachments: any[];
  }) {
    if (!reviewData) return;
    const eventId = reviewData.eventId;

    setView("processing");
    setProcessingStep("Fusing speech transcript, visual slides, and notes...");

    try {
      setTimeout(() => {
        setProcessingStep("Extracting entities, slide data, and strategic signals...");
      }, 1500);

      setTimeout(() => {
        setProcessingStep("Mining opportunities, pain points & personalizing against your goals...");
      }, 3500);

      setTimeout(() => {
        setProcessingStep("Constructing 13-section intelligence report and executive brief...");
      }, 6000);

      setTimeout(() => {
        setProcessingStep("Delivering intelligence report via Email and WhatsApp...");
      }, 8500);

      const res = await fetch(`/api/intelexa/events/${eventId}/analyse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript_text: params.finalTranscript,
          transcript_segments: reviewData.segments,
          duration_seconds: reviewData.durationSeconds,
          user_notes: params.userNotes,
          attachments: params.attachments,
          auto_name: !reviewData.eventName || reviewData.eventName === "Untitled Event Session",
        }),
      });

      if (res.ok) {
        // Refresh events list
        const refreshRes = await fetch("/api/intelexa/events");
        if (refreshRes.ok) {
          const eData = await refreshRes.json();
          setEvents(eData.events || []);
          if (eData.stats) setStats(eData.stats);
        }

        await openEventDetail(eventId);
      } else {
        const err = await res.json();
        alert(err.error || "Failed to analyze event.");
        setView("dashboard");
      }
    } catch (e) {
      alert("Analysis error: " + (e as Error).message);
      setView("dashboard");
    } finally {
      setActiveSession(null);
      setReviewData(null);
    }
  }

  // 7. Save Raw Transcript Only (Skip heavy AI analysis)
  async function handleSaveTranscriptOnly() {
    if (!reviewData) return;
    const eventId = reviewData.eventId;
    await openEventDetail(eventId);
    setActiveSession(null);
    setReviewData(null);
  }

  // 6. Delete Event Handlers
  async function handleDeleteEvent(id: string) {
    await fetch(`/api/intelexa/events/${id}`, { method: "DELETE" });
    const refreshRes = await fetch("/api/intelexa/events");
    if (refreshRes.ok) {
      const eData = await refreshRes.json();
      setEvents(eData.events || []);
      if (eData.stats) setStats(eData.stats);
    } else {
      setEvents(events.filter((e) => e.id !== id));
    }
    setView("dashboard");
  }

  async function handleDeleteTranscript(id: string) {
    await fetch(`/api/intelexa/events/${id}?target=transcript`, { method: "DELETE" });
    if (selectedEventData) {
      setSelectedEventData({
        ...selectedEventData,
        transcript: { full_text: "[Deleted for privacy]", segments: [] },
      });
    }
  }

  async function handleDeleteReport(id: string) {
    await fetch(`/api/intelexa/events/${id}?target=report`, { method: "DELETE" });
    if (selectedEventData) {
      setSelectedEventData({
        ...selectedEventData,
        report: { executive_brief: [], what_happened: "", full_markdown: "" },
      });
    }
  }

  // 7. Sync Task to SimpleNow To-Do List
  async function handleSyncTodo(task: string, deadline?: string): Promise<boolean> {
    if (!selectedEventId) return false;
    try {
      const res = await fetch(`/api/intelexa/events/${selectedEventId}/sync-todo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task,
          deadline,
          event_name: selectedEventData?.event?.event_name,
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // 8. Redeliver Report
  async function handleRedeliver(channel?: "email" | "whatsapp") {
    if (!selectedEventId) return;
    try {
      const res = await fetch(`/api/intelexa/events/${selectedEventId}/redeliver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel }),
      });
      if (res.ok) {
        alert("Report dispatched to configured recipients!");
      } else {
        alert("Redelivery completed. Check delivery log.");
      }
    } catch (e) {
      alert("Redelivery error: " + (e as Error).message);
    }
  }

  // 9. Re-Generate Intelligence for existing event
  async function handleReAnalyse(eventId: string) {
    setView("processing");
    setProcessingStep("Fusing saved transcript and mining strategic signals...");

    try {
      setTimeout(() => {
        setProcessingStep("Mining opportunities, pain points & personalizing against your goals...");
      }, 2000);

      setTimeout(() => {
        setProcessingStep("Constructing 13-section intelligence report and executive brief...");
      }, 5000);

      const res = await fetch(`/api/intelexa/events/${eventId}/analyse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auto_name: false,
        }),
      });

      if (res.ok) {
        // Refresh events list
        const refreshRes = await fetch("/api/intelexa/events");
        if (refreshRes.ok) {
          const eData = await refreshRes.json();
          setEvents(eData.events || []);
          if (eData.stats) setStats(eData.stats);
        }

        await openEventDetail(eventId);
      } else {
        const err = await res.json();
        alert(err.error || "Failed to re-analyze event.");
        await openEventDetail(eventId);
      }
    } catch (e) {
      alert("Re-analysis error: " + (e as Error).message);
      await openEventDetail(eventId);
    }
  }

  // Filtered Events
  const filteredEvents = events.filter(
    (e) =>
      !searchQuery ||
      e.event_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.event_type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-full">
      {/* VIEW 1: LIVE RECORDING */}
      {view === "recording" && activeSession && (
        <LiveRecordingView
          sessionId={activeSession.id}
          eventName={activeSession.eventName}
          eventType={activeSession.eventType}
          watchFor={activeSession.watchFor}
          onStopAndAnalyse={handleStopAndAnalyse}
        />
      )}

      {/* VIEW: TRANSCRIPTION COMPLETENESS AUDIT & DROP BOX */}
      {view === "review_completeness" && reviewData && (
        <TranscriptReviewView
          eventName={reviewData.eventName}
          eventType={reviewData.eventType}
          durationSeconds={reviewData.durationSeconds}
          transcriptText={reviewData.transcriptText}
          segments={reviewData.segments}
          audit={reviewData.audit}
          audioBlob={reviewData.audioBlob}
          onConfirmAndAnalyse={handleConfirmAndAnalyse}
          onSaveTranscriptOnly={handleSaveTranscriptOnly}
          onGoHome={handleGoHome}
          onBackToRecord={() => {
            if (activeSession) {
              setView("recording");
            } else {
              setView("dashboard");
            }
          }}
        />
      )}

      {/* VIEW 2: PROCESSING STATE */}
      {view === "processing" && (
        <div className="max-w-xl mx-auto py-20 px-4 text-center space-y-6 animate-fadeIn">
          <div className="w-20 h-20 rounded-3xl bg-brand-wash text-brand mx-auto flex items-center justify-center shadow-soft relative">
            <div className="w-12 h-12 rounded-full border-4 border-brand border-t-transparent animate-spin" />
            <span className="absolute text-xl">⚡</span>
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold text-ink">
              Intelexa is analysing your event...
            </h2>
            <p className="text-sm text-brand font-medium animate-pulse">
              {processingStep}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-surface border border-border text-xs text-ink-muted text-left space-y-2 max-w-md mx-auto shadow-soft">
            <div className="font-semibold text-ink">Autonomous Pipeline Execution:</div>
            <div className="space-y-1.5 font-mono text-[11px]">
              <div>✓ Edge audio capture finalized</div>
              <div>✓ Timestamped segmentation initialized</div>
              <div>⏳ Mining business opportunities & people</div>
              <div>⏳ Comparing against persistent profile context</div>
              <div>⏳ Formulating 13-section intelligence report</div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: EVENT DETAIL VIEW */}
      {view === "detail" && selectedEventData && (
        <EventDetailView
          event={selectedEventData.event}
          transcript={selectedEventData.transcript}
          intelligence={selectedEventData.intelligence}
          report={selectedEventData.report}
          initialQa={selectedEventData.qa}
          onBack={() => setView("dashboard")}
          onDeleteEvent={() => handleDeleteEvent(selectedEventData.event.id)}
          onDeleteTranscript={() => handleDeleteTranscript(selectedEventData.event.id)}
          onDeleteReport={() => handleDeleteReport(selectedEventData.event.id)}
          onSyncTodo={handleSyncTodo}
          onRedeliver={handleRedeliver}
          onReAnalyse={() => handleReAnalyse(selectedEventData.event.id)}
        />
      )}

      {/* VIEW 4: MAIN DASHBOARD & EVENT LIBRARY */}
      {view === "dashboard" && (
        <div className="max-w-6xl mx-auto py-6 px-4 space-y-8 animate-fadeIn">
          {/* Header Bar */}
          <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-br from-surface via-brand-wash/30 to-surface border border-border shadow-soft flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-wash border border-brand/30 text-brand text-xs font-bold uppercase tracking-wider w-fit">
              <span>⚡ INTELEXA.AI</span>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-shrink-0">
              <button
                type="button"
                onClick={() => openEventDetail(DEMO_EVENT_ID)}
                className="px-4 py-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs font-bold hover:bg-amber-500/20 transition flex items-center justify-center gap-2"
                title="Explore pre-loaded synthetic demonstration event"
              >
                <span>⚡</span>
                Try Demo Event
              </button>

              {/* Event Settings Button (Changed +New Event to Settings Icon) */}
              <button
                type="button"
                onClick={() => setNewEventModalOpen(true)}
                className="p-2.5 sm:px-3 sm:py-2.5 rounded-2xl border border-border bg-surface text-ink hover:bg-page transition shadow-soft flex items-center justify-center gap-1.5 group"
                title="Event Settings & Profile Goals"
                aria-label="Event Settings"
              >
                <Icon name="gear" className="w-4 h-4 text-ink-muted group-hover:text-ink transition group-hover:rotate-45" />
                <span className="text-xs font-semibold text-ink-muted group-hover:text-ink transition hidden sm:inline">
                  Settings
                </span>
              </button>

              {/* Immediate One-Click Start Capture */}
              <button
                type="button"
                onClick={handleQuickStart}
                disabled={quickStarting}
                className="px-6 py-2.5 rounded-2xl bg-critical text-white text-xs font-black tracking-wide hover:bg-critical/90 transition shadow-button flex items-center justify-center gap-2 disabled:opacity-50"
                title="Immediately start capturing live event audio & intelligence"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
                <span>{quickStarting ? "STARTING..." : "START"}</span>
              </button>
            </div>
          </div>

          {/* Real Dynamic Metrics */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-ink-muted">
              <span className="font-bold uppercase tracking-wider text-[10px]">
                Your Live Event Metrics
              </span>
              {stats.totalEvents === 0 ? (
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  Awaiting first recording &bull; Explore Demo Event below
                </span>
              ) : (
                <span className="text-good-text font-medium">
                  Dynamically calculated across {stats.totalEvents} {stats.totalEvents === 1 ? "session" : "sessions"}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-surface border border-border shadow-soft">
                <div className="text-xs font-medium text-ink-muted">My Events</div>
                <div className="text-2xl font-extrabold text-ink mt-1">
                  {stats.totalEvents}
                </div>
                <div className="text-[11px] text-ink-muted mt-0.5">
                  {stats.totalEvents === 0 ? "0 recorded" : `${stats.totalEvents} recorded`}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-surface border border-border shadow-soft">
                <div className="text-xs font-medium text-ink-muted">My connections</div>
                <div className="text-2xl font-extrabold text-brand mt-1">
                  {(stats.connections ?? stats.keyPeopleConnected ?? 0) > 0
                    ? `👥 ${stats.connections ?? stats.keyPeopleConnected}`
                    : "0"}
                </div>
                <div className="text-[11px] text-ink-muted mt-0.5">
                  {(stats.connections ?? stats.keyPeopleConnected ?? 0) > 0
                    ? "Identified during events"
                    : "Identified during events"}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-surface border border-border shadow-soft">
                <div className="text-xs font-medium text-ink-muted">My key connections</div>
                <div className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 mt-1">
                  {(stats.keyConnections ?? stats.highValueOpportunities ?? 0) > 0
                    ? `⭐ ${stats.keyConnections ?? stats.highValueOpportunities}`
                    : "0"}
                </div>
                <div className="text-[11px] text-ink-muted mt-0.5">
                  {(stats.keyConnections ?? stats.highValueOpportunities ?? 0) > 0
                    ? "High-priority stakeholders"
                    : "High-priority stakeholders"}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-surface border border-border shadow-soft">
                <div className="text-xs font-medium text-ink-muted">My action items</div>
                <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
                  {(stats.actionItemsCreated || 0) > 0 ? `✅ ${stats.actionItemsCreated}` : "0"}
                </div>
                <div className="text-[11px] text-ink-muted mt-0.5">
                  {(stats.actionItemsCreated || 0) > 0
                    ? "Prioritized tasks & follow-ups"
                    : "Extracted from event decisions"}
                </div>
              </div>
            </div>
          </div>

          {/* Event Library Section (Section 16) */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-ink">Event Intelligence Library</h2>
                <p className="text-xs text-ink-muted">
                  Review reports, opportunities, people, and timestamped transcripts.
                </p>
              </div>

              <div className="w-full sm:w-64">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search events by title or type..."
                  className="w-full text-xs px-3.5 py-2 border border-border rounded-xl bg-surface text-ink focus:outline-none focus:border-brand"
                />
              </div>
            </div>

            {/* Event Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Synthetic Demo Card (Always available at top) */}
              <div
                onClick={() => openEventDetail(DEMO_EVENT_ID)}
                className="p-5 rounded-2xl bg-surface border-2 border-brand/30 hover:border-brand cursor-pointer transition shadow-soft flex flex-col justify-between space-y-4 group relative overflow-hidden"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold text-[10px] border border-amber-500/30">
                      DEMO DATA
                    </span>
                    <span className="text-[11px] font-mono text-ink-muted">2h 08m</span>
                  </div>

                  <h3 className="text-sm font-bold text-ink group-hover:text-brand transition leading-snug">
                    TechSparks 2026: The Agentic Enterprise — AI in Action
                  </h3>
                  <p className="text-xs text-ink-muted line-clamp-2">
                    Keynote & panel on autonomous workflow agents, ATS screening calibration, and LinkedIn Hiring Assistant alternatives.
                  </p>
                </div>

                <div className="pt-3 border-t border-border flex items-center justify-between text-xs text-ink-muted">
                  <div className="flex items-center gap-3">
                    <span>💡 24 Insights</span>
                    <span>👥 8 People</span>
                    <span className="text-brand font-semibold">🔥 5 Opps</span>
                  </div>
                  <span className="text-brand font-bold group-hover:translate-x-1 transition">
                    View &rarr;
                  </span>
                </div>
              </div>

              {/* User Real Events */}
              {filteredEvents.map((evt) => {
                const totalS = evt.duration_seconds || 0;
                const durH = Math.floor(totalS / 3600);
                const durM = Math.floor((totalS % 3600) / 60);
                const durStr = durH > 0 ? `${durH}h ${durM}m` : `${durM}m`;

                return (
                  <div
                    key={evt.id}
                    onClick={() => openEventDetail(evt.id)}
                    className="p-5 rounded-2xl bg-surface border border-border hover:border-brand/60 cursor-pointer transition shadow-soft flex flex-col justify-between space-y-4 group"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="px-2 py-0.5 rounded-full bg-brand-wash text-brand font-bold text-[10px]">
                          {evt.event_type}
                        </span>
                        <span className="text-[11px] font-mono text-ink-muted">{durStr}</span>
                      </div>

                      <h3 className="text-sm font-bold text-ink group-hover:text-brand transition leading-snug">
                        {evt.event_name}
                      </h3>
                      <p className="text-xs text-ink-muted">
                        {evt.location ? `📍 ${evt.location}` : "Live session"} &bull;{" "}
                        {new Date(evt.start_time || "").toLocaleDateString()}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-border flex items-center justify-between text-xs text-ink-muted">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${
                          evt.processing_status === "completed"
                            ? "bg-good-wash text-good-text"
                            : evt.processing_status === "processing"
                            ? "bg-warning-wash text-warning"
                            : "bg-page text-ink-muted"
                        }`}
                      >
                        {evt.processing_status === "completed"
                          ? "Report Complete"
                          : evt.processing_status === "processing"
                          ? "Processing..."
                          : "Captured"}
                      </span>
                      <span className="text-brand font-semibold group-hover:translate-x-1 transition">
                        View Report &rarr;
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <ProfileModal
        open={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        initialProfile={profile}
        initialRecipients={recipients}
        onSave={handleSaveProfile}
      />

      <NewEventModal
        open={newEventModalOpen}
        onClose={() => setNewEventModalOpen(false)}
        defaultRecipients={recipients}
        initialProfile={profile}
        onSaveProfile={handleSaveProfile}
        onStartEvent={handleStartEvent}
      />
    </div>
  );
}
