"use client";

import { useState, useEffect } from "react";
import Icon from "@/components/Icon";
import { VScroller } from "@/components/Scroller";
import type { IntelexaProfileData, RecipientData } from "./ProfileModal";

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
  initialProfile,
  onSaveProfile,
  onStartEvent,
}: {
  open: boolean;
  onClose: () => void;
  defaultRecipients: RecipientData[];
  initialProfile?: Partial<IntelexaProfileData>;
  onSaveProfile?: (profile: IntelexaProfileData, recipients: RecipientData[]) => Promise<void>;
  onStartEvent: (params: NewEventParams) => Promise<void>;
}) {
  // Navigation Tabs: "event" setup vs "profile" goals
  const [activeTab, setActiveTab] = useState<"event" | "profile">("event");

  // Event State
  const [eventName, setEventName] = useState("");
  const [eventType, setEventType] = useState<string>("Conference");
  const [objectives, setObjectives] = useState<string[]>(["Find business opportunities", "Networking"]);
  const [watchFor, setWatchFor] = useState("");
  const [location, setLocation] = useState("");
  const [mode, setMode] = useState<"mic" | "upload">("mic");
  const [audioFile, setAudioFile] = useState<File | null>(null);

  // Profile & Goals State
  const [profile, setProfile] = useState<IntelexaProfileData>({
    name: initialProfile?.name || "",
    email: initialProfile?.email || "",
    whatsapp_number: initialProfile?.whatsapp_number || "",
    job_title: initialProfile?.job_title || "",
    company: initialProfile?.company || "",
    industry: initialProfile?.industry || "",
    business_interests: initialProfile?.business_interests || "",
    products_services: initialProfile?.products_services || "",
    target_customers: initialProfile?.target_customers || "",
    geography: initialProfile?.geography || "",
    professional_objectives: initialProfile?.professional_objectives || "",
    what_matters_to_me: initialProfile?.what_matters_to_me || "",
  });

  const [recipients, setRecipients] = useState<RecipientData[]>(defaultRecipients || []);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSavedNotice, setProfileSavedNotice] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialProfile) {
      setProfile((prev) => ({ ...prev, ...initialProfile }));
    }
  }, [initialProfile]);

  useEffect(() => {
    if (defaultRecipients) {
      setRecipients(defaultRecipients);
    }
  }, [defaultRecipients]);

  if (!open) return null;

  function toggleObjective(obj: string) {
    if (objectives.includes(obj)) {
      setObjectives(objectives.filter((o) => o !== obj));
    } else {
      setObjectives([...objectives, obj]);
    }
  }

  function addRecipient() {
    setRecipients([
      ...recipients,
      {
        name: "",
        email: "",
        whatsapp_number: "",
        delivery_email: true,
        delivery_whatsapp: true,
        is_primary: false,
      },
    ]);
  }

  function removeRecipient(index: number) {
    setRecipients(recipients.filter((_, i) => i !== index));
  }

  function updateRecipient(index: number, field: keyof RecipientData, value: any) {
    const next = [...recipients];
    next[index] = { ...next[index], [field]: value };
    setRecipients(next);
  }

  async function handleSaveProfileOnly() {
    if (!profile.email.trim()) {
      setError("Email address is required in Profile & Goals.");
      return;
    }
    setSavingProfile(true);
    setError(null);
    try {
      if (onSaveProfile) {
        await onSaveProfile(profile, recipients);
      }
      setProfileSavedNotice(true);
      setTimeout(() => setProfileSavedNotice(false), 2500);
    } catch (e) {
      setError((e as Error).message || "Failed to save profile.");
    } finally {
      setSavingProfile(false);
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
      // Auto-save profile changes if updated
      if (onSaveProfile && profile.email.trim()) {
        try {
          await onSaveProfile(profile, recipients);
        } catch (profileErr) {
          console.warn("Notice: auto-save profile encountered an issue:", profileErr);
        }
      }

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
      <div className="bg-surface border border-border w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-border bg-page/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-critical/10 text-critical flex items-center justify-center font-bold text-sm">
              🔴
            </div>
            <div>
              <h2 className="text-base font-bold text-ink leading-tight">Start New Event Intelligence</h2>
              <p className="text-[12px] text-ink-muted">
                Configure your event details and tailor the AI strategic lens to your goals.
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

        {/* Tab Switcher Header Bar */}
        <div className="flex border-b border-border bg-surface px-6 pt-2 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("event")}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === "event"
                ? "border-brand text-brand"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            <span>🎙️</span>
            <span>1. Event Setup</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("profile")}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition flex items-center gap-1.5 relative ${
              activeTab === "profile"
                ? "border-brand text-brand"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            <span>🎯</span>
            <span>2. Profile & Strategic Goals</span>
            {profile.company && (
              <span className="w-1.5 h-1.5 rounded-full bg-brand" />
            )}
          </button>
        </div>

        {/* Modal Body with zero native scrollbar & standard Scroller alternative */}
        <VScroller className="flex-1 min-h-0" trackClassName="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-critical/10 border border-critical/30 text-critical text-xs rounded-lg font-medium animate-fadeIn">
              {error}
            </div>
          )}

          {profileSavedNotice && (
            <div className="p-3 bg-good/10 border border-good/30 text-good-text text-xs rounded-lg font-bold flex items-center gap-2 animate-fadeIn">
              <span>✓</span>
              <span>Profile & Strategic Goals saved successfully!</span>
            </div>
          )}

          {/* ==================== TAB 1: EVENT SETUP ==================== */}
          {activeTab === "event" && (
            <div className="space-y-5 animate-fadeIn">
              {/* Profile & Lens Quick Strip */}
              <div className="p-3 rounded-xl bg-brand-wash/40 border border-brand/20 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="text-base">🎯</span>
                  <div>
                    <span className="text-xs font-bold text-ink block">
                      Active Strategic Lens:
                    </span>
                    <span className="text-[11px] text-ink-muted block">
                      {profile.job_title || profile.company
                        ? `${profile.name || "User"} • ${profile.job_title || "Executive"} at ${profile.company || "Enterprise"}${profile.industry ? ` (${profile.industry})` : ""}`
                        : "No profile set — AI will evaluate using general criteria."}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("profile")}
                  className="px-2.5 py-1 text-xs font-bold text-brand bg-surface rounded-lg border border-brand/20 hover:bg-brand-wash transition whitespace-nowrap"
                >
                  Edit Profile & Goals &rarr;
                </button>
              </div>

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
                  <span className="text-[11px] text-ink-muted">Optional (Auto-generated if blank)</span>
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
                          Click to choose an audio capture
                        </div>
                        <div className="text-[11px] text-ink-muted mt-0.5">
                          Supports .m4a, .mp3, .wav, .webm, .mp4 (Voice memos, captures)
                        </div>
                      </div>
                    )}
                  </label>
                </div>
              )}

              {/* Delivery Preview */}
              <div className="p-3 bg-page/50 border border-border rounded-xl text-xs flex items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="font-semibold text-ink flex items-center gap-1.5">
                    <span>📬 Automatic Report Delivery:</span>
                  </div>
                  <p className="text-[11px] text-ink-muted">
                    {profile.email
                      ? `Will send executive briefing to ${profile.email}${profile.whatsapp_number ? ` & WhatsApp (${profile.whatsapp_number})` : ""}`
                      : "Configure your email/WhatsApp in Profile & Goals to receive auto-reports."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("profile")}
                  className="text-xs text-brand font-bold hover:underline whitespace-nowrap"
                >
                  Configure &rarr;
                </button>
              </div>
            </div>
          )}

          {/* ==================== TAB 2: PROFILE & STRATEGIC GOALS ==================== */}
          {activeTab === "profile" && (
            <div className="space-y-5 animate-fadeIn">
              <div className="p-3.5 rounded-xl bg-brand-wash/50 border border-brand/20 space-y-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-brand uppercase tracking-wider">
                    🎯 Personal Intelligence Lens
                  </h3>
                  <button
                    type="button"
                    onClick={handleSaveProfileOnly}
                    disabled={savingProfile}
                    className="px-3 py-1 bg-brand text-white text-[11px] font-bold rounded-lg hover:bg-brand/90 transition shadow-sm disabled:opacity-50"
                  >
                    {savingProfile ? "Saving..." : "Save Preferences"}
                  </button>
                </div>
                <p className="text-xs text-ink-2 leading-relaxed">
                  Intelexa filters every conversation through this persistent profile to spotlight opportunities, target clients, and generate custom follow-ups.
                </p>
              </div>

              {/* Section 1: Core Contact */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                  1. Core Contact (For Delivery & Outreach)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-ink mb-1">
                      Email Address <span className="text-critical">*</span>
                    </label>
                    <input
                      type="email"
                      value={profile.email}
                      onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                      placeholder="your.email@company.com"
                      className="w-full text-xs px-3 py-2 border border-border rounded-xl bg-surface text-ink focus:outline-none focus:border-brand"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink mb-1">
                      WhatsApp Number
                    </label>
                    <input
                      type="tel"
                      value={profile.whatsapp_number}
                      onChange={(e) => setProfile({ ...profile, whatsapp_number: e.target.value })}
                      placeholder="+91 98860 12345"
                      className="w-full text-xs px-3 py-2 border border-border rounded-xl bg-surface text-ink focus:outline-none focus:border-brand"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Full Name</label>
                  <input
                    type="text"
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    placeholder="e.g. Shreesha"
                    className="w-full text-xs px-3 py-2 border border-border rounded-xl bg-surface text-ink focus:outline-none focus:border-brand"
                  />
                </div>
              </div>

              {/* Section 2: What Matters to Me */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                    2. What Matters to Me? (Persistent Lens)
                  </h4>
                  <span className="text-[11px] text-brand font-medium">Strategic Focus</span>
                </div>
                <textarea
                  rows={3}
                  value={profile.what_matters_to_me}
                  onChange={(e) => setProfile({ ...profile, what_matters_to_me: e.target.value })}
                  placeholder="e.g. I am interested in AI, recruitment technology, enterprise sales, HR tech, and identifying high-value pilot customers."
                  className="w-full text-xs p-3 border border-border rounded-xl bg-surface text-ink focus:outline-none focus:border-brand leading-relaxed"
                />
                <p className="text-[11px] text-ink-muted">
                  Intelexa evaluates spoken dialogue against this to determine &ldquo;Why does this matter to you?&rdquo;.
                </p>
              </div>

              {/* Section 3: Professional Identity */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                  3. Professional Identity & Goals
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-ink mb-1">Job Title</label>
                    <input
                      type="text"
                      value={profile.job_title}
                      onChange={(e) => setProfile({ ...profile, job_title: e.target.value })}
                      placeholder="e.g. Founder / VP Talent"
                      className="w-full text-xs px-3 py-2 border border-border rounded-xl bg-surface text-ink focus:outline-none focus:border-brand"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink mb-1">Company</label>
                    <input
                      type="text"
                      value={profile.company}
                      onChange={(e) => setProfile({ ...profile, company: e.target.value })}
                      placeholder="e.g. SimpleNow.ai"
                      className="w-full text-xs px-3 py-2 border border-border rounded-xl bg-surface text-ink focus:outline-none focus:border-brand"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink mb-1">Industry</label>
                    <input
                      type="text"
                      value={profile.industry}
                      onChange={(e) => setProfile({ ...profile, industry: e.target.value })}
                      placeholder="e.g. Enterprise AI / SaaS / HR Tech"
                      className="w-full text-xs px-3 py-2 border border-border rounded-xl bg-surface text-ink focus:outline-none focus:border-brand"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink mb-1">Target Customers</label>
                    <input
                      type="text"
                      value={profile.target_customers}
                      onChange={(e) => setProfile({ ...profile, target_customers: e.target.value })}
                      placeholder="e.g. Enterprise TA Leaders, CTOs, HR Directors"
                      className="w-full text-xs px-3 py-2 border border-border rounded-xl bg-surface text-ink focus:outline-none focus:border-brand"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Professional Objectives</label>
                  <input
                    type="text"
                    value={profile.professional_objectives}
                    onChange={(e) => setProfile({ ...profile, professional_objectives: e.target.value })}
                    placeholder="e.g. Find customer pilots, hire tech leads, identify co-investors"
                    className="w-full text-xs px-3 py-2 border border-border rounded-xl bg-surface text-ink focus:outline-none focus:border-brand"
                  />
                </div>
              </div>

              {/* Section 4: Team Recipients */}
              <div className="space-y-3 pt-3 border-t border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-ink">
                      4. Additional Team Recipients
                    </h4>
                    <p className="text-[11px] text-ink-muted">
                      Colleagues who should automatically receive this event&apos;s briefing.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addRecipient}
                    className="text-xs font-bold text-brand hover:underline"
                  >
                    + Add Recipient
                  </button>
                </div>

                {recipients.length === 0 ? (
                  <div className="p-3 bg-page/50 border border-border rounded-xl text-center text-xs text-ink-muted">
                    No additional team recipients. Reports will be sent directly to you.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recipients.map((rec, i) => (
                      <div
                        key={i}
                        className="p-3 border border-border rounded-xl bg-surface flex flex-col sm:flex-row items-start sm:items-center gap-2 justify-between"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 flex-1 w-full">
                          <input
                            type="text"
                            placeholder="Recipient Name"
                            value={rec.name}
                            onChange={(e) => updateRecipient(i, "name", e.target.value)}
                            className="text-xs px-2.5 py-1.5 border border-border rounded-lg bg-surface text-ink"
                          />
                          <input
                            type="email"
                            placeholder="Email"
                            value={rec.email}
                            onChange={(e) => updateRecipient(i, "email", e.target.value)}
                            className="text-xs px-2.5 py-1.5 border border-border rounded-lg bg-surface text-ink"
                          />
                          <input
                            type="tel"
                            placeholder="WhatsApp Number"
                            value={rec.whatsapp_number}
                            onChange={(e) => updateRecipient(i, "whatsapp_number", e.target.value)}
                            className="text-xs px-2.5 py-1.5 border border-border rounded-lg bg-surface text-ink"
                          />
                        </div>

                        <div className="flex items-center gap-3 self-end sm:self-center">
                          <label className="flex items-center gap-1 text-[11px] text-ink cursor-pointer">
                            <input
                              type="checkbox"
                              checked={rec.delivery_email}
                              onChange={(e) => updateRecipient(i, "delivery_email", e.target.checked)}
                              className="rounded border-border"
                            />
                            Email
                          </label>
                          <label className="flex items-center gap-1 text-[11px] text-ink cursor-pointer">
                            <input
                              type="checkbox"
                              checked={rec.delivery_whatsapp}
                              onChange={(e) => updateRecipient(i, "delivery_whatsapp", e.target.checked)}
                              className="rounded border-border"
                            />
                            WhatsApp
                          </label>
                          <button
                            type="button"
                            onClick={() => removeRecipient(i)}
                            className="text-critical hover:text-critical/80 p-1"
                            title="Remove"
                          >
                            <Icon name="x" className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </VScroller>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-border bg-page/50 flex items-center justify-between">
          <div className="text-[11px] text-ink-muted hidden sm:block">
            {activeTab === "event"
              ? mode === "mic"
                ? "Continuous speech stream via Whisper AI"
                : "Supports uploaded audio or voice memos"
              : "Preferences saved to your profile"}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-ink-2 hover:bg-page rounded-xl transition"
            >
              Cancel
            </button>

            {activeTab === "profile" ? (
              <button
                type="button"
                onClick={() => setActiveTab("event")}
                className="px-5 py-2.5 text-xs font-bold bg-brand text-white rounded-xl hover:bg-brand/90 transition shadow-button flex items-center gap-1.5"
              >
                <span>Continue to Event Setup &rarr;</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStart}
                disabled={starting}
                className="px-6 py-2.5 text-xs font-bold bg-brand text-white rounded-xl hover:bg-brand/90 transition shadow-button flex items-center gap-2 disabled:opacity-50"
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
                    ANALYSE CAPTURE
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
