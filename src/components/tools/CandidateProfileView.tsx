"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { VScroller } from "@/components/Scroller";
import { STAGES, stageLabel } from "@/lib/talentStages";
import { rejectionReasonLabel } from "@/lib/talentRejectionReasons";
import RejectionReasonModal from "@/components/tools/RejectionReasonModal";

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
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [otherApplications, setOtherApplications] = useState<OtherApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [noteText, setNoteText] = useState("");
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
      if (res.ok) {
        setEditing(false);
        await load();
      }
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
    const res = await fetch(`/api/talent-ai/candidates/${candidateId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: noteText }),
    });
    const data = await res.json();
    if (res.ok) {
      setCandidate((prev) => (prev ? { ...prev, talent_notes: [data.note, ...(prev.talent_notes || [])] } : prev));
      setNoteText("");
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
        {candidate.stage === "rejected" && (
          <div className="text-[11.5px] text-critical mt-2">
            Rejected — {rejectionReasonLabel(candidate.rejection_reason)}
          </div>
        )}
      </div>

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

      <div className="border border-border rounded-lg p-4 bg-surface">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Profile details</div>
          {!editing ? (
            <button onClick={() => setEditing(true)} className="text-[11.5px] font-semibold text-brand">
              Edit
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={() => setEditing(false)} className="text-[11.5px] font-semibold text-ink-muted">
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
                  <a href={candidate.linkedin_url} target="_blank" rel="noreferrer" className="text-brand font-semibold hover:underline">
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
        <div className="border border-border rounded-lg p-4 bg-surface">
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1.5">Resume</div>
          <VScroller className="max-h-72">
            <p className="text-[12px] text-ink-2 whitespace-pre-wrap m-0">{candidate.resume_text}</p>
          </VScroller>
        </div>
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
        <div className="flex gap-2">
          <input
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            className="input"
            placeholder="Add a note…"
          />
          <button
            onClick={addNote}
            className="bg-brand text-white text-[12.5px] font-bold px-3 py-2 rounded-sm shadow-soft-sm flex-shrink-0"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
