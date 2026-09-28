"use client";

import { useMemo, useState } from "react";
import Icon from "@/components/Icon";
import {
  HOLD_REASONS,
  INTERVIEW_MODES,
  REJECT_REASONS,
  STAGES,
  STAGE_STATUSES,
  WITHDRAW_REASONS,
  defaultStatusFor,
  stageLabel,
  statusDef,
  statusLabel,
  type PipelineDetails,
  type StageKey,
  type StatusKey,
} from "@/lib/smartSourcePipeline";
import type { PipelineChange } from "./pipelineUi";

const FIELD =
  "w-full text-[13px] bg-page border border-border rounded-sm px-2.5 py-1.5 text-ink placeholder:text-ink-muted focus:outline-none focus:border-brand";
const LABEL = "block text-[11.5px] font-bold text-ink-2 mb-1";

function plusDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time.
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Collects whatever a Stage/Status change needs (reason, hold review date,
// interview slot, feedback, CTC, date of joining) before it is saved. Used
// for a single candidate (status preset from the row) and for bulk changes
// (stage + status picked here).
export default function StatusChangeDialog({
  title,
  subtitle,
  initialStage,
  initialStatus,
  allowStagePick,
  enabledStages,
  details,
  onCancel,
  onSubmit,
}: {
  title: string;
  subtitle?: string;
  initialStage: StageKey;
  initialStatus: StatusKey;
  allowStagePick: boolean;
  enabledStages: StageKey[];
  details?: PipelineDetails | null;
  onCancel: () => void;
  onSubmit: (change: PipelineChange) => Promise<string | null>;
}) {
  const [stage, setStage] = useState<StageKey>(initialStage);
  const [status, setStatus] = useState<StatusKey>(initialStatus);
  const [reason, setReason] = useState("");
  const [holdUntil, setHoldUntil] = useState(plusDaysIso(7));
  const iv = details?.interviews?.[initialStage];
  const [scheduledAt, setScheduledAt] = useState(toLocalInput(iv?.scheduled_at));
  const [mode, setMode] = useState(iv?.mode || "Video");
  const [panel, setPanel] = useState(iv?.panel || "");
  const [rating, setRating] = useState<number | null>(iv?.rating ?? null);
  const [feedback, setFeedback] = useState(iv?.feedback || "");
  const [offeredCtc, setOfferedCtc] = useState(details?.offered_ctc || "");
  const [doj, setDoj] = useState(details?.doj || "");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needs = useMemo(() => statusDef(status).needs ?? [], [status]);
  const reasonList: readonly string[] | null = needs.includes("reason_reject")
    ? REJECT_REASONS
    : needs.includes("reason_withdraw")
    ? WITHDRAW_REASONS
    : needs.includes("reason_hold")
    ? HOLD_REASONS
    : null;

  const missing =
    (reasonList && !reason) ||
    (needs.includes("reason_hold") && !holdUntil) ||
    (needs.includes("schedule") && !scheduledAt);

  function pickStage(next: StageKey) {
    setStage(next);
    setStatus(defaultStatusFor(next));
    setReason("");
  }

  async function submit() {
    if (missing || saving) return;
    setSaving(true);
    setError(null);
    const change: PipelineChange = { stage, status, note: note.trim() || null };
    if (reasonList) change.reason = reason;
    if (needs.includes("reason_hold")) change.hold_until = holdUntil;
    if (needs.includes("schedule")) {
      change.interview = {
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        mode,
        panel: panel.trim() || null,
      };
    }
    if (needs.includes("feedback")) {
      change.interview = { ...(change.interview || {}), rating, feedback: feedback.trim() || null };
    }
    if (needs.includes("ctc")) change.offered_ctc = offeredCtc.trim() || null;
    if (needs.includes("doj")) change.doj = doj || null;
    const err = await onSubmit(change);
    setSaving(false);
    if (err) setError(err);
  }

  const isInterviewStage = stage === "l1" || stage === "l2" || stage === "l3" || stage === "hr_interview" || stage === "assessment";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-surface border border-border rounded-lg shadow-soft-lg w-full max-w-md flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-border">
          <div className="min-w-0">
            <h3 className="font-bold text-ink text-[15px]">{title}</h3>
            {subtitle && <p className="text-[12px] text-ink-muted truncate">{subtitle}</p>}
          </div>
          <button type="button" onClick={onCancel} aria-label="Close" className="text-ink-muted hover:text-ink p-1 rounded-sm">
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-5 py-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={LABEL}>Stage</span>
              {allowStagePick ? (
                <select className={FIELD} value={stage} onChange={(e) => pickStage(e.target.value as StageKey)}>
                  {STAGES.filter((s) => enabledStages.includes(s.key)).map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              ) : (
                <div className={`${FIELD} bg-surface`}>{stageLabel(stage)}</div>
              )}
            </label>
            <label className="block">
              <span className={LABEL}>Status</span>
              <select
                className={FIELD}
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as StatusKey);
                  setReason("");
                }}
              >
                {STAGE_STATUSES[stage].map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {(status === "shortlist" || status === "offer_accepted") && (
            <p className="text-[11.5px] text-ink-2 bg-brand/[0.06] border border-brand/20 rounded-sm px-2.5 py-1.5">
              The candidate will move to the next stage automatically.
            </p>
          )}

          {reasonList && (
            <label className="block">
              <span className={LABEL}>
                {needs.includes("reason_reject")
                  ? "Rejection reason"
                  : needs.includes("reason_hold")
                  ? "Hold reason"
                  : "Why did the candidate withdraw?"}{" "}
                <span className="text-rose-500">*</span>
              </span>
              <select className={FIELD} value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">Select a reason…</option>
                {reasonList.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          )}

          {needs.includes("reason_hold") && (
            <label className="block">
              <span className={LABEL}>
                Review on <span className="text-rose-500">*</span>
              </span>
              <input type="date" className={FIELD} value={holdUntil} onChange={(e) => setHoldUntil(e.target.value)} />
              <span className="text-[10.5px] text-ink-muted">The candidate is flagged &ldquo;Review due&rdquo; from this date.</span>
            </label>
          )}

          {needs.includes("schedule") && (
            <>
              <label className="block">
                <span className={LABEL}>
                  {isInterviewStage ? "Interview date & time" : "Date & time"} <span className="text-rose-500">*</span>
                </span>
                <input
                  type="datetime-local"
                  className={FIELD}
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className={LABEL}>Mode</span>
                  <select className={FIELD} value={mode} onChange={(e) => setMode(e.target.value)}>
                    {INTERVIEW_MODES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className={LABEL}>Panel</span>
                  <input
                    className={FIELD}
                    value={panel}
                    onChange={(e) => setPanel(e.target.value)}
                    placeholder="Interviewer names"
                  />
                </label>
              </div>
            </>
          )}

          {needs.includes("feedback") && (
            <>
              <div>
                <span className={LABEL}>Rating</span>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating(rating === n ? null : n)}
                      aria-label={`${n} out of 5`}
                      className={`w-8 h-8 rounded-sm border text-[12.5px] font-bold transition-colors ${
                        rating !== null && n <= rating
                          ? "bg-brand text-white border-brand"
                          : "bg-page text-ink-2 border-border hover:border-brand/40"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                  <span className="text-[11px] text-ink-muted ml-1">1 = poor, 5 = excellent</span>
                </div>
              </div>
              <label className="block">
                <span className={LABEL}>Feedback</span>
                <textarea
                  rows={3}
                  className={`${FIELD} resize-y`}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Strengths, concerns, recommendation…"
                />
              </label>
            </>
          )}

          {needs.includes("ctc") && (
            <label className="block">
              <span className={LABEL}>Offered CTC</span>
              <input
                className={FIELD}
                value={offeredCtc}
                onChange={(e) => setOfferedCtc(e.target.value)}
                placeholder="e.g. 28 LPA"
              />
            </label>
          )}

          {needs.includes("doj") && (
            <label className="block">
              <span className={LABEL}>Date of joining</span>
              <input type="date" className={FIELD} value={doj} onChange={(e) => setDoj(e.target.value)} />
            </label>
          )}

          <label className="block">
            <span className={LABEL}>Note (optional)</span>
            <input
              className={FIELD}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Saved to the candidate's history"
            />
          </label>

          {error && <p className="text-[12px] text-critical font-semibold">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="border border-border text-[12.5px] font-bold px-3 py-1.5 rounded-sm bg-surface hover:bg-page transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving || !!missing}
            className="bg-brand text-white text-[12.5px] font-bold px-4 py-1.5 rounded-sm shadow-soft-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
