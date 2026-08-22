"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";

type Requisition = {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
  employment_type: string;
  headcount: number;
  status: string;
  priority: string;
  hiring_manager: string | null;
  description: string | null;
  created_at: string;
  talent_candidates?: { id: string; stage: string }[];
};

type Candidate = {
  id: string;
  requisition_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  resume_text: string | null;
  source: string;
  stage: string;
  rating: number | null;
  tags: string[];
  created_at: string;
  talent_notes?: Note[];
  talent_scorecards?: Scorecard[];
};

type Note = { id: string; body: string; created_at: string };
type Scorecard = { id: string; rating: number | null; recommendation: string; feedback: string | null; created_at: string };

type PipelineSummary = {
  headline: string;
  stage_counts: Record<string, number>;
  bottleneck: string | null;
  standouts: string[];
  risks: string[];
};

const STAGES = [
  { id: "applied", label: "Applied" },
  { id: "screening", label: "Screening" },
  { id: "interview", label: "Interview" },
  { id: "offer", label: "Offer" },
  { id: "hired", label: "Hired" },
  { id: "rejected", label: "Rejected" },
];

function stageIndex(stage: string) {
  const i = STAGES.findIndex((s) => s.id === stage);
  return i === -1 ? 0 : i;
}

export default function TalentAiBoard() {
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Requisition | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [detailCandidate, setDetailCandidate] = useState<Candidate | null>(null);

  const [showNewReq, setShowNewReq] = useState(false);
  const [showAddCandidate, setShowAddCandidate] = useState(false);
  const [summary, setSummary] = useState<PipelineSummary | null>(null);
  const [summarizing, setSummarizing] = useState(false);

  useEffect(() => {
    loadRequisitions();
  }, []);

  async function loadRequisitions() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/talent-ai/requisitions");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load requisitions.");
      setRequisitions(data.requisitions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load requisitions.");
    } finally {
      setLoading(false);
    }
  }

  async function openRequisition(id: string) {
    setError(null);
    setSummary(null);
    try {
      const res = await fetch(`/api/talent-ai/requisitions/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load requisition.");
      const req = data.requisition;
      setSelected(req);
      setCandidates(req.talent_candidates || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load requisition.");
    }
  }

  async function createRequisition(payload: Record<string, unknown>) {
    setError(null);
    try {
      const res = await fetch("/api/talent-ai/requisitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create requisition.");
      setShowNewReq(false);
      await loadRequisitions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create requisition.");
    }
  }

  async function addCandidate(payload: Record<string, unknown>) {
    if (!selected) return;
    setError(null);
    try {
      const res = await fetch("/api/talent-ai/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, requisitionId: selected.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not add candidate.");
      setShowAddCandidate(false);
      await openRequisition(selected.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add candidate.");
    }
  }

  async function moveStage(candidate: Candidate, direction: 1 | -1) {
    const nextIndex = stageIndex(candidate.stage) + direction;
    if (nextIndex < 0 || nextIndex >= STAGES.length) return;
    const newStage = STAGES[nextIndex].id;
    setCandidates((prev) => prev.map((c) => (c.id === candidate.id ? { ...c, stage: newStage } : c)));
    try {
      await fetch(`/api/talent-ai/candidates/${candidate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: newStage }),
      });
    } catch {
      // best-effort optimistic update; a refresh will reconcile if it failed
    }
  }

  async function summarize() {
    if (!selected) return;
    setSummarizing(true);
    setError(null);
    try {
      const res = await fetch(`/api/talent-ai/requisitions/${selected.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "summarize" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI summary failed.");
      setSummary(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI summary failed.");
    } finally {
      setSummarizing(false);
    }
  }

  async function openCandidateDetail(candidate: Candidate) {
    try {
      const [notesRes, scoresRes] = await Promise.all([
        fetch(`/api/talent-ai/candidates/${candidate.id}/notes`),
        fetch(`/api/talent-ai/candidates/${candidate.id}/scorecards`),
      ]);
      const notesData = await notesRes.json();
      const scoresData = await scoresRes.json();
      setDetailCandidate({
        ...candidate,
        talent_notes: notesData.notes || [],
        talent_scorecards: scoresData.scorecards || [],
      });
    } catch {
      setDetailCandidate(candidate);
    }
  }

  async function addNote(body: string) {
    if (!detailCandidate) return;
    const res = await fetch(`/api/talent-ai/candidates/${detailCandidate.id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    const data = await res.json();
    if (res.ok) {
      setDetailCandidate((prev) => (prev ? { ...prev, talent_notes: [data.note, ...(prev.talent_notes || [])] } : prev));
    }
  }

  async function addScorecard(payload: Record<string, unknown>) {
    if (!detailCandidate) return;
    const res = await fetch(`/api/talent-ai/candidates/${detailCandidate.id}/scorecards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok) {
      setDetailCandidate((prev) =>
        prev ? { ...prev, talent_scorecards: [data.scorecard, ...(prev.talent_scorecards || [])] } : prev
      );
    }
  }

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-[13px] text-ink-muted">Loading…</div>;
  }

  if (!selected) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="m-0 text-[18px] font-bold">Talent.ai</h2>
            <p className="m-0 mt-1 text-[13px] text-ink-2 max-w-xl">
              Requisitions and a real candidate pipeline — the ATS backbone for HR, built to stand
              on its own.
            </p>
          </div>
          <button
            onClick={() => setShowNewReq(true)}
            className="bg-brand text-white text-[13px] font-bold px-4 py-2.5 rounded-sm shadow-soft-sm flex-shrink-0"
          >
            + New requisition
          </button>
        </div>

        {error && <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2">{error}</div>}

        {showNewReq && <RequisitionForm onCancel={() => setShowNewReq(false)} onSubmit={createRequisition} />}

        {requisitions.length === 0 ? (
          <div className="border border-dashed border-border rounded-md py-14 flex flex-col items-center gap-2 text-center">
            <Icon name="briefcase" className="w-7 h-7 text-ink-muted" />
            <div className="text-[13.5px] font-bold">No requisitions yet</div>
            <p className="text-[12.5px] text-ink-muted max-w-xs">
              Open one to start building a candidate pipeline for it.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {requisitions.map((r) => {
              const total = r.talent_candidates?.length || 0;
              const hired = r.talent_candidates?.filter((c) => c.stage === "hired").length || 0;
              return (
                <button
                  key={r.id}
                  onClick={() => openRequisition(r.id)}
                  className="text-left border border-border rounded-md p-4 bg-surface shadow-soft-sm hover:border-brand"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-[14px] font-bold">{r.title}</div>
                    <span
                      className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                        r.status === "open" ? "bg-good-wash text-good-text" : "bg-page text-ink-muted"
                      }`}
                    >
                      {r.status}
                    </span>
                  </div>
                  <div className="text-[12px] text-ink-muted mt-1">
                    {[r.department, r.location].filter(Boolean).join(" · ") || "No department set"}
                  </div>
                  <div className="flex items-center gap-3 mt-3 text-[11.5px] text-ink-2">
                    <span className="flex items-center gap-1">
                      <Icon name="users" className="w-3.5 h-3.5" /> {total} candidate{total === 1 ? "" : "s"}
                    </span>
                    <span>{hired} hired</span>
                    <span className="ml-auto capitalize">{r.priority} priority</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <style jsx global>{`
          .input {
            width: 100%;
            border: 1px solid #e1e0d9;
            border-radius: 7px;
            padding: 10px 12px;
            font-size: 13.5px;
            outline: none;
            background: #fcfcfb;
          }
          .input:focus {
            border-color: #2a78d6;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <button
          onClick={() => {
            setSelected(null);
            setCandidates([]);
            setSummary(null);
          }}
          className="text-ink-muted p-1 mt-0.5"
          aria-label="Back to requisitions"
        >
          <Icon name="chevronLeft" className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="m-0 text-[17px] font-bold">{selected.title}</h2>
            <span
              className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${
                selected.status === "open" ? "bg-good-wash text-good-text" : "bg-page text-ink-muted"
              }`}
            >
              {selected.status}
            </span>
            <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-page text-ink-muted capitalize">
              {selected.priority} priority
            </span>
          </div>
          <div className="text-[12.5px] text-ink-muted mt-1">
            {[selected.department, selected.location, selected.employment_type, `${selected.headcount} headcount`]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        <button
          onClick={summarize}
          disabled={summarizing}
          className="border border-border text-[12.5px] font-bold px-3 py-2 rounded-sm bg-surface flex items-center gap-1.5 disabled:opacity-50 flex-shrink-0"
        >
          <Icon name="sparkle" className="w-3.5 h-3.5" />
          {summarizing ? "Summarizing…" : "Summarize with AI"}
        </button>
        <button
          onClick={() => setShowAddCandidate(true)}
          className="bg-brand text-white text-[12.5px] font-bold px-3 py-2 rounded-sm shadow-soft-sm flex-shrink-0"
        >
          + Add candidate
        </button>
      </div>

      {error && <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2">{error}</div>}

      {summary && (
        <div className="border border-border rounded-md p-4 bg-brand-wash">
          <div className="text-[11px] font-bold uppercase tracking-wider text-brand mb-1.5">AI pipeline read</div>
          <p className="m-0 text-[13px] font-medium">{summary.headline}</p>
          {summary.bottleneck && <p className="m-0 mt-1.5 text-[12.5px] text-ink-2">Bottleneck: {summary.bottleneck}</p>}
          {summary.standouts?.length > 0 && (
            <p className="m-0 mt-1.5 text-[12.5px] text-ink-2">Standouts: {summary.standouts.join("; ")}</p>
          )}
          {summary.risks?.length > 0 && (
            <p className="m-0 mt-1.5 text-[12.5px] text-critical">Risks: {summary.risks.join("; ")}</p>
          )}
        </div>
      )}

      {showAddCandidate && (
        <CandidateForm onCancel={() => setShowAddCandidate(false)} onSubmit={addCandidate} />
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {STAGES.map((stage, idx) => {
          const stageCandidates = candidates.filter((c) => c.stage === stage.id);
          return (
            <div key={stage.id} className="bg-page rounded-md p-2.5 flex flex-col gap-2 min-h-[160px]">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">{stage.label}</span>
                <span className="text-[11px] font-bold text-ink-muted">{stageCandidates.length}</span>
              </div>
              <div className="flex flex-col gap-2">
                {stageCandidates.map((c) => (
                  <div
                    key={c.id}
                    className="bg-surface border border-border rounded-sm p-2.5 shadow-soft-sm cursor-pointer"
                    onClick={() => openCandidateDetail(c)}
                  >
                    <div className="text-[12.5px] font-bold truncate">{c.name}</div>
                    {c.email && <div className="text-[11px] text-ink-muted truncate">{c.email}</div>}
                    {c.rating != null && (
                      <div className="text-[11px] text-brand font-bold mt-1">{"★".repeat(c.rating)}</div>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          moveStage(c, -1);
                        }}
                        disabled={idx === 0}
                        className="text-ink-muted text-[13px] font-bold disabled:opacity-25 px-1"
                        aria-label="Move to previous stage"
                      >
                        ‹
                      </button>
                      <span className="text-[10px] text-ink-muted">{c.tags?.slice(0, 2).join(", ")}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          moveStage(c, 1);
                        }}
                        disabled={idx === STAGES.length - 1}
                        className="text-ink-muted text-[13px] font-bold disabled:opacity-25 px-1"
                        aria-label="Move to next stage"
                      >
                        ›
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {detailCandidate && (
        <CandidateDetail
          candidate={detailCandidate}
          onClose={() => setDetailCandidate(null)}
          onAddNote={addNote}
          onAddScorecard={addScorecard}
        />
      )}

      <style jsx global>{`
        .input {
          width: 100%;
          border: 1px solid #e1e0d9;
          border-radius: 7px;
          padding: 10px 12px;
          font-size: 13.5px;
          outline: none;
          background: #fcfcfb;
        }
        .input:focus {
          border-color: #2a78d6;
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-bold mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function RequisitionForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [location, setLocation] = useState("");
  const [employmentType, setEmploymentType] = useState("full-time");
  const [headcount, setHeadcount] = useState("1");
  const [priority, setPriority] = useState("medium");
  const [hiringManager, setHiringManager] = useState("");
  const [description, setDescription] = useState("");

  return (
    <div className="border border-border rounded-md p-4 bg-surface shadow-soft-sm flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Role title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" />
        </Field>
        <Field label="Department">
          <input value={department} onChange={(e) => setDepartment(e.target.value)} className="input" />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Location">
          <input value={location} onChange={(e) => setLocation(e.target.value)} className="input" />
        </Field>
        <Field label="Employment type">
          <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} className="input">
            <option value="full-time">Full-time</option>
            <option value="part-time">Part-time</option>
            <option value="contract">Contract</option>
            <option value="intern">Intern</option>
          </select>
        </Field>
        <Field label="Headcount">
          <input type="number" min="1" value={headcount} onChange={(e) => setHeadcount(e.target.value)} className="input" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Priority">
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className="input">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </Field>
        <Field label="Hiring manager">
          <input value={hiringManager} onChange={(e) => setHiringManager(e.target.value)} className="input" />
        </Field>
      </div>
      <Field label="Description">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="input min-h-[90px]"
          placeholder="Role summary, must-haves…"
        />
      </Field>
      <div className="flex gap-2">
        <button
          onClick={() =>
            onSubmit({ title, department, location, employmentType, headcount, priority, hiringManager, description })
          }
          disabled={!title.trim()}
          className="bg-brand text-white text-[13px] font-bold px-4 py-2.5 rounded-sm disabled:opacity-50 shadow-soft-sm"
        >
          Create requisition
        </button>
        <button onClick={onCancel} className="border border-border text-[13px] font-bold px-4 py-2.5 rounded-sm bg-surface">
          Cancel
        </button>
      </div>
    </div>
  );
}

function CandidateForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("other");
  const [resumeText, setResumeText] = useState("");
  const [autoParse, setAutoParse] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    await onSubmit({ name, email, phone, source, resumeText: resumeText || null, autoParse });
    setSubmitting(false);
  }

  return (
    <div className="border border-border rounded-md p-4 bg-surface shadow-soft-sm flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className="input" />
        </Field>
        <Field label="Source">
          <select value={source} onChange={(e) => setSource(e.target.value)} className="input">
            <option value="other">Other</option>
            <option value="referral">Referral</option>
            <option value="sourced">Sourced</option>
            <option value="inbound">Inbound</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
        </Field>
        <Field label="Phone">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input" />
        </Field>
      </div>
      <Field label="Resume text (optional)">
        <textarea
          value={resumeText}
          onChange={(e) => setResumeText(e.target.value)}
          className="input min-h-[110px]"
          placeholder="Paste resume text to auto-fill details with AI…"
        />
      </Field>
      <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
        <input type="checkbox" checked={autoParse} onChange={(e) => setAutoParse(e.target.checked)} />
        Auto-fill name/email/phone and add an AI fit note from the resume text above
      </label>
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={(!name.trim() && !resumeText.trim()) || submitting}
          className="bg-brand text-white text-[13px] font-bold px-4 py-2.5 rounded-sm disabled:opacity-50 shadow-soft-sm"
        >
          {submitting ? "Adding…" : "Add candidate"}
        </button>
        <button onClick={onCancel} className="border border-border text-[13px] font-bold px-4 py-2.5 rounded-sm bg-surface">
          Cancel
        </button>
      </div>
    </div>
  );
}

function CandidateDetail({
  candidate,
  onClose,
  onAddNote,
  onAddScorecard,
}: {
  candidate: Candidate;
  onClose: () => void;
  onAddNote: (body: string) => void;
  onAddScorecard: (payload: Record<string, unknown>) => void;
}) {
  const [noteText, setNoteText] = useState("");
  const [scRating, setScRating] = useState("4");
  const [scRecommendation, setScRecommendation] = useState("yes");
  const [scFeedback, setScFeedback] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="w-full max-w-md h-full bg-surface shadow-soft overflow-y-auto p-5 flex flex-col gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[16px] font-bold">{candidate.name}</div>
            <div className="text-[12px] text-ink-muted mt-0.5">
              {[candidate.email, candidate.phone].filter(Boolean).join(" · ") || "No contact details"}
            </div>
          </div>
          <button onClick={onClose} className="text-ink-muted p-1" aria-label="Close">
            <Icon name="x" className="w-4.5 h-4.5" />
          </button>
        </div>

        {candidate.resume_text && (
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1.5">Resume</div>
            <p className="text-[12px] text-ink-2 whitespace-pre-wrap max-h-40 overflow-y-auto border border-border rounded-sm p-2.5">
              {candidate.resume_text}
            </p>
          </div>
        )}

        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1.5">Scorecards</div>
          <div className="flex flex-col gap-2 mb-3">
            {(candidate.talent_scorecards || []).map((s) => (
              <div key={s.id} className="border border-border rounded-sm p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-bold capitalize">{s.recommendation.replace("_", " ")}</span>
                  {s.rating != null && <span className="text-[11px] text-brand font-bold">{"★".repeat(s.rating)}</span>}
                </div>
                {s.feedback && <p className="m-0 mt-1 text-[12px] text-ink-2">{s.feedback}</p>}
              </div>
            ))}
            {(candidate.talent_scorecards || []).length === 0 && (
              <p className="text-[12px] text-ink-muted">No scorecards yet.</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <select value={scRating} onChange={(e) => setScRating(e.target.value)} className="input">
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} star{n === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
              <select value={scRecommendation} onChange={(e) => setScRecommendation(e.target.value)} className="input">
                <option value="strong_yes">Strong yes</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
                <option value="strong_no">Strong no</option>
              </select>
            </div>
            <textarea
              value={scFeedback}
              onChange={(e) => setScFeedback(e.target.value)}
              className="input min-h-[60px]"
              placeholder="Interview feedback…"
            />
            <button
              onClick={() => {
                onAddScorecard({ rating: Number(scRating), recommendation: scRecommendation, feedback: scFeedback });
                setScFeedback("");
              }}
              className="border border-border text-[12.5px] font-bold px-3 py-2 rounded-sm bg-surface self-start"
            >
              Add scorecard
            </button>
          </div>
        </div>

        <div>
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
              onClick={() => {
                if (!noteText.trim()) return;
                onAddNote(noteText);
                setNoteText("");
              }}
              className="bg-brand text-white text-[12.5px] font-bold px-3 py-2 rounded-sm shadow-soft-sm flex-shrink-0"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
