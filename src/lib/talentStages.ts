// Single source of truth for the Talent.ai pipeline stage taxonomy. Every
// file that previously hardcoded its own copy of this list (TalentAiBoard,
// TalentWorkspace, RequisitionCandidatesView, CandidateProfileView, the
// recruiter-snapshot API route) now imports from here instead -- so
// renaming, reordering, or adding a stage is a one-file change instead of
// a five-file hunt.

export type Stage = { id: string; label: string };

export const STAGES: Stage[] = [
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

// Same ids, in pipeline order -- for progress comparisons like
// "has this candidate reached stage X or further".
export const STAGE_ORDER: string[] = STAGES.map((s) => s.id);

export const STAGE_LABEL: Record<string, string> = Object.fromEntries(
  STAGES.map((s) => [s.id, s.label])
);

export function stageLabel(stage: string): string {
  return STAGE_LABEL[stage] || stage;
}

export function stageIndex(stage: string): number {
  return STAGE_ORDER.indexOf(stage);
}

// The funnel view (recruiter Pipeline tab) counts progress through the
// pipeline and doesn't have its own column for "rejected" -- rejections
// are surfaced separately, not as a funnel stage to pass through.
export const FUNNEL_STAGES: Stage[] = STAGES.filter((s) => s.id !== "rejected");
