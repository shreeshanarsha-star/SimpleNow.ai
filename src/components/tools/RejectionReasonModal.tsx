"use client";

import { useState } from "react";
import { REJECTION_REASONS } from "@/lib/talentRejectionReasons";

// Small confirmation modal shown whenever a candidate is moved to the
// Rejected stage, in both the requisition candidate table and the
// candidate profile page. Requires picking a reason code before the
// stage change actually goes through, so "why" is captured at the exact
// moment it happens instead of being reconstructed later from memory.
export default function RejectionReasonModal({
  candidateName,
  onCancel,
  onConfirm,
}: {
  candidateName?: string;
  onCancel: () => void;
  onConfirm: (reasonId: string) => void;
}) {
  const [reason, setReason] = useState(REJECTION_REASONS[0].id);
  const [submitting, setSubmitting] = useState(false);

  async function confirm() {
    setSubmitting(true);
    try {
      await onConfirm(reason);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div
        className="bg-surface border border-border rounded-lg p-4 w-full max-w-sm shadow-soft flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[13px] font-bold text-ink">
          Reject {candidateName ? candidateName : "candidate"}?
        </div>
        <div>
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted mb-1">Reason</div>
          <select value={reason} onChange={(e) => setReason(e.target.value)} className="input">
            {REJECTION_REASONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-end gap-2 mt-1">
          <button onClick={onCancel} className="text-[12px] font-semibold text-ink-muted px-3 py-1.5">
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={submitting}
            className="text-[12px] font-bold text-white bg-critical px-3 py-1.5 rounded-sm disabled:opacity-50"
          >
            {submitting ? "Rejecting…" : "Confirm reject"}
          </button>
        </div>
      </div>
    </div>
  );
}
