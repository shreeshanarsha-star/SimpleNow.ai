// Shared rejection reason codes for the "Rejected" pipeline stage. A
// single source of truth (used by RequisitionCandidatesView, the
// candidate profile page, and the reason picker modal) so every
// rejection carries a real, reportable reason instead of the stage
// change being the only record of what happened.

export type RejectionReason = { id: string; label: string };

export const REJECTION_REASONS: RejectionReason[] = [
  { id: "not_enough_experience", label: "Not enough experience" },
  { id: "skills_mismatch", label: "Skills mismatch" },
  { id: "compensation_mismatch", label: "Compensation expectations mismatch" },
  { id: "failed_interview", label: "Did not clear interview" },
  { id: "culture_fit", label: "Culture / role fit" },
  { id: "position_closed", label: "Position closed or filled" },
  { id: "candidate_withdrew", label: "Candidate withdrew" },
  { id: "overqualified", label: "Overqualified" },
  { id: "location_mismatch", label: "Location / relocation constraint" },
  { id: "failed_bgv", label: "Failed background verification" },
  { id: "other", label: "Other" },
];

export const REJECTION_REASON_LABEL: Record<string, string> = Object.fromEntries(
  REJECTION_REASONS.map((r) => [r.id, r.label])
);

export function rejectionReasonLabel(id: string | null | undefined): string {
  if (!id) return "—";
  return REJECTION_REASON_LABEL[id] || id;
}
