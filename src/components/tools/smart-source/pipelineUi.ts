// Presentation helpers for the Smart Source Stage + Status pipeline.
// Data rules live in @/lib/smartSourcePipeline; this file is styling only.

import {
  STAGES,
  statusDef,
  type AgingLevel,
  type PipelineDetails,
  type StageKey,
  type StatusKey,
  type StatusTone,
} from "@/lib/smartSourcePipeline";

// Fields a candidate row carries for its position in one project.
export type PipelineFields = {
  pipeline_stage?: StageKey;
  pipeline_status?: StatusKey;
  status_reason?: string | null;
  hold_until?: string | null;
  bgv_status?: string | null;
  pipeline_details?: PipelineDetails | null;
  stage_changed_at?: string | null;
  status_changed_at?: string | null;
};

// Payload accepted by POST /api/smart-source/projects/[id]/pipeline
// (minus candidateIds).
export type PipelineChange = {
  stage: StageKey;
  status: StatusKey;
  reason?: string | null;
  hold_until?: string | null;
  note?: string | null;
  interview?: {
    scheduled_at?: string | null;
    mode?: string | null;
    panel?: string | null;
    rating?: number | null;
    feedback?: string | null;
  };
  offered_ctc?: string | null;
  doj?: string | null;
};

const TONE_CLASS: Record<StatusTone, string> = {
  neutral: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/60 dark:text-slate-300 dark:border-slate-700",
  info: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800",
  progress: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800",
  success: "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800",
  warning: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800",
  danger: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800",
};

export function statusToneClass(status: string | null | undefined): string {
  return TONE_CLASS[statusDef(status).tone];
}

export const STAGE_BADGE_CLASS = "bg-brand/[0.08] text-ink border-brand/25";

// Funnel band colour: intensity rises stage by stage using the theme's own
// brand colour, so it reads in every app theme.
const BAND_ALPHA = [0.12, 0.2, 0.28, 0.36, 0.45, 0.54, 0.63, 0.72, 0.84, 1];
export function stageBandStyle(index: number): { background: string; color: string } {
  const a = BAND_ALPHA[Math.min(index, BAND_ALPHA.length - 1)];
  return {
    background: `rgb(var(--brand-rgb) / ${a})`,
    color: a >= 0.5 ? "#fff" : "var(--ink)",
  };
}

export function stageIndex(stage: StageKey): number {
  return STAGES.findIndex((s) => s.key === stage);
}

export const AGING_CLASS: Record<AgingLevel, string> = {
  ok: "text-ink-muted",
  amber: "text-amber-600 dark:text-amber-400",
  red: "text-rose-600 dark:text-rose-400",
};

export const EXIT_CHIPS = [
  { key: "hold", label: "Hold", dot: "bg-amber-400", text: "text-amber-600 dark:text-amber-400" },
  { key: "rejected", label: "Rejected", dot: "bg-rose-400", text: "text-rose-600 dark:text-rose-400" },
  { key: "withdrawn", label: "Withdrawn", dot: "bg-orange-400", text: "text-orange-600 dark:text-orange-400" },
] as const;

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

// Phone -> wa.me digits. Indian 10-digit numbers get the 91 prefix.
export function waDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  if (d.length === 10) return `91${d}`;
  if (d.length >= 11 && d.length <= 15) return d;
  return null;
}
