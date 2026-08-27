"use client";

import { useCallback, useEffect, useState } from "react";
import { useRegisterToolHome } from "@/components/ToolHomeContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { STAGES, stageLabel } from "@/lib/talentStages";
import { rejectionReasonLabel } from "@/lib/talentRejectionReasons";
import RejectionReasonModal from "@/components/tools/RejectionReasonModal";
import CandidateTabs from "@/components/tools/CandidateTabs";
import { daysSince, isStale } from "@/lib/talentSla";
import { normalizeExternalUrl } from "@/lib/url";

type Note = { id: string; body: string; created_at: string };
type Scorecard = { id: string; rating: number | null; recommendation: string | null; feedback: string | null; created_at: string };

type Candidate = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  stage: string;
  resume_text: string | null;
  current_company: string | null;
  current_location: string | null;
  current_ctc: number | null;
  expected_ctc: number | null;
  qualification: string | null;
  notice_period: string | null;
  linkedin_url: string | null;
  experience_years: number | null;
  person_id: string | null;
  rejection_reason: string | null;
  stage_entered_at: string | null;
  match_score: number | null;
  match_score_note: string | null;
  met_must_have_skills: string[] | null;
  missing_must_have_skills: string[] | null;
  talent_notes: Note[];
  talent_scorecards: Scorecard[];
  talent_requisitions: { id: string; req_no: string; title: string; location: string | null } | null;
};

type OtherApplication = {
  id: string;
  stage: string;
  created_at: string;
  talent_requisitions: { id: string; req_no: string; title: string; location: string | null; department: string | null } | null;
};

type LinkedOffer = { id: string; status: string; created_at: string } | null;

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted mb-0.5">{label}</div>
      <div className="text-[13px] text-ink">{value ?? "—"}</div>
    </div>
  );
}

export default function CandidateProfileView({ candidateId }: { candidateId: string }) {
  const router = useRouter();

  // Topbar's clickable "Talent.ai" title (ToolHomeContext) returns here
  // to the tool's own home tab, from wherever this drill-down view sits.
  useRegisterToolHome(useCallback(() => router.push("/tools/talent-ai"), [router]));
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [otherApplications, setOtherApplications] = useState<OtherApplication[]>([]);
  const [linkedOffer, setLinkedOffer] = useState<LinkedOffer>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [movingStage, setMovingStage] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/talent-ai/candidates/${candidateId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load candidate.");
      setCandidate(data.candidate);
      setOtherApplications(data.otherApplications || []);
      setLinkedOffer(data.linkedOffer || null);
      setForm({
        current_company: data.candidate.current_company || "",
        current_location: data.candidate.current_location || "",
        experience_years: data.candidate.experience_years != null ? String(data.candidate.experience_years) : "",
        qualification: data.candidate.qualification || "",
        notice_period: data.candidate.notice_period || "",
        current_ctc: data.candidate.current_ctc != null ? String(data.candidate.current_ctc) : "",
        expected_ctc: data.candidate.expected_ctc != null ? String(data.candidate.expected_ctc) : "",
        linkedin_url: data.candidate.linkedin_url || "",
        phone: data.candidate.phone || "",
        email: data.candidate.email || "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load candidate.");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/talent-ai/candidates/${candidateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_company: form.current_company || null,
          current_location: form.current_location || null,
          experience_years: form.experience_years ? Number(form.experience_years) : null,
          qualification: form.qualification || null,
          notice_period: form.notice_period || null,
          current_ctc: form.current_ctc ? Number(form.current_ctc) : null,
          expected_ctc: form.expected_ctc ? Number(form.expected_ctc) : null,
          linkedin_url: form.linkedin_url || null,
          phone: form.phone || null,
          email: form.email || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save those changes.");
      setEditing(false);
      await load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save those changes.");
    } finally {
      setSaving(false);
    }
  }

  async function moveStage(stage: string, rejectionReason?: string) {
    setMovingStage(true);
    try {
      const res = await fetch(`/api/talent-ai/candidates/${candidateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rejectionReason ? { stage, rejectionReason } : { stage }),
      });
      if (res.ok) await load();
    } finally {
      setMovingStage(false);
    }
  }

  async function addNote() {
    if (!noteText.trim()) return;
    setSavingNote(true);
    setNoteError(null);
    try {
      const res = await fetch(`/api/talent-ai/candidates/${candidateId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: noteText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save that note.");
      setCandidate((prev) => (prev ? { ...prev, talent_notes: [data.note, ...(prev.talent_notes || [])] } : prev));
      setNoteText("");
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : "Could not save that note.");
    } finally {
      setSavingNote(false);
    }
  }

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-[13px] text-ink-muted">Loading…</div>;
  }
  if (error || !candidate) {
    return (
      <div className="flex flex-col gap-3">
        <button onClick={() => router.back()} className="text-[12.5px] font-semibold text-brand self-start">
          ← Back
        </button>
        <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2">{error || "Candidate not found."}</div>
      </div>
    );
  }

  const req = candidate.talent_requisitions;

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <div>
        {req && (
          <Link href={`/tools/talent-ai/requisitions/${req.id}`} className="text-[11.5px] font-semibold text-brand">
            ← Back to {req.req_no} {req.title}{req.location ? `-${req.location}` : ""}
          </Link>
        )}
        <div className="flex items-start justify-between gap-4 flex-wrap mt-1.5">
          <div>
            <h1 className="m-0 text-[19px] font-bold">{candidate.name}</h1>
            <div className="text-[12px] text-ink-muted mt-0.5">
              {[candidate.email, candidate.phone].filter(Boolean).join(" · ") || "No contact details"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={candidate.stage}
              disabled={movingStage}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "rejected") setRejectModalOpen(true);
                else moveStage(v);
              }}
              className="input py-1.5 text-[12px]"
            >
              {STAGES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {candidate.stage === "rejected" ? (
          <div className="text-[11.5px] text-critical mt-2">
            Rejected — {rejectionReasonLabel(candidate.rejection_reason)}
          </div>
        ) : (
          (() => {
            const days = daysSince(candidate.stage_entered_at);
            const stale = isStale(candidate.stage, days);
            if (days == null) return null;
            return (
              <div className={`text-[11.5px] mt-2 ${stale ? "text-critical font-semibold" : "text-ink-muted"}`}>
                {days} day{days === 1 ? "" : "s"} in current stage{stale ? " — stale" : ""}
              </div>
            );
          })()
        )}
        {candidate.stage === "offer" && (
          <div className="mt-2">
            {linkedOffer ? (
              <Link
                href="/tools/offer-ai"
                className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-brand"
              >
                Offer created — {linkedOffer.status.replace(/_/g, " ")} · view in Offer.ai →
              </Link>
            ) : (
              <Link
                href={`/tools/offer-ai?candidateName=${encodeURIComponent(candidate.name)}&candidateEmail=${encodeURIComponent(candidate.email || "")}&roleTitle=${encodeURIComponent(candidate.talent_requisitions?.title || "")}&proposedCtc=${encodeURIComponent(candidate.expected_ctc != null ? String(candidate.expected_ctc) : "")}&talentCandidateId=${encodeURIComponent(candidate.id)}`}
                className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-brand"
              >
                Create offer in Offer.ai →
              </Link>
            )}
          </div>
        )}
      </div>

      <CandidateTabs candidateId={candidateId} active="summary" />

      {rejectModalOpen && (
        <RejectionReasonModal
          candidateName={candidate.name}
          onCancel={() => setRejectModalOpen(false)}
          onConfirm={async (reasonId) => {
            await moveStage("rejected", reasonId);
            setRejectModalOpen(false);
          }}
        />
      )}

      {candidate.match_score != null && (
        <div className="border border-border rounded-lg p-4 bg-surface flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Eligibility match</div>
            <span
              className={`font-bold rounded-sm px-2 py-0.5 text-[12px] tabular-nums ${
                candidate.match_score >= 70
                  ? "bg-good-wash text-good"
                  : candidate.match_score >= 40
                  ? "bg-warning-wash text-warning"
                  : "bg-critical-wash text-critical"
              }`}
            >
              {candidate.match_score}%
            </span>
          </div>
          {candidate.match_score_note && <p className="text-[12.5px] text-ink-2 m-0">{candidate.match_score_note}</p>}
          {(candidate.met_must_have_skills?.length || candidate.missing_must_have_skills?.length) ? (
            <div className="flex flex-wrap gap-3 mt-1">
              {candidate.met_must_have_skills && candidate.met_must_have_skills.length > 0 && (
                <div className="flex flex-col gap-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-good">Meets</div>
                  <div className="flex flex-wrap gap-1">
                    {candidate.met_must_have_skills.map((s) => (
                      <span key={s} className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-good-wash text-good-text">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {candidate.missing_must_have_skills && candidate.missing_must_have_skills.length > 0 && (
                <div className="flex flex-col gap-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-critical">Missing</div>
                  <div className="flex flex-wrap gap-1">
                    {candidate.missing_must_have_skills.map((s) => (
                      <span key={s} className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-critical-wash text-critical">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      <div className="border border-border rounded-lg p-4 bg-surface">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Profile details</div>
          {!editing ? (
            <button onClick={() => { setEditing(true); setSaveError(null); }} className="text-[11.5px] font-semibold text-brand">
              Edit
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={() => { setEditing(false); setSaveError(null); }} className="text-[11.5px] font-semibold text-ink-muted">
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="text-[11.5px] font-bold text-white bg-brand px-3 py-1.5 rounded-sm disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          )}
        </div>

        {saveError && (
          <div className="bg-critical-wash text-critical text-[11.5px] rounded-sm px-2.5 py-1.5 mb-3">{saveError}</div>
        )}

        {!editing ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label="Experience" value={candidate.experience_years != null ? `${candidate.experience_years} yrs` : null} />
            <Field label="Current company" value={candidate.current_company} />
            <Field label="Current location" value={candidate.current_location} />
            <Field label="Current CTC" value={candidate.current_ctc != null ? candidate.current_ctc.toLocaleString("en-IN") : null} />
            <Field label="Expected CTC" value={candidate.expected_ctc != null ? candidate.expected_ctc.toLocaleString("en-IN") : null} />
            <Field label="Qualification" value={candidate.qualification} />
            <Field label="Notice period" value={candidate.notice_period} />
            <Field label="Email" value={candidate.email} />
            <Field label="Phone" value={candidate.phone} />
            <Field
              label="LinkedIn"
              value={
                candidate.linkedin_url ? (
                  <a href={normalizeExternalUrl(candidate.linkedin_url) || undefined} target="_blank" rel="noreferrer" className="text-brand font-semibold hover:underline">
                    View profile
                  </a>
                ) : null
              }
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {([
              ["experience_years", "Experience (years)"],
              ["current_company", "Current company"],
              ["current_location", "Current location"],
              ["current_ctc", "Current CTC"],
              ["expected_ctc", "Expected CTC"],
              ["qualification", "Qualification"],
              ["notice_period", "Notice period"],
              ["email", "Email"],
              ["phone", "Phone"],
              ["linkedin_url", "LinkedIn URL"],
            ] as [string, string][]).map(([key, label]) => (
              <div key={key}>
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted mb-1">{label}</div>
                <input
                  value={form[key] || ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                  className="input"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {candidate.resume_text && (
        <Link
          href={`/tools/talent-ai/candidates/${candidateId}?view=details`}
          className="border border-border rounded-lg p-4 bg-surface flex items-center justify-between hover:border-brand"
        >
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1">Resume &amp; CV</div>
            <div className="text-[12px] text-ink-2">View the original CV and full parsed resume on the Details tab</div>
          </div>
          <span className="text-[12px] font-semibold text-brand flex-shrink-0">View details →</span>
        </Link>
      )}

      {otherApplications.length > 0 && (
        <div className="border border-border rounded-lg p-4 bg-surface">
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1.5">
            Other applications by this person
          </div>
          <div className="flex flex-col gap-2">
            {otherApplications.map((a) => (
              <Link
                key={a.id}
                href={`/tools/talent-ai/candidates/${a.id}`}
                className="border border-border rounded-sm p-2.5 text-[12px] flex items-center justify-between gap-3 hover:bg-surface-2"
              >
                <span>
                  {a.talent_requisitions
                    ? `${a.talent_requisitions.req_no} ${a.talent_requisitions.title}${a.talent_requisitions.location ? `-${a.talent_requisitions.location}` : ""}`
                    : "Unknown requisition"}
                </span>
                <span className="text-[11px] font-semibold text-ink-muted flex-shrink-0">{stageLabel(a.stage)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {candidate.talent_scorecards && candidate.talent_scorecards.length > 0 && (
        <div className="border border-border rounded-lg p-4 bg-surface">
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1.5">Scorecards</div>
          <div className="flex flex-col gap-2">
            {candidate.talent_scorecards.map((s) => (
              <div key={s.id} className="border border-border rounded-sm p-2.5 text-[12px]">
                <div className="font-bold">
                  {s.rating != null ? `${s.rating}/5` : "No rating"} {s.recommendation ? `· ${s.recommendation.replace(/_/g, " ")}` : ""}
                </div>
                {s.feedback && <div className="text-ink-2 mt-0.5">{s.feedback}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="border border-border rounded-lg p-4 bg-surface">
        <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1.5">Notes</div>
        <div className="flex flex-col gap-2 mb-3">
          {(candidate.talent_notes || []).map((n) => (
            <div key={n.id} className="border border-border rounded-sm p-2.5 text-[12px] text-ink-2">
              {n.body}
            </div>
          ))}
          {(candidate.talent_notes || []).length === 0 && <p className="text-[12px] text-ink-muted">No notes yet.</p>}
        </div>
        {noteError && (
          <div className="bg-critical-wash text-critical text-[11.5px] rounded-sm px-2.5 py-1.5 mb-2">{noteError}</div>
        )}
        <div className="flex items-stretch gap-2">
          <input
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !savingNote) addNote();
            }}
            className="input flex-1 min-w-0"
            placeholder="Add a note…"
            disabled={savingNote}
          />
          <button
            onClick={addNote}
            disabled={savingNote || !noteText.trim()}
            className="bg-brand text-white text-[12.5px] font-bold px-4 py-2 rounded-sm shadow-soft-sm flex-shrink-0 disabled:opacity-50"
          >
            {savingNote ? "Adding…" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
