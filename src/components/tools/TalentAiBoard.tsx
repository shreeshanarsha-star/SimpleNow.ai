"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { VScroller } from "@/components/Scroller";

type Requisition = {
  id: string;
  req_no: string;
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
  is_published?: boolean;
  posting_channels?: { channel: string; posted: boolean }[];
  talent_candidates?: { id: string; stage: string }[];
};

// "R-23082601 Sales Manager-Bangalore" -- req number, then title, then
// location hyphenated on (location omitted if not set).
function reqLabel(r: { req_no?: string; title: string; location: string | null }) {
  const suffix = r.location ? `${r.title}-${r.location}` : r.title;
  return r.req_no ? `${r.req_no} ${suffix}` : suffix;
}

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
  current_ctc?: number | null;
  expected_ctc?: number | null;
  proposed_ctc?: number | null;
  comp_currency?: string;
  selected_hm_by?: string | null;
  selected_ta_by?: string | null;
  moved_to_offer_at?: string | null;
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
  { id: "hm_review", label: "HM Review" },
  { id: "interview_1", label: "Interview 1" },
  { id: "interview_2", label: "Interview 2" },
  { id: "hr_interview", label: "HR Interview" },
  { id: "selected", label: "Offer in process" },
  { id: "offer", label: "Offered" },
  { id: "bgv", label: "BGV" },
  { id: "ready_to_join", label: "Ready to Join" },
  { id: "joined", label: "Joined" },
  { id: "rejected", label: "Rejected" },
];
// "Offer in process" (id: selected) and "Offered" are gated -- dual sign-off,
// then comp + Move to Offer -- reachable only via the dedicated actions in
// CandidateDetail, never the plain prev/next stepper. Once a candidate is
// actually at Offered or later, the simple stepper takes back over for the
// post-offer steps (BGV, Ready to Join, Joined).
const EARLY_STEPPER_MAX_INDEX = STAGES.findIndex((s) => s.id === "hr_interview");
const LATE_STEPPER_MIN_INDEX = STAGES.findIndex((s) => s.id === "bgv");
const LATE_STEPPER_MAX_INDEX = STAGES.findIndex((s) => s.id === "joined");

function stageIndex(stage: string) {
  const i = STAGES.findIndex((s) => s.id === stage);
  return i === -1 ? 0 : i;
}

// Which prev/next range (if any) a candidate's current stage falls into --
// null means the simple stepper doesn't apply (gated stages, or rejected).
function stepperRange(stage: string): { min: number; max: number } | null {
  const idx = stageIndex(stage);
  if (idx <= EARLY_STEPPER_MAX_INDEX) return { min: 0, max: EARLY_STEPPER_MAX_INDEX };
  if (idx >= LATE_STEPPER_MIN_INDEX && idx <= LATE_STEPPER_MAX_INDEX) {
    return { min: LATE_STEPPER_MIN_INDEX, max: LATE_STEPPER_MAX_INDEX };
  }
  return null;
}

export default function TalentAiBoard({
  focusRequisitionId,
  onFocusHandled,
  focusStage,
  onStageFocusHandled,
  hideListWhenIdle,
}: {
  focusRequisitionId?: string | null;
  onFocusHandled?: () => void;
  focusStage?: string | null;
  onStageFocusHandled?: () => void;
  hideListWhenIdle?: boolean;
} = {}) {
  const router = useRouter();
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
  const [publishBusy, setPublishBusy] = useState(false);
  const [highlightStageId, setHighlightStageId] = useState<string | null>(null);

  useEffect(() => {
    loadRequisitions();
  }, []);

  useEffect(() => {
    if (!focusRequisitionId) return;
    openRequisition(focusRequisitionId).finally(() => onFocusHandled?.());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequisitionId]);

  // Once the requisition's pipeline has actually rendered, scroll the
  // requested stage column into view and give it a brief highlight --
  // "click a number, land on those profiles" from the funnel table.
  useEffect(() => {
    if (!focusStage || !selected) return;
    const el = document.getElementById(`stage-col-${focusStage}`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    setHighlightStageId(focusStage);
    onStageFocusHandled?.();
    const t = setTimeout(() => setHighlightStageId(null), 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusStage, selected]);

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

  async function submitForApproval() {
    if (!selected) return;
    setError(null);
    try {
      const res = await fetch(`/api/talent-ai/requisitions/${selected.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resubmit" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not submit for approval.");
      await openRequisition(selected.id);
      await loadRequisitions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit for approval.");
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
    const range = stepperRange(candidate.stage);
    if (!range) return;
    const nextIndex = stageIndex(candidate.stage) + direction;
    if (nextIndex < range.min || nextIndex > range.max) return;
    const newStage = STAGES[nextIndex].id;
    setCandidates((prev) => prev.map((c) => (c.id === candidate.id ? { ...c, stage: newStage } : c)));
    try {
      await fetch(`/api/talent-ai/candidates/${candidate.id}/workflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_stage", stage: newStage }),
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

  async function togglePublish() {
    if (!selected) return;
    setPublishBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/talent-ai/requisitions/${selected.id}/workflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: selected.is_published ? "unpublish" : "publish" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update publish status.");
      await openRequisition(selected.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update publish status.");
    } finally {
      setPublishBusy(false);
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

{!hideListWhenIdle && (
                requisitions.length === 0 ? (
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
              const hired = r.talent_candidates?.filter((c) => c.stage === "joined").length || 0;
              return (
                <button
                  key={r.id}
                  onClick={() => router.push(`/tools/talent-ai/requisitions/${r.id}`)}
                  className="text-left border border-border rounded-md p-4 bg-surface shadow-soft-sm hover:border-brand"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-[14px] font-bold">{reqLabel(r)}</div>
                    <span
                      className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                        r.status === "open"
                          ? "bg-good-wash text-good-text"
                          : r.status === "draft"
                          ? "bg-warning-wash text-ink"
                          : r.status === "sent_back"
                          ? "bg-critical-wash text-critical"
                          : "bg-page text-ink-muted"
                      }`}
                    >
                      {r.status === "draft" ? "Draft" : r.status.replace(/_/g, " ")}
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
        )
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
      <div className="flex items-start gap-3 flex-wrap">
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
            <h2 className="m-0 text-[17px] font-bold">{reqLabel(selected)}</h2>
            <span
              className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${
                selected.status === "open"
                  ? "bg-good-wash text-good-text"
                  : selected.status === "draft"
                  ? "bg-warning-wash text-ink"
                  : selected.status === "sent_back"
                  ? "bg-critical-wash text-critical"
                  : "bg-page text-ink-muted"
              }`}
            >
              {selected.status === "draft" ? "Draft — not submitted" : selected.status.replace(/_/g, " ")}
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
        {(selected.status === "draft" || selected.status === "sent_back") && (
          <button
            onClick={submitForApproval}
            className="bg-brand text-white text-[12.5px] font-bold px-3 py-2 rounded-sm shadow-soft-sm flex-shrink-0"
          >
            {selected.status === "draft" ? "Submit for approval" : "Resubmit for approval"}
          </button>
        )}
        <button
          onClick={summarize}
          disabled={summarizing}
          className="border border-border text-[12.5px] font-bold px-3 py-2 rounded-sm bg-surface flex items-center gap-1.5 disabled:opacity-50 flex-shrink-0"
        >
          <Icon name="sparkle" className="w-3.5 h-3.5" />
          {summarizing ? "Summarizing…" : "Summarize with AI"}
        </button>
        <button
          onClick={togglePublish}
          disabled={publishBusy}
          className={`text-[12.5px] font-bold px-3 py-2 rounded-sm flex-shrink-0 disabled:opacity-50 ${
            selected.is_published
              ? "border border-border bg-surface text-ink"
              : "bg-good-wash text-good-text border border-transparent"
          }`}
        >
          {publishBusy ? "…" : selected.is_published ? "Unpublish" : "Publish role"}
        </button>
        <button
          onClick={() => setShowAddCandidate(true)}
          className="bg-brand text-white text-[12.5px] font-bold px-3 py-2 rounded-sm shadow-soft-sm flex-shrink-0"
        >
          + Add candidate
        </button>
      </div>

      {selected.is_published && (
        <div className="text-[12px] text-ink-muted -mt-2">
          Live on Employee Jobs{selected.posting_channels?.length ? ` · Channels: ${selected.posting_channels.map((c) => c.channel).join(", ")}` : ""}
        </div>
      )}

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
          const range = stepperRange(stage.id);
          return (
            <div
              key={stage.id}
              id={`stage-col-${stage.id}`}
              className={`bg-page rounded-md p-2.5 flex flex-col gap-2 min-h-[160px] transition-shadow ${
                highlightStageId === stage.id ? "ring-2 ring-brand" : ""
              }`}
            >
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
                        disabled={!range || idx <= range.min}
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
                        disabled={!range || idx >= range.max}
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
          onChanged={async () => {
            if (selected) await openRequisition(selected.id);
            setDetailCandidate(null);
          }}
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

function Field({
  label,
  children,
  hint,
  badge,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  badge?: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex items-center gap-1.5 text-[12px] font-bold mb-1.5">
        {label}
        {badge}
      </span>
      {children}
      {hint && <span className="block text-[11px] text-ink-muted mt-1">{hint}</span>}
    </label>
  );
}

function AiFilledBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[9.5px] font-bold text-brand normal-case">
      <Icon name="sparkle" className="w-2.5 h-2.5" /> AI-filled
    </span>
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
  const [workMode, setWorkMode] = useState("");
  const [employmentType, setEmploymentType] = useState("full-time");
  const [headcount, setHeadcount] = useState("1");
  const [jobLevel, setJobLevel] = useState("");
  const [priority, setPriority] = useState("medium");
  const [hiringManager, setHiringManager] = useState("");
  const [costCenter, setCostCenter] = useState("");
  const [targetHireDate, setTargetHireDate] = useState("");
  const [compMin, setCompMin] = useState("");
  const [compMax, setCompMax] = useState("");
  const [requisitionType, setRequisitionType] = useState("new");
  const [replacementName, setReplacementName] = useState("");
  const [replacementEmployeeId, setReplacementEmployeeId] = useState("");
  const [description, setDescription] = useState(""); // "Justification"
  const [comments, setComments] = useState("");
  const [isConfidential, setIsConfidential] = useState(false);
  const [isInternalOnly, setIsInternalOnly] = useState(false);

  const [jdMode, setJdMode] = useState<"file" | "paste">("file");
  const [jdFile, setJdFile] = useState<File | null>(null);
  const [jdPasteText, setJdPasteText] = useState("");
  const [jdSourceText, setJdSourceText] = useState("");
  const [jdFileName, setJdFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedPreview, setParsedPreview] = useState<{ role_summary: string; key_requirements: string[] } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [aiRanOnce, setAiRanOnce] = useState(false);
  const [aiFilled, setAiFilled] = useState<Set<string>>(new Set());
  const [showMore, setShowMore] = useState(false);
  const [saving, setSaving] = useState<"draft" | "submit" | null>(null);

  const ACCEPTED_EXT = [".pdf", ".docx", ".txt"];

  function acceptDroppedFile(file: File | undefined | null) {
    if (!file) return;
    const ok = ACCEPTED_EXT.some((ext) => file.name.toLowerCase().endsWith(ext));
    if (!ok) {
      setParseError("That file type isn't supported — use a PDF, DOCX, or TXT.");
      return;
    }
    setParseError(null);
    setJdMode("file");
    setJdFile(file);
  }

  async function analyzeJD() {
    setParseError(null);
    if (jdMode === "file" && !jdFile) {
      setParseError("Attach a JD file first.");
      return;
    }
    if (jdMode === "paste" && !jdPasteText.trim()) {
      setParseError("Paste the JD text first.");
      return;
    }
    setParsing(true);
    try {
      const formData = new FormData();
      if (jdMode === "file" && jdFile) formData.append("file", jdFile);
      if (jdMode === "paste") formData.append("text", jdPasteText);
      const res = await fetch("/api/talent-ai/requisitions/parse-jd", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not analyze that JD.");
      const p = data.parsed || {};
      const filled = new Set<string>();
      if (p.title) { setTitle(p.title); filled.add("title"); }
      if (p.department) { setDepartment(p.department); filled.add("department"); }
      if (p.location) { setLocation(p.location); filled.add("location"); }
      if (p.work_mode) { setWorkMode(p.work_mode); filled.add("workMode"); }
      if (p.employment_type) { setEmploymentType(p.employment_type); filled.add("employmentType"); }
      if (p.headcount) { setHeadcount(String(p.headcount)); filled.add("headcount"); }
      if (p.job_level) { setJobLevel(p.job_level); filled.add("jobLevel"); }
      if (p.hiring_manager) { setHiringManager(p.hiring_manager); filled.add("hiringManager"); }
      if (p.cost_center) { setCostCenter(p.cost_center); filled.add("costCenter"); }
      if (p.comp_min != null) { setCompMin(String(p.comp_min)); filled.add("compMin"); }
      if (p.comp_max != null) { setCompMax(String(p.comp_max)); filled.add("compMax"); }
      if (p.role_summary) { setDescription(p.role_summary); filled.add("description"); }
      setAiFilled(filled);
      setAiRanOnce(true);
      // Auto-open "More details" only if AI actually populated something that
      // lives in there -- otherwise leave it collapsed so the form stays short.
      const secondaryKeys = ["workMode", "jobLevel", "hiringManager", "costCenter", "compMin", "compMax"];
      if (secondaryKeys.some((k) => filled.has(k))) setShowMore(true);
      setJdSourceText(data.sourceText || "");
      setJdFileName(data.fileName || "");
      setParsedPreview({ role_summary: p.role_summary || "", key_requirements: p.key_requirements || [] });
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Could not analyze that JD.");
    } finally {
      setParsing(false);
    }
  }

  function skipAI() {
    setAiRanOnce(true);
  }

  const canSubmitDraft = title.trim().length > 0;
  const canSubmitFull = canSubmitDraft && (requisitionType !== "replacement" || replacementName.trim());

  function buildPayload(saveAsDraft: boolean) {
    return {
      title,
      department,
      location,
      workMode: workMode || null,
      employmentType,
      headcount,
      jobLevel,
      priority,
      hiringManager,
      costCenter,
      targetHireDate: targetHireDate || null,
      compMin: compMin === "" ? null : compMin,
      compMax: compMax === "" ? null : compMax,
      requisitionType,
      replacementName: requisitionType === "replacement" ? replacementName : "",
      replacementEmployeeId: requisitionType === "replacement" ? replacementEmployeeId : "",
      description,
      comments,
      isConfidential,
      isInternalOnly,
      jdSourceText,
      jdFileName,
      saveAsDraft,
    };
  }

  async function handleSaveDraft() {
    setSaving("draft");
    await onSubmit(buildPayload(true));
    setSaving(null);
  }

  async function handleSubmitForApproval() {
    setSaving("submit");
    await onSubmit(buildPayload(false));
    setSaving(null);
  }

  // Before the JD step has been used (analyzed or explicitly skipped), keep
  // the form to just the upload/paste zone -- the full field list only
  // appears once there's something to review, so a recruiter isn't staring
  // at 15 empty inputs before they've even attached anything.
  const showFields = aiRanOnce || parsedPreview != null;

  return (
    <div className="border border-border rounded-md p-4 bg-surface shadow-soft-sm flex flex-col gap-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          acceptDroppedFile(e.dataTransfer.files?.[0]);
        }}
        className={`border-2 border-dashed rounded-md p-4 flex flex-col gap-3 transition-colors ${
          dragOver ? "border-brand bg-brand-wash" : "border-border bg-page"
        }`}
      >
        <div>
          <div className="text-[13px] font-bold">Attach a job description</div>
          <div className="text-[11.5px] text-ink-muted mt-0.5">
            AI reads it and fills in the form below. Anything it can&apos;t figure out, you fill in yourself.
          </div>
        </div>
        <div className="flex items-center gap-4 text-[12px]">
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={jdMode === "file"} onChange={() => setJdMode("file")} /> Upload file
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={jdMode === "paste"} onChange={() => setJdMode("paste")} /> Paste text
          </label>
        </div>
        {jdMode === "file" ? (
          <div className="flex flex-col items-center justify-center gap-2 border border-border rounded-sm bg-surface py-6 px-4 text-center">
            <Icon name="upload" className="w-5 h-5 text-ink-muted" />
            {jdFile ? (
              <div className="text-[12.5px] font-bold">{jdFile.name}</div>
            ) : (
              <>
                <div className="text-[12.5px]">
                  <span className="font-bold text-brand">Drag &amp; drop</span> a JD file here
                </div>
                <div className="text-[11px] text-ink-muted">or</div>
              </>
            )}
            <label className="border border-border text-[12px] font-bold px-3 py-1.5 rounded-sm bg-page cursor-pointer">
              {jdFile ? "Choose a different file" : "Browse files"}
              <input
                type="file"
                accept=".pdf,.docx,.txt"
                onChange={(e) => acceptDroppedFile(e.target.files?.[0] || null)}
                className="hidden"
              />
            </label>
            <div className="text-[10.5px] text-ink-muted">PDF, DOCX, or TXT</div>
          </div>
        ) : (
          <textarea
            value={jdPasteText}
            onChange={(e) => setJdPasteText(e.target.value)}
            className="input min-h-[90px]"
            placeholder="Paste the job description text here…"
          />
        )}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={analyzeJD}
            disabled={parsing}
            className="bg-brand text-white text-[12.5px] font-bold px-3 py-2 rounded-sm shadow-soft-sm disabled:opacity-50 flex items-center gap-1.5"
          >
            <Icon name="sparkle" className="w-3.5 h-3.5" />
            {parsing ? "Analyzing…" : "Analyze with AI"}
          </button>
          {!showFields && (
            <button type="button" onClick={skipAI} className="text-[12px] font-bold text-ink-muted underline">
              Skip — I&apos;ll fill it in myself
            </button>
          )}
          {parseError && <span className="text-[12px] text-critical">{parseError}</span>}
        </div>
        {parsedPreview && (
          <div className="border border-border rounded-sm p-2.5 bg-surface">
            <p className="m-0 text-[12px] text-ink-2">{parsedPreview.role_summary}</p>
            {parsedPreview.key_requirements.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {parsedPreview.key_requirements.map((r, i) => (
                  <span key={i} className="text-[10.5px] bg-page px-2 py-0.5 rounded-full text-ink-2">
                    {r}
                  </span>
                ))}
              </div>
            )}
            <p className="m-0 mt-2 text-[11px] text-ink-muted">
              Fields marked <AiFilledBadge /> were filled from the JD — check them over. Everything else needs your input below.
            </p>
          </div>
        )}
      </div>

      {showFields && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Role title" badge={aiFilled.has("title") && <AiFilledBadge />}>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" placeholder="Required" />
            </Field>
            <Field label="Department" badge={aiFilled.has("department") && <AiFilledBadge />}>
              <input value={department} onChange={(e) => setDepartment(e.target.value)} className="input" />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Location" badge={aiFilled.has("location") && <AiFilledBadge />}>
              <input value={location} onChange={(e) => setLocation(e.target.value)} className="input" />
            </Field>
            <Field label="Employment type" badge={aiFilled.has("employmentType") && <AiFilledBadge />}>
              <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} className="input">
                <option value="full-time">Full-time</option>
                <option value="part-time">Part-time</option>
                <option value="contract">Contract</option>
                <option value="intern">Intern</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Headcount" badge={aiFilled.has("headcount") && <AiFilledBadge />}>
              <input type="number" min="1" value={headcount} onChange={(e) => setHeadcount(e.target.value)} className="input" />
            </Field>
            <Field label="Priority">
              <select value={priority} onChange={(e) => setPriority(e.target.value)} className="input">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </Field>
          </div>

          <Field label="Justification" hint="The business case for this headcount — why now, why this role." badge={aiFilled.has("description") && <AiFilledBadge />}>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input min-h-[70px]" placeholder="Why this requisition is needed…" />
          </Field>

          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="text-[12.5px] font-bold text-brand flex items-center gap-1 self-start"
          >
            <Icon name={showMore ? "chevronUp" : "chevronDown"} className="w-3.5 h-3.5" />
            {showMore ? "Hide more details" : "More details (work mode, comp, hiring manager, requisition type…)"}
          </button>

          {showMore && (
            <div className="flex flex-col gap-4 border-t border-border pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Work mode" badge={aiFilled.has("workMode") && <AiFilledBadge />}>
                  <select value={workMode} onChange={(e) => setWorkMode(e.target.value)} className="input">
                    <option value="">—</option>
                    <option value="remote">Remote</option>
                    <option value="hybrid">Hybrid</option>
                    <option value="onsite">Onsite</option>
                  </select>
                </Field>
                <Field label="Job level / grade" badge={aiFilled.has("jobLevel") && <AiFilledBadge />}>
                  <input value={jobLevel} onChange={(e) => setJobLevel(e.target.value)} className="input" placeholder="e.g. IC3, M2" />
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Compensation min" badge={aiFilled.has("compMin") && <AiFilledBadge />}>
                  <input type="number" value={compMin} onChange={(e) => setCompMin(e.target.value)} className="input" />
                </Field>
                <Field label="Compensation max" badge={aiFilled.has("compMax") && <AiFilledBadge />}>
                  <input type="number" value={compMax} onChange={(e) => setCompMax(e.target.value)} className="input" />
                </Field>
              </div>

              <div className="border border-border rounded-md p-3.5 flex flex-col gap-3">
                <div className="text-[12px] font-bold">Requisition type</div>
                <div className="flex items-center gap-4 text-[12.5px]">
                  {["new", "replacement", "perpetual"].map((t) => (
                    <label key={t} className="flex items-center gap-1.5 capitalize">
                      <input type="radio" checked={requisitionType === t} onChange={() => setRequisitionType(t)} /> {t}
                    </label>
                  ))}
                </div>
                {requisitionType === "replacement" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Replacement name">
                      <input value={replacementName} onChange={(e) => setReplacementName(e.target.value)} className="input" />
                    </Field>
                    <Field label="Replacement employee ID">
                      <input value={replacementEmployeeId} onChange={(e) => setReplacementEmployeeId(e.target.value)} className="input" />
                    </Field>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Hiring manager" badge={aiFilled.has("hiringManager") && <AiFilledBadge />}>
                  <input value={hiringManager} onChange={(e) => setHiringManager(e.target.value)} className="input" />
                </Field>
                <Field label="Cost center" badge={aiFilled.has("costCenter") && <AiFilledBadge />}>
                  <input value={costCenter} onChange={(e) => setCostCenter(e.target.value)} className="input" />
                </Field>
              </div>

              <Field label="Target hire date">
                <input type="date" value={targetHireDate} onChange={(e) => setTargetHireDate(e.target.value)} className="input max-w-[220px]" />
              </Field>

              <Field label="Comments">
                <textarea value={comments} onChange={(e) => setComments(e.target.value)} className="input min-h-[60px]" placeholder="Anything else worth noting…" />
              </Field>

              <div className="flex items-center gap-5">
                <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
                  <input type="checkbox" checked={isConfidential} onChange={(e) => setIsConfidential(e.target.checked)} /> Confidential
                </label>
                <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
                  <input type="checkbox" checked={isInternalOnly} onChange={(e) => setIsInternalOnly(e.target.checked)} /> Internal only
                </label>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSubmitForApproval}
              disabled={!canSubmitFull || saving !== null}
              className="bg-brand text-white text-[13px] font-bold px-4 py-2.5 rounded-sm disabled:opacity-50 shadow-soft-sm"
            >
              {saving === "submit" ? "Submitting…" : "Submit for approval"}
            </button>
            <button
              onClick={handleSaveDraft}
              disabled={!canSubmitDraft || saving !== null}
              className="border border-border text-[13px] font-bold px-4 py-2.5 rounded-sm bg-surface disabled:opacity-50"
            >
              {saving === "draft" ? "Saving…" : "Save as draft"}
            </button>
            <button onClick={onCancel} className="text-[13px] font-bold px-4 py-2.5 rounded-sm text-ink-muted">
              Cancel
            </button>
          </div>
        </>
      )}

      {!showFields && (
        <button onClick={onCancel} className="border border-border text-[13px] font-bold px-4 py-2.5 rounded-sm bg-surface self-start">
          Cancel
        </button>
      )}
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
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function handleResumeFile(file: File | null) {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/talent-ai/candidates/parse-resume", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not read that resume.");
      setResumeText(data.text);
      setResumeFileName(data.fileName || file.name);
      setAutoParse(true);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Could not read that resume.");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    setSubmitting(true);
    await onSubmit({ name, email, phone, source, resumeText: resumeText || null, autoParse });
    setSubmitting(false);
  }

  return (
    <div className="border border-border rounded-md p-4 bg-surface shadow-soft-sm flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
        </Field>
        <Field label="Phone">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input" />
        </Field>
      </div>
      <Field label="Resume (optional)">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleResumeFile(file);
          }}
          onClick={() => document.getElementById("candidate-resume-file-input")?.click()}
          className={`border-2 border-dashed rounded-md px-4 py-6 text-center cursor-pointer transition-colors ${
            dragOver ? "border-brand bg-brand-wash" : "border-border bg-page"
          }`}
        >
          <input
            id="candidate-resume-file-input"
            type="file"
            accept=".pdf,.docx,.txt"
            className="hidden"
            onChange={(e) => handleResumeFile(e.target.files?.[0] || null)}
          />
          {uploading ? (
            <p className="m-0 text-[12.5px] text-ink-muted">Reading resume…</p>
          ) : resumeFileName ? (
            <p className="m-0 text-[12.5px] text-ink-2">
              <span className="font-bold">{resumeFileName}</span> attached —{" "}
              <span className="text-brand font-bold underline">replace</span>
            </p>
          ) : (
            <p className="m-0 text-[12.5px] text-ink-muted">
              Drag & drop a resume here, or <span className="text-brand font-bold underline">browse</span> (.pdf, .docx, .txt)
            </p>
          )}
        </div>
        {uploadError && <p className="m-0 mt-1 text-[11.5px] text-critical">{uploadError}</p>}
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[11px] text-ink-muted select-none">Or paste resume text directly</summary>
          <textarea
            value={resumeText}
            onChange={(e) => { setResumeText(e.target.value); setResumeFileName(null); }}
            className="input min-h-[110px] mt-1.5"
            placeholder="Paste resume text to auto-fill details with AI…"
          />
        </details>
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
  onChanged,
}: {
  candidate: Candidate;
  onClose: () => void;
  onAddNote: (body: string) => void;
  onAddScorecard: (payload: Record<string, unknown>) => void;
  onChanged: () => void;
}) {
  const [noteText, setNoteText] = useState("");
  const [scRating, setScRating] = useState("4");
  const [scRecommendation, setScRecommendation] = useState("yes");
  const [scFeedback, setScFeedback] = useState("");

  const [currentCtc, setCurrentCtc] = useState(candidate.current_ctc != null ? String(candidate.current_ctc) : "");
  const [expectedCtc, setExpectedCtc] = useState(candidate.expected_ctc != null ? String(candidate.expected_ctc) : "");
  const [proposedCtc, setProposedCtc] = useState(candidate.proposed_ctc != null ? String(candidate.proposed_ctc) : "");
  const [wfError, setWfError] = useState<string | null>(null);
  const [wfBusy, setWfBusy] = useState(false);

  async function workflowAction(action: string, extra: Record<string, unknown> = {}) {
    setWfError(null);
    setWfBusy(true);
    try {
      const res = await fetch(`/api/talent-ai/candidates/${candidate.id}/workflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "That action failed.");
      if (data.offerUrl) window.open(data.offerUrl, "_blank");
      onChanged();
    } catch (err) {
      setWfError(err instanceof Error ? err.message : "That action failed.");
    } finally {
      setWfBusy(false);
    }
  }

  const isSelected = candidate.stage === "selected" || candidate.stage === "offer";
  const bothSignedOff = !!candidate.selected_hm_by && !!candidate.selected_ta_by;
  const compComplete = candidate.current_ctc != null && candidate.expected_ctc != null && candidate.proposed_ctc != null;
  // Offer/comp only makes sense once interviews are actually done -- surfacing
  // it for a candidate still in Screening invited recruiters to skip the
  // pipeline by mistake. It stays visible once reached, even if the
  // candidate later moves on to BGV/Joined, so history is still visible.
  const readyForOffer = stageIndex(candidate.stage) >= STAGES.findIndex((s) => s.id === "hr_interview");

  const [interviews, setInterviews] = useState<{ id: string; round_name: string; scheduled_at: string | null; status: string }[]>([]);
  const [roundName, setRoundName] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

  useEffect(() => {
    fetch(`/api/talent-ai/interviews?candidateId=${candidate.id}`)
      .then((r) => r.json())
      .then((d) => setInterviews(d.interviews || []));
  }, [candidate.id]);

  async function scheduleInterview() {
    if (!roundName.trim()) return;
    const res = await fetch("/api/talent-ai/interviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "schedule", candidateId: candidate.id, roundName, scheduledAt: scheduledAt || null }),
    });
    const data = await res.json();
    if (res.ok) {
      setInterviews((prev) => [...prev, data.interview]);
      setRoundName("");
      setScheduledAt("");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <VScroller
        className="w-full max-w-md h-full bg-surface shadow-soft"
        trackClassName="h-full p-5 flex flex-col gap-5"
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
            <VScroller className="max-h-40 border border-border rounded-sm" trackClassName="max-h-40 p-2.5">
              <p className="text-[12px] text-ink-2 whitespace-pre-wrap m-0">
                {candidate.resume_text}
              </p>
            </VScroller>
          </div>
        )}

        {wfError && <div className="bg-critical-wash text-critical text-[12px] rounded-sm px-3 py-2">{wfError}</div>}

        {!readyForOffer && (
          <div className="border border-dashed border-border rounded-md p-3 text-[12px] text-ink-muted">
            Selection &amp; Offer unlocks once this candidate reaches HR Interview.
          </div>
        )}

        {readyForOffer && (
        <div className="border border-border rounded-md p-3.5 flex flex-col gap-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Selection &amp; Offer</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Field label="Current CTC">
              <input type="number" value={currentCtc} onChange={(e) => setCurrentCtc(e.target.value)} className="input" />
            </Field>
            <Field label="Expected CTC">
              <input type="number" value={expectedCtc} onChange={(e) => setExpectedCtc(e.target.value)} className="input" />
            </Field>
            <Field label="Proposed CTC">
              <input type="number" value={proposedCtc} onChange={(e) => setProposedCtc(e.target.value)} className="input" />
            </Field>
          </div>
          <button
            onClick={() => workflowAction("set_comp", { currentCtc, expectedCtc, proposedCtc })}
            disabled={wfBusy}
            className="border border-border text-[12px] font-bold px-3 py-1.5 rounded-sm bg-surface self-start disabled:opacity-50"
          >
            Save compensation
          </button>

          <div className="flex items-center gap-2 text-[12px] text-ink-2">
            <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold ${candidate.selected_hm_by ? "bg-good-wash text-good-text" : "bg-page text-ink-muted"}`}>
              HM sign-off {candidate.selected_hm_by ? "✓" : "pending"}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold ${candidate.selected_ta_by ? "bg-good-wash text-good-text" : "bg-page text-ink-muted"}`}>
              Recruiter/TA sign-off {candidate.selected_ta_by ? "✓" : "pending"}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => workflowAction("select_signoff")}
              disabled={wfBusy || bothSignedOff}
              className="border border-border text-[12px] font-bold px-3 py-1.5 rounded-sm bg-surface disabled:opacity-50"
            >
              Sign off on Selection
            </button>
            <button
              onClick={() => workflowAction("move_to_offer")}
              disabled={wfBusy || candidate.stage === "offer" || !bothSignedOff || !compComplete}
              className="bg-brand text-white text-[12px] font-bold px-3 py-1.5 rounded-sm shadow-soft-sm disabled:opacity-50"
              title={!bothSignedOff ? "Needs both sign-offs first" : !compComplete ? "Save all three compensation figures first" : ""}
            >
              {candidate.stage === "offer" ? "Moved to Offer ✓" : "Move to Offer →"}
            </button>
          </div>
          {isSelected && !bothSignedOff && (
            <p className="m-0 text-[11px] text-ink-muted">Both a Hiring Manager and a Recruiter/TA Head sign-off are required before Move to Offer unlocks.</p>
          )}
        </div>
        )}

        <div className="border border-border rounded-md p-3.5 flex flex-col gap-2.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Interviews</div>
          <div className="flex flex-col gap-1.5">
            {interviews.map((iv) => (
              <div key={iv.id} className="flex items-center justify-between text-[12px] border border-border rounded-sm p-2">
                <span className="font-bold">{iv.round_name}</span>
                <span className="text-ink-muted">{iv.scheduled_at ? new Date(iv.scheduled_at).toLocaleString() : "Not yet scheduled"}</span>
                <span className="text-[10.5px] bg-page px-1.5 py-0.5 rounded-full capitalize">{iv.status}</span>
              </div>
            ))}
            {interviews.length === 0 && <p className="text-[12px] text-ink-muted">No interview rounds yet.</p>}
          </div>
          <div className="flex gap-2">
            <input value={roundName} onChange={(e) => setRoundName(e.target.value)} className="input" placeholder="Round name (e.g. Technical)" />
            <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="input max-w-[200px]" />
            <button onClick={scheduleInterview} className="border border-border text-[12px] font-bold px-3 py-2 rounded-sm bg-surface flex-shrink-0">Schedule</button>
          </div>
        </div>

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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
      </VScroller>
    </div>
  );
}
