"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import { HScroller, VScroller } from "@/components/Scroller";
import type { ExtractedIntelligence } from "@/lib/intelexaAI";

export interface EventDetailData {
  id: string;
  event_name: string;
  event_type: string;
  objectives?: string[];
  watch_for?: string;
  start_time?: string;
  end_time?: string;
  duration_seconds?: number;
  location?: string;
  recording_status?: string;
  processing_status?: string;
  processing_step?: string;
  is_demo?: boolean;
  recipients?: any[];
  metadata?: any;
}

export interface TranscriptData {
  full_text: string;
  segments?: Array<{ start: string; end: string; text: string; speaker?: string }>;
}

export interface ReportData {
  executive_brief?: string[];
  what_happened?: string;
  full_markdown?: string;
  email_delivery_status?: string;
  whatsapp_delivery_status?: string;
  delivery_log?: Array<{
    channel: string;
    recipient: string;
    status: string;
    detail?: string;
    timestamp: string;
  }>;
}

export interface QAPair {
  question: string;
  answer: string;
  citations?: string[];
}

export default function EventDetailView({
  event,
  transcript,
  intelligence,
  report,
  initialQa,
  onBack,
  onDeleteEvent,
  onDeleteTranscript,
  onDeleteReport,
  onSyncTodo,
  onRedeliver,
  onReAnalyse,
}: {
  event: EventDetailData;
  transcript?: TranscriptData | null;
  intelligence?: ExtractedIntelligence | null;
  report?: ReportData | null;
  initialQa?: QAPair[];
  onBack: () => void;
  onDeleteEvent: () => Promise<void>;
  onDeleteTranscript: () => Promise<void>;
  onDeleteReport: () => Promise<void>;
  onSyncTodo: (task: string, deadline?: string) => Promise<boolean>;
  onRedeliver: (channel?: "email" | "whatsapp") => Promise<void>;
  onReAnalyse?: () => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<
    "report" | "opportunities" | "people" | "competitive" | "actions" | "transcript" | "qa"
  >("report");

  // Q&A State
  const [qaHistory, setQaHistory] = useState<QAPair[]>(initialQa || []);
  const [questionInput, setQuestionInput] = useState("");
  const [asking, setAsking] = useState(false);
  const [syncedTasks, setSyncedTasks] = useState<Record<string, boolean>>({});
  const [copiedDraft, setCopiedDraft] = useState<string | null>(null);
  const [transcriptFilter, setTranscriptFilter] = useState("");
  const [showPrivacyMenu, setShowPrivacyMenu] = useState(false);
  const [redelivering, setRedelivering] = useState(false);
  const [reanalysing, setReanalysing] = useState(false);

  // Format Duration
  const totalSec = event.duration_seconds || 0;
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const durationFormatted = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

  // Jump to transcript segment
  function handleJumpToTimestamp(ts: string) {
    setActiveTab("transcript");
    setTranscriptFilter(ts);
  }

  // Copy helper
  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopiedDraft(label);
    setTimeout(() => setCopiedDraft(null), 2000);
  }

  // Handle Ask Intelexa
  async function handleAskQuestion(qText: string) {
    if (!qText.trim()) return;
    setAsking(true);
    setQuestionInput("");

    try {
      const res = await fetch(`/api/intelexa/events/${event.id}/qa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: qText.trim() }),
      });

      const data = await res.json();
      if (res.ok) {
        setQaHistory((prev) => [...prev, { question: qText, answer: data.answer, citations: data.citations }]);
      } else {
        alert(data.error || "Failed to get answer");
      }
    } catch (e) {
      alert((e as Error).message || "Error asking question");
    } finally {
      setAsking(false);
    }
  }

  async function handleSyncTask(task: string, deadline?: string) {
    const ok = await onSyncTodo(task, deadline);
    if (ok) {
      setSyncedTasks((prev) => ({ ...prev, [task]: true }));
    }
  }

  async function triggerRedeliver(channel?: "email" | "whatsapp") {
    setRedelivering(true);
    try {
      await onRedeliver(channel);
    } finally {
      setRedelivering(false);
    }
  }

  // Generate WhatsApp Share Link (1-tap direct dispatch)
  const waShareText = encodeURIComponent(
    `*Intelexa Event Intelligence*\n*${event.event_name}*\n⏱ ${durationFormatted}\n\n*Top Insight:*\n${
      intelligence?.insights?.[0]?.insight || "Analysis completed"
    }\n\n*Next Action:*\n${
      intelligence?.action_plan?.do_today?.[0]?.task || intelligence?.top_3_recommendations?.[0] || "Review full report"
    }\n\n👉 *Full Report:* ${typeof window !== "undefined" ? window.location.href : ""}`
  );
  const waShareUrl = `https://wa.me/?text=${waShareText}`;

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-6 animate-fadeIn">
      {/* Top Bar: Back & Event Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-ink-muted mb-1">
            <button
              type="button"
              onClick={onBack}
              className="font-bold text-brand hover:underline flex items-center gap-1"
            >
              <span>Intelexa.ai</span>
            </button>
            <span>/</span>
            <button
              type="button"
              onClick={onBack}
              className="hover:underline text-ink-muted hover:text-ink font-medium"
            >
              Events Library
            </button>
            <span>/</span>
            <span className="truncate max-w-[220px] sm:max-w-md text-ink font-semibold">
              {event.event_name}
            </span>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold text-ink">{event.event_name}</h1>
            {event.is_demo && (
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold text-[11px] border border-amber-500/30">
                DEMO DATA
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-ink-muted flex-wrap">
            <span className="font-semibold text-ink-2">{event.event_type}</span>
            <span>&bull;</span>
            <span>Duration: {durationFormatted}</span>
            {event.location && (
              <>
                <span>&bull;</span>
                <span>📍 {event.location}</span>
              </>
            )}
          </div>
        </div>

        {/* Delivery Badges & Primary Actions */}
        <div className="flex items-center gap-2 flex-wrap self-start md:self-auto">
          {/* Status Badges */}
          <div className="flex items-center gap-1.5 p-1.5 rounded-xl bg-page border border-border text-[11px] font-medium">
            <span
              className={`px-2 py-0.5 rounded-md ${
                report?.email_delivery_status === "sent"
                  ? "bg-good-wash text-good-text"
                  : "bg-surface text-ink-muted"
              }`}
              title="Email Delivery Status"
            >
              Email {report?.email_delivery_status === "sent" ? "✅" : "⏳"}
            </span>

            <span
              className={`px-2 py-0.5 rounded-md ${
                report?.whatsapp_delivery_status === "sent" || report?.whatsapp_delivery_status === "prepared"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-surface text-ink-muted"
              }`}
              title="WhatsApp Delivery Status"
            >
              WhatsApp {report?.whatsapp_delivery_status === "sent" ? "✅" : "💬"}
            </span>
          </div>

          {/* 1-Tap WhatsApp Share */}
          <a
            href={waShareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-semibold text-xs hover:bg-emerald-700 transition shadow-sm"
          >
            <Icon name="whatsapp" className="w-3.5 h-3.5" />
            Share WhatsApp
          </a>

          {/* Re-Generate Intelligence Button */}
          {onReAnalyse && !event.is_demo && (
            <button
              type="button"
              onClick={async () => {
                setReanalysing(true);
                try {
                  await onReAnalyse();
                } finally {
                  setReanalysing(false);
                }
              }}
              disabled={reanalysing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand text-white font-semibold text-xs hover:bg-brand/90 transition shadow-sm disabled:opacity-50"
              title="Re-run AI Intelligence Analysis and build fresh report on this transcript"
            >
              <Icon name="sparkles" className="w-3.5 h-3.5" />
              {reanalysing ? "Analysing..." : "⚡ Re-Generate Intelligence"}
            </button>
          )}

          {/* Re-deliver / Retry Button */}
          <button
            type="button"
            onClick={() => triggerRedeliver()}
            disabled={redelivering}
            className="px-3 py-1.5 rounded-xl border border-border bg-surface text-ink text-xs font-semibold hover:bg-page transition shadow-soft disabled:opacity-50"
            title="Retry sending report to all recipients"
          >
            {redelivering ? "Sending..." : "Resend Report"}
          </button>

          {/* Privacy Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowPrivacyMenu(!showPrivacyMenu)}
              className="p-2 rounded-xl border border-border bg-surface text-ink-muted hover:text-ink transition shadow-soft"
              title="Privacy & Data Retention"
            >
              <Icon name="gear" className="w-4 h-4" />
            </button>

            {showPrivacyMenu && (
              <div className="absolute right-0 mt-2 w-56 p-2 rounded-xl bg-surface border border-border shadow-xl z-30 text-xs space-y-1">
                <div className="px-2 py-1 font-bold text-ink text-[11px] uppercase tracking-wider">
                  Privacy & Retention
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (confirm("Delete transcript text for this event?")) {
                      await onDeleteTranscript();
                      setShowPrivacyMenu(false);
                    }
                  }}
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-page text-ink-2"
                >
                  Delete Transcript Only
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (confirm("Delete generated intelligence report?")) {
                      await onDeleteReport();
                      setShowPrivacyMenu(false);
                    }
                  }}
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-page text-ink-2"
                >
                  Delete Report Only
                </button>
                <div className="border-t border-border pt-1">
                  <button
                    type="button"
                    onClick={async () => {
                      if (confirm("Permanently delete this entire event and all data?")) {
                        await onDeleteEvent();
                        setShowPrivacyMenu(false);
                      }
                    }}
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-critical/10 text-critical font-semibold"
                  >
                    Delete Entire Event
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs Navigation with zero native scrollbars */}
      <HScroller className="border-b border-border" trackClassName="flex items-center gap-2 pb-1">
        {[
          { id: "report", label: "📊 Intelligence Report" },
          { id: "opportunities", label: `🎯 Opportunities (${intelligence?.opportunities?.length || 0})` },
          { id: "people", label: `👥 People & Follow-ups (${intelligence?.people?.length || 0})` },
          { id: "competitive", label: "⚔️ Competitive & Market" },
          { id: "actions", label: "✅ Action Plan" },
          { id: "transcript", label: "🎙️ Transcript" },
          { id: "qa", label: `💬 Ask Intelexa (${qaHistory.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-3.5 py-2 text-xs font-semibold rounded-t-xl transition whitespace-nowrap ${
              activeTab === tab.id
                ? "bg-surface border-t-2 border-brand text-brand shadow-soft"
                : "text-ink-muted hover:text-ink hover:bg-page/50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </HScroller>

      {/* TAB 1: Intelligence Report */}
      {activeTab === "report" && (
        <div className="space-y-6">
          {/* If report is missing or empty */}
          {(!report?.executive_brief || report.executive_brief.length === 0) && !report?.full_markdown && (
            <div className="p-8 rounded-2xl bg-surface border border-border text-center space-y-4 shadow-soft">
              <div className="text-4xl">🎙️</div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-ink">Intelligence Report Not Yet Generated</h3>
                <p className="text-xs text-ink-muted max-w-md mx-auto">
                  This session has transcript data captured, but the full 13-section AI intelligence report has not been generated yet.
                </p>
              </div>
              {onReAnalyse && (
                <button
                  type="button"
                  onClick={async () => {
                    setReanalysing(true);
                    try {
                      await onReAnalyse();
                    } finally {
                      setReanalysing(false);
                    }
                  }}
                  disabled={reanalysing}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand text-white font-bold text-xs hover:bg-brand/90 transition shadow-button disabled:opacity-50"
                >
                  <Icon name="sparkles" className="w-4 h-4" />
                  {reanalysing ? "Generating Intelligence Report..." : "⚡ Generate Intelligence Report Now"}
                </button>
              )}
            </div>
          )}

          {/* Executive Brief (Section 13.1) */}
          <div className="p-5 rounded-2xl bg-surface border border-border shadow-soft space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-brand flex items-center gap-2">
                <span>⚡ Executive Brief</span>
                <span className="text-[11px] font-normal text-ink-muted">(Read in under 60 seconds)</span>
              </h2>
            </div>
            <ul className="space-y-2 text-xs text-ink leading-relaxed">
              {(report?.executive_brief || []).map((bullet, idx) => (
                <li key={idx} className="flex items-start gap-2.5">
                  <span className="text-brand font-bold mt-0.5">&bull;</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </div>


          {/* Top 3 Recommendations (Section 13.9) */}
          {intelligence?.top_3_recommendations && intelligence.top_3_recommendations.length > 0 && (
            <div className="p-5 rounded-2xl bg-gradient-to-br from-brand-wash to-surface border border-brand/20 shadow-soft space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-brand">
                🎯 Top 3 Strategic Recommendations
              </h3>
              <p className="text-[11px] text-ink-muted">
                If you only do three things following this event, prioritize these:
              </p>
              <div className="space-y-2.5">
                {intelligence.top_3_recommendations.map((rec, i) => (
                  <div key={i} className="p-3 rounded-xl bg-surface border border-border text-xs text-ink font-medium leading-relaxed">
                    {rec}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* What Matters: Ranked Insights with Provenance Badges (Section 12 & 13.3) */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              What Matters Most (Key Insights & Provenance)
            </h3>
            <div className="space-y-3">
              {(intelligence?.insights || []).map((ins, i) => {
                const isObserved = ins.classification === "OBSERVED";
                const isInferred = ins.classification === "INFERRED";
                const badgeColor = isObserved
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                  : isInferred
                  ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30";

                return (
                  <div
                    key={i}
                    className="p-4 rounded-2xl bg-surface border border-border shadow-soft space-y-2"
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wide ${badgeColor}`}>
                          [{ins.classification}]
                        </span>
                        <h4 className="text-xs sm:text-sm font-bold text-ink">{ins.insight}</h4>
                      </div>
                      {ins.timestamp && (
                        <button
                          type="button"
                          onClick={() => handleJumpToTimestamp(ins.timestamp)}
                          className="text-[11px] font-mono text-brand hover:underline"
                          title="Jump to transcript segment"
                        >
                          ⏱ {ins.timestamp} &rarr;
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 text-xs">
                      <div className="p-2.5 bg-page rounded-xl border border-border">
                        <span className="text-[10px] font-bold uppercase text-ink-muted block mb-1">
                          What was said:
                        </span>
                        <p className="text-ink leading-relaxed">{ins.what_was_said}</p>
                      </div>
                      <div className="p-2.5 bg-page rounded-xl border border-border">
                        <span className="text-[10px] font-bold uppercase text-ink-muted block mb-1">
                          What it means:
                        </span>
                        <p className="text-ink leading-relaxed">{ins.what_it_means}</p>
                      </div>
                      <div className="p-2.5 bg-brand-wash rounded-xl border border-brand/20">
                        <span className="text-[10px] font-bold uppercase text-brand block mb-1">
                          Why it matters to you:
                        </span>
                        <p className="text-ink leading-relaxed">{ins.why_matters}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Opportunities (Section 13.5) */}
      {activeTab === "opportunities" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Identified Business & Commercial Opportunities
            </h3>
            <span className="text-xs text-ink-muted">Prioritized by revenue and partnership potential</span>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {(intelligence?.opportunities || []).map((opp, idx) => {
              const isHigh = opp.priority === "HIGH";
              const isMed = opp.priority === "MEDIUM";
              const priorityBadge = isHigh
                ? "bg-critical/10 text-critical border-critical/30"
                : isMed
                ? "bg-warning/10 text-warning border-warning/30"
                : "bg-surface text-ink-muted border-border";

              return (
                <div
                  key={idx}
                  className="p-4 rounded-2xl bg-surface border border-border shadow-soft space-y-2.5"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${priorityBadge}`}>
                        {isHigh ? "🔥 High Priority" : isMed ? "🟡 Medium Priority" : "⚪ Low Priority"}
                      </span>
                      <h4 className="text-xs sm:text-sm font-bold text-ink">{opp.opportunity}</h4>
                    </div>
                    {opp.person_company && (
                      <span className="text-xs font-medium text-ink-2 bg-page px-2 py-0.5 rounded-md border border-border">
                        {opp.person_company}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-ink-muted block mb-0.5">
                        Strategic Reason:
                      </span>
                      <p className="text-ink leading-relaxed">{opp.reason}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase text-ink-muted block mb-0.5">
                        Evidence Cited:
                      </span>
                      <p className="text-ink-2 italic leading-relaxed">&ldquo;{opp.evidence}&rdquo;</p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-border flex items-center justify-between flex-wrap gap-2">
                    <div className="text-xs text-ink font-semibold">
                      <span className="text-brand">Recommended Action: </span>
                      {opp.recommended_action}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: People & Follow-ups (Section 13.4, 13.10, 13.11) */}
      {activeTab === "people" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              People Detected & Tailored Outreach Drafts
            </h3>
            <span className="text-xs text-ink-muted">Includes Email, WhatsApp, and LinkedIn drafts</span>
          </div>

          <div className="space-y-4">
            {(intelligence?.people || []).map((person, idx) => (
              <div
                key={idx}
                className="p-5 rounded-2xl bg-surface border border-border shadow-soft space-y-4"
              >
                {/* Person Header */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h4 className="text-base font-bold text-ink">{person.name}</h4>
                    <p className="text-xs text-ink-muted">
                      {person.role} {person.company ? `• ${person.company}` : ""}
                    </p>
                  </div>
                  {person.timestamp && (
                    <button
                      type="button"
                      onClick={() => handleJumpToTimestamp(person.timestamp)}
                      className="text-xs font-mono text-brand hover:underline"
                    >
                      ⏱ Spoke at {person.timestamp}
                    </button>
                  )}
                </div>

                {/* Context Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-page/50 p-3 rounded-xl border border-border">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-ink-muted block mb-0.5">
                      What they discussed:
                    </span>
                    <p className="text-ink leading-relaxed">{person.discussed}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase text-ink-muted block mb-0.5">
                      Their apparent interest:
                    </span>
                    <p className="text-ink leading-relaxed">{person.interest}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase text-brand block mb-0.5">
                      Why they matter to you:
                    </span>
                    <p className="text-ink leading-relaxed">{person.why_matters}</p>
                  </div>
                </div>

                {/* Follow-up Drafts (Section 13.11) */}
                {person.follow_up_drafts && (
                  <div className="space-y-3 pt-2">
                    <span className="text-xs font-bold text-ink block">
                      Ready-to-Use Outreach Drafts:
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {/* Email Draft */}
                      <div className="p-3 bg-surface rounded-xl border border-border flex flex-col justify-between space-y-2">
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px] font-bold text-ink flex items-center gap-1">
                              <Icon name="mail" className="w-3.5 h-3.5" /> Email Draft
                            </span>
                          </div>
                          <p className="text-[11px] text-ink-2 font-mono whitespace-pre-wrap line-clamp-6">
                            {person.follow_up_drafts.email}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyText(person.follow_up_drafts.email, `${person.name}-email`)}
                          className="w-full py-1.5 bg-page hover:bg-page/80 text-ink text-xs font-semibold rounded-lg border border-border transition flex items-center justify-center gap-1"
                        >
                          <Icon name="copy" className="w-3 h-3" />
                          {copiedDraft === `${person.name}-email` ? "Copied! ✓" : "Copy Email"}
                        </button>
                      </div>

                      {/* WhatsApp Draft */}
                      <div className="p-3 bg-surface rounded-xl border border-border flex flex-col justify-between space-y-2">
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                              <Icon name="whatsapp" className="w-3.5 h-3.5" /> WhatsApp Note
                            </span>
                          </div>
                          <p className="text-[11px] text-ink-2 font-mono whitespace-pre-wrap line-clamp-6">
                            {person.follow_up_drafts.whatsapp}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyText(person.follow_up_drafts.whatsapp, `${person.name}-wa`)}
                          className="w-full py-1.5 bg-page hover:bg-page/80 text-ink text-xs font-semibold rounded-lg border border-border transition flex items-center justify-center gap-1"
                        >
                          <Icon name="copy" className="w-3 h-3" />
                          {copiedDraft === `${person.name}-wa` ? "Copied! ✓" : "Copy WhatsApp"}
                        </button>
                      </div>

                      {/* LinkedIn Draft */}
                      <div className="p-3 bg-surface rounded-xl border border-border flex flex-col justify-between space-y-2">
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1">
                              <span>🔗</span> LinkedIn Message
                            </span>
                          </div>
                          <p className="text-[11px] text-ink-2 font-mono whitespace-pre-wrap line-clamp-6">
                            {person.follow_up_drafts.linkedin}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyText(person.follow_up_drafts.linkedin, `${person.name}-li`)}
                          className="w-full py-1.5 bg-page hover:bg-page/80 text-ink text-xs font-semibold rounded-lg border border-border transition flex items-center justify-center gap-1"
                        >
                          <Icon name="copy" className="w-3 h-3" />
                          {copiedDraft === `${person.name}-li` ? "Copied! ✓" : "Copy LinkedIn"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: Competitive & Market Intelligence (Section 13.6 & 13.7) */}
      {activeTab === "competitive" && (
        <div className="space-y-6">
          {/* Competitive Matrix */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Competitive Intelligence (Competitors, Claims, Weaknesses)
            </h3>
            <div className="space-y-3">
              {(intelligence?.competitive_intelligence?.competitors || []).map((comp, i) => (
                <div key={i} className="p-4 rounded-2xl bg-surface border border-border shadow-soft space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-ink">{comp.name}</h4>
                    {comp.pricing && (
                      <span className="text-xs font-semibold text-critical bg-critical/10 px-2 py-0.5 rounded-md border border-critical/30">
                        Pricing: {comp.pricing}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-ink-muted block mb-0.5">Claims & Positioning:</span>
                      <p className="text-ink leading-relaxed">{comp.claims || comp.positioning || "None noted"}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase text-critical block mb-0.5">Identified Weaknesses:</span>
                      <p className="text-ink leading-relaxed">{comp.weaknesses || "None noted"}</p>
                    </div>
                  </div>
                  {comp.opportunities && (
                    <div className="p-2.5 bg-brand-wash rounded-xl border border-brand/20 text-xs text-ink">
                      <span className="font-bold text-brand">Opportunity for You: </span>
                      {comp.opportunities}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Market Intelligence */}
          {intelligence?.market_intelligence && (
            <div className="p-5 rounded-2xl bg-surface border border-border shadow-soft space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink">
                Market Movements & Emerging Trends
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-[10px] font-bold uppercase text-brand block mb-1.5">
                    Emerging Trends & Shifts:
                  </span>
                  <ul className="space-y-1.5">
                    {(intelligence.market_intelligence.trends || []).map((t, idx) => (
                      <li key={idx} className="flex items-start gap-1.5 text-ink">
                        <span>•</span>
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-critical block mb-1.5">
                    Customer Pain Points Expressed:
                  </span>
                  <ul className="space-y-1.5">
                    {(intelligence.market_intelligence.customer_pain || []).map((cp, idx) => (
                      <li key={idx} className="flex items-start gap-1.5 text-ink">
                        <span>•</span>
                        <span>{cp}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: Action Plan (Section 13.8) */}
      {activeTab === "actions" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Structured Action Plan (Preserved Deadlines)
            </h3>
            <span className="text-xs text-brand font-medium">1-Click sync to SimpleNow To-Dos</span>
          </div>

          {/* Do Today */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-critical flex items-center gap-1.5">
              <span>🔥 Do Today</span>
            </h4>
            {(intelligence?.action_plan?.do_today || []).map((item, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl bg-surface border border-border shadow-soft flex items-center justify-between gap-3"
              >
                <div className="space-y-0.5 text-xs">
                  <p className="font-semibold text-ink">{item.task}</p>
                  {item.deadline && (
                    <p className="text-[11px] text-critical font-medium">Deadline: {item.deadline}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleSyncTask(item.task, item.deadline)}
                  disabled={syncedTasks[item.task]}
                  className="px-3 py-1.5 bg-brand-wash hover:bg-brand/10 text-brand text-xs font-semibold rounded-lg border border-brand/30 transition disabled:opacity-50"
                >
                  {syncedTasks[item.task] ? "Synced ✓" : "+ Add to To-Dos"}
                </button>
              </div>
            ))}
          </div>

          {/* Do This Week */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-warning flex items-center gap-1.5">
              <span>🟡 Do This Week</span>
            </h4>
            {(intelligence?.action_plan?.do_this_week || []).map((item, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl bg-surface border border-border shadow-soft flex items-center justify-between gap-3"
              >
                <div className="space-y-0.5 text-xs">
                  <p className="font-semibold text-ink">{item.task}</p>
                  {item.deadline && (
                    <p className="text-[11px] text-ink-muted">Deadline: {item.deadline}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleSyncTask(item.task, item.deadline)}
                  disabled={syncedTasks[item.task]}
                  className="px-3 py-1.5 bg-brand-wash hover:bg-brand/10 text-brand text-xs font-semibold rounded-lg border border-brand/30 transition disabled:opacity-50"
                >
                  {syncedTasks[item.task] ? "Synced ✓" : "+ Add to To-Dos"}
                </button>
              </div>
            ))}
          </div>

          {/* Do Later */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
              <span>⚪ Do Later</span>
            </h4>
            {(intelligence?.action_plan?.do_later || []).map((item, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl bg-surface border border-border shadow-soft flex items-center justify-between gap-3"
              >
                <div className="space-y-0.5 text-xs">
                  <p className="font-semibold text-ink">{item.task}</p>
                  {item.deadline && (
                    <p className="text-[11px] text-ink-muted">Deadline: {item.deadline}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleSyncTask(item.task, item.deadline)}
                  disabled={syncedTasks[item.task]}
                  className="px-3 py-1.5 bg-page text-ink-muted hover:text-ink text-xs font-semibold rounded-lg border border-border transition disabled:opacity-50"
                >
                  {syncedTasks[item.task] ? "Synced ✓" : "+ Add to To-Dos"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 6: Transcript (Section 13 & 22) */}
      {activeTab === "transcript" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                Timestamped Event Transcript
              </h3>
              {event.metadata?.completeness_audit && (
                <p className="text-[11px] text-good font-semibold mt-0.5">
                  ✓ Verified Completeness: {event.metadata.completeness_audit.completeness_score}% ({event.metadata.completeness_audit.word_count} words • {event.metadata.completeness_audit.voice_fidelity})
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(transcript?.full_text || "");
                  alert("Raw transcript copied to clipboard!");
                }}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-page border border-border hover:border-brand text-ink transition"
              >
                Copy Text
              </button>
              <button
                type="button"
                onClick={() => {
                  let content = `INTELEXA EVENT TRANSCRIPT\nEvent: ${event.event_name}\nDate: ${event.start_time || new Date().toISOString()}\n\n`;
                  if (transcript?.segments && transcript.segments.length > 0) {
                    transcript.segments.forEach((s) => {
                      content += `[${s.start}] ${s.speaker ? `[${s.speaker}] ` : ""}${s.text}\n\n`;
                    });
                  } else {
                    content += transcript?.full_text || "";
                  }
                  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${event.event_name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_transcript.txt`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-page border border-border hover:border-brand text-ink transition"
              >
                Download .txt
              </button>
              <div className="w-full sm:w-56">
                <input
                  type="text"
                  value={transcriptFilter}
                  onChange={(e) => setTranscriptFilter(e.target.value)}
                  placeholder="Search keywords or [00:12]..."
                  className="w-full text-xs px-3 py-1.5 border border-border rounded-lg bg-surface text-ink focus:outline-none focus:border-brand"
                />
              </div>
            </div>
          </div>

          {/* User Live Notes if provided */}
          {event.metadata?.user_notes && (
            <div className="p-4 rounded-xl bg-brand-wash/50 border border-brand/20 space-y-1">
              <span className="text-xs font-bold text-brand uppercase tracking-wider block">
                📝 Your Live Notes & Scratchpad
              </span>
              <p className="text-xs text-ink leading-relaxed whitespace-pre-wrap">
                {event.metadata.user_notes}
              </p>
            </div>
          )}

          {/* Attached Slides if provided */}
          {event.metadata?.attachments_summary && event.metadata.attachments_summary.length > 0 && (
            <div className="p-3.5 rounded-xl bg-surface border border-border space-y-1.5">
              <span className="text-xs font-bold text-ink flex items-center gap-1.5">
                <span>🖼️ Attached Slides & Visuals</span>
                <span className="text-[10px] text-ink-muted">({event.metadata.attachments_summary.length} analyzed)</span>
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                {event.metadata.attachments_summary.map((att: any, idx: number) => (
                  <span key={idx} className="px-2.5 py-1 rounded-lg bg-page border border-border text-[11px] font-mono text-ink">
                    📄 {att.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          <VScroller className="rounded-2xl border border-border bg-surface shadow-soft max-h-[600px]" trackClassName="p-4 space-y-3 font-mono text-xs">
            {transcript?.segments && transcript.segments.length > 0 ? (
              transcript.segments
                .filter(
                  (s) =>
                    !transcriptFilter ||
                    s.text.toLowerCase().includes(transcriptFilter.toLowerCase()) ||
                    s.start.includes(transcriptFilter)
                )
                .map((seg, i) => (
                  <div key={i} className="p-2.5 rounded-lg hover:bg-page/60 transition flex items-start gap-3">
                    <span className="text-brand font-bold text-[11px] flex-shrink-0 select-none">
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
              <p className="text-ink-2 whitespace-pre-wrap leading-relaxed">
                {transcript?.full_text || "No transcript available."}
              </p>
            )}
          </VScroller>
        </div>
      )}

      {/* TAB 7: Ask Intelexa (Section 18) */}
      {activeTab === "qa" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Ask Intelexa — Timestamp-Cited Intelligence Q&A
            </h3>
            <span className="text-xs text-brand font-medium">Ground-truth answers with transcript jump-links</span>
          </div>

          {/* Quick Prompt Chips */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-ink-muted">Quick Prompts:</span>
            {[
              "What were the three biggest insights?",
              "Who should I follow up with first?",
              "Prepare a 30-second briefing for my CEO.",
              "What competitive threats were mentioned?",
            ].map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleAskQuestion(chip)}
                className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-page border border-border hover:border-brand text-ink transition"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Q&A Stream */}
          <div className="space-y-4">
            {qaHistory.length === 0 ? (
              <div className="p-8 border border-dashed border-border rounded-2xl text-center bg-page/30 space-y-2">
                <div className="text-2xl">💬</div>
                <h4 className="text-sm font-bold text-ink">Ask Anything About This Event</h4>
                <p className="text-xs text-ink-muted max-w-md mx-auto">
                  Intelexa searches the full transcript and extracted intelligence to answer your questions with exact timestamps.
                </p>
              </div>
            ) : (
              qaHistory.map((item, idx) => (
                <div key={idx} className="p-4 rounded-2xl bg-surface border border-border shadow-soft space-y-3 text-xs">
                  <div className="flex items-start gap-2 font-bold text-ink">
                    <span className="text-brand">Q:</span>
                    <span>{item.question}</span>
                  </div>
                  <div className="p-3 bg-page/70 rounded-xl border border-border text-ink-2 leading-relaxed whitespace-pre-wrap">
                    {item.answer}
                  </div>
                  {item.citations && item.citations.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap text-[11px]">
                      <span className="text-ink-muted font-semibold">Citations:</span>
                      {item.citations.map((c, ci) => (
                        <button
                          key={ci}
                          type="button"
                          onClick={() => handleJumpToTimestamp(c)}
                          className="px-2 py-0.5 rounded bg-brand-wash text-brand font-mono font-bold hover:underline"
                        >
                          Jump to [{c}] &rarr;
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Question Input Box */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAskQuestion(questionInput);
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={questionInput}
              onChange={(e) => setQuestionInput(e.target.value)}
              placeholder="e.g. What did the speaker say about AI agents and ATS integration?"
              className="flex-1 text-xs px-4 py-3 border border-border rounded-xl bg-surface text-ink focus:outline-none focus:border-brand shadow-soft"
            />
            <button
              type="submit"
              disabled={asking || !questionInput.trim()}
              className="px-5 py-3 bg-brand text-white font-bold text-xs rounded-xl hover:bg-brand/90 transition shadow-sm disabled:opacity-50"
            >
              {asking ? "Thinking..." : "Ask Intelexa"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
