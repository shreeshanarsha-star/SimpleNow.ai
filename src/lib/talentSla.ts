// SLA / aging thresholds for the Talent.ai pipeline. A candidate sitting
// in a stage longer than its threshold is flagged stale in the UI --
// this is a soft visual signal (amber/red badge), not an enforced rule.
// Terminal stages (joined, rejected) have no SLA; there's nothing left
// to chase.

export const STALE_DAYS_BY_STAGE: Record<string, number> = {
  applied: 3,
  screening: 3,
  hm_review: 5,
  interview_1: 5,
  interview_2: 5,
  hr_interview: 5,
  selected: 3,
  offer: 3,
  bgv: 7,
  ready_to_join: 5,
};

export function daysSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const ms = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

// "Stale" means the candidate has sat in their current stage longer than
// that stage's SLA. Stages with no configured threshold (joined,
// rejected) are never stale.
export function isStale(stage: string, daysInStage: number | null): boolean {
  if (daysInStage == null) return false;
  const threshold = STALE_DAYS_BY_STAGE[stage];
  if (threshold == null) return false;
  return daysInStage > threshold;
}
