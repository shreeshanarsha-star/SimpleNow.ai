"use client";

import { useState, useEffect } from "react";
import Icon from "@/components/Icon";

export interface IntelexaProfileData {
  name: string;
  email: string;
  whatsapp_number: string;
  job_title: string;
  company: string;
  industry: string;
  business_interests: string;
  products_services: string;
  target_customers: string;
  geography: string;
  professional_objectives: string;
  what_matters_to_me: string;
}

export interface RecipientData {
  id?: string;
  name: string;
  email: string;
  whatsapp_number: string;
  delivery_email: boolean;
  delivery_whatsapp: boolean;
  is_primary?: boolean;
}

export default function ProfileModal({
  open,
  onClose,
  initialProfile,
  initialRecipients,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  initialProfile: Partial<IntelexaProfileData>;
  initialRecipients: RecipientData[];
  onSave: (profile: IntelexaProfileData, recipients: RecipientData[]) => Promise<void>;
}) {
  const [profile, setProfile] = useState<IntelexaProfileData>({
    name: initialProfile.name || "",
    email: initialProfile.email || "",
    whatsapp_number: initialProfile.whatsapp_number || "",
    job_title: initialProfile.job_title || "",
    company: initialProfile.company || "",
    industry: initialProfile.industry || "",
    business_interests: initialProfile.business_interests || "",
    products_services: initialProfile.products_services || "",
    target_customers: initialProfile.target_customers || "",
    geography: initialProfile.geography || "",
    professional_objectives: initialProfile.professional_objectives || "",
    what_matters_to_me: initialProfile.what_matters_to_me || "",
  });

  const [recipients, setRecipients] = useState<RecipientData[]>(initialRecipients || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialProfile) {
      setProfile((prev) => ({ ...prev, ...initialProfile }));
    }
    if (initialRecipients) {
      setRecipients(initialRecipients);
    }
  }, [initialProfile, initialRecipients]);

  if (!open) return null;

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

  async function handleSave() {
    if (!profile.email.trim()) {
      setError("Email is required.");
      return;
    }
    if (!profile.whatsapp_number.trim()) {
      setError("WhatsApp number is required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave(profile, recipients);
      onClose();
    } catch (e) {
      setError((e as Error).message || "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
      <div className="bg-surface border border-border w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-page/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-brand-wash text-brand flex items-center justify-center font-bold text-sm">
              👤
            </div>
            <div>
              <h2 className="text-base font-bold text-ink leading-tight">Intelexa Profile & Context</h2>
              <p className="text-[12px] text-ink-muted">
                Persistent context used to evaluate event intelligence specifically for you.
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3 bg-critical/10 border border-critical/30 text-critical text-xs rounded-lg font-medium">
              {error}
            </div>
          )}

          {/* Section 1: Core Contact */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              1. Core Contact (Required)
            </h3>
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
                  className="w-full text-xs px-3 py-2 border border-border rounded-lg bg-surface text-ink focus:outline-none focus:border-brand"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  WhatsApp Number <span className="text-critical">*</span>
                </label>
                <input
                  type="tel"
                  value={profile.whatsapp_number}
                  onChange={(e) => setProfile({ ...profile, whatsapp_number: e.target.value })}
                  placeholder="+91 98860 12345"
                  className="w-full text-xs px-3 py-2 border border-border rounded-lg bg-surface text-ink focus:outline-none focus:border-brand"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1">Full Name</label>
              <input
                type="text"
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                placeholder="Shreesha"
                className="w-full text-xs px-3 py-2 border border-border rounded-lg bg-surface text-ink focus:outline-none focus:border-brand"
              />
            </div>
          </div>

          {/* Section 2: What Matters to Me (Persistent Context) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                2. What Matters to Me? (Persistent Context)
              </h3>
              <span className="text-[11px] text-brand font-medium">Guides AI Personalization</span>
            </div>
            <textarea
              rows={3}
              value={profile.what_matters_to_me}
              onChange={(e) => setProfile({ ...profile, what_matters_to_me: e.target.value })}
              placeholder="e.g. I am interested in AI, recruitment technology, enterprise sales, HR tech, and identifying high-value business opportunities."
              className="w-full text-xs p-3 border border-border rounded-lg bg-surface text-ink focus:outline-none focus:border-brand leading-relaxed"
            />
            <p className="text-[11px] text-ink-muted">
              Intelexa compares every extracted conversation against this text to decide &ldquo;Why does this matter to you?&rdquo;.
            </p>
          </div>

          {/* Section 3: Professional Profile */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              3. Professional Identity & Goals
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Job Title</label>
                <input
                  type="text"
                  value={profile.job_title}
                  onChange={(e) => setProfile({ ...profile, job_title: e.target.value })}
                  placeholder="VP Talent / Founder"
                  className="w-full text-xs px-3 py-2 border border-border rounded-lg bg-surface text-ink focus:outline-none focus:border-brand"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Company</label>
                <input
                  type="text"
                  value={profile.company}
                  onChange={(e) => setProfile({ ...profile, company: e.target.value })}
                  placeholder="SimpleNow.ai"
                  className="w-full text-xs px-3 py-2 border border-border rounded-lg bg-surface text-ink focus:outline-none focus:border-brand"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Industry</label>
                <input
                  type="text"
                  value={profile.industry}
                  onChange={(e) => setProfile({ ...profile, industry: e.target.value })}
                  placeholder="Enterprise AI / SaaS / HR Tech"
                  className="w-full text-xs px-3 py-2 border border-border rounded-lg bg-surface text-ink focus:outline-none focus:border-brand"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Geography</label>
                <input
                  type="text"
                  value={profile.geography}
                  onChange={(e) => setProfile({ ...profile, geography: e.target.value })}
                  placeholder="India, US, Global"
                  className="w-full text-xs px-3 py-2 border border-border rounded-lg bg-surface text-ink focus:outline-none focus:border-brand"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1">Target Customers</label>
              <input
                type="text"
                value={profile.target_customers}
                onChange={(e) => setProfile({ ...profile, target_customers: e.target.value })}
                placeholder="Enterprise TA Leaders, CTOs, HR Directors"
                className="w-full text-xs px-3 py-2 border border-border rounded-lg bg-surface text-ink focus:outline-none focus:border-brand"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1">Professional Objectives</label>
              <input
                type="text"
                value={profile.professional_objectives}
                onChange={(e) => setProfile({ ...profile, professional_objectives: e.target.value })}
                placeholder="Find customer pilots, hire leadership talent, monitor competitor moves"
                className="w-full text-xs px-3 py-2 border border-border rounded-lg bg-surface text-ink focus:outline-none focus:border-brand"
              />
            </div>
          </div>

          {/* Section 4: Report Recipients (Section 15) */}
          <div className="space-y-3 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink">
                  4. Additional Report Recipients
                </h3>
                <p className="text-[11px] text-ink-muted">
                  Colleagues or team members who should receive event intelligence reports.
                </p>
              </div>
              <button
                type="button"
                onClick={addRecipient}
                className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
              >
                + Add Recipient
              </button>
            </div>

            {recipients.length === 0 ? (
              <div className="p-3 bg-page/50 border border-border rounded-lg text-center text-xs text-ink-muted">
                No additional recipients added. Reports will be sent solely to your email & WhatsApp.
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
                        className="text-xs px-2.5 py-1.5 border border-border rounded-md bg-surface text-ink"
                      />
                      <input
                        type="email"
                        placeholder="Email"
                        value={rec.email}
                        onChange={(e) => updateRecipient(i, "email", e.target.value)}
                        className="text-xs px-2.5 py-1.5 border border-border rounded-md bg-surface text-ink"
                      />
                      <input
                        type="tel"
                        placeholder="WhatsApp Number"
                        value={rec.whatsapp_number}
                        onChange={(e) => updateRecipient(i, "whatsapp_number", e.target.value)}
                        className="text-xs px-2.5 py-1.5 border border-border rounded-md bg-surface text-ink"
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

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-border bg-page/50 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-ink-2 hover:bg-page rounded-xl transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 text-xs font-semibold bg-brand text-white rounded-xl hover:bg-brand/90 transition shadow-sm disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Preferences"}
          </button>
        </div>
      </div>
    </div>
  );
}
