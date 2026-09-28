"use client";

import Icon from "@/components/Icon";
import {
  BGV_STATUSES,
  STAGES,
  STAGE_STATUSES,
  agingLevel,
  daysSince,
  exitKind,
  isHoldDue,
  statusLabel,
  type StageKey,
  type StatusKey,
} from "@/lib/smartSourcePipeline";
import {
  AGING_CLASS,
  STAGE_BADGE_CLASS,
  formatDateTime,
  formatShortDate,
  statusToneClass,
  type PipelineFields,
} from "./pipelineUi";

const SELECT =
  "text-[11.5px] font-bold py-1 pl-2.5 pr-6 rounded-md border appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand max-w-full truncate";

function Chevron() {
  return (
    <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-current opacity-70">
      <Icon name="chevronDown" className="w-3 h-3" />
    </div>
  );
}

// Stage dropdown only (the list view renders Stage and Status in separate
// columns). Stages switched off for the project are hidden unless the
// candidate is already sitting in one.
export function StageSelect({
  stage,
  enabledStages,
  onChange,
  disabled,
}: {
  stage: StageKey;
  enabledStages: StageKey[];
  onChange: (stage: StageKey) => void;
  disabled?: boolean;
}) {
  return (
    <div className="relative inline-block max-w-full">
      <select
        value={stage}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as StageKey)}
        aria-label="Stage"
        className={`${SELECT} ${STAGE_BADGE_CLASS}`}
      >
        {STAGES.filter((s) => enabledStages.includes(s.key) || s.key === stage).map((s) => (
          <option key={s.key} value={s.key} className="bg-surface text-ink font-medium">
            {s.label}
          </option>
        ))}
      </select>
      <Chevron />
    </div>
  );
}

// Status dropdown (only this stage's statuses) plus the context line under
// it: time in stage, hold review date, reason, interview slot, DOJ, BGV.
export function StatusCell({
  c,
  onStatusPick,
  onBgvChange,
  disabled,
}: {
  c: PipelineFields;
  onStatusPick: (status: StatusKey) => void;
  onBgvChange: (bgv: string | null) => void;
  disabled?: boolean;
}) {
  const stage = (c.pipeline_stage || "sourcing") as StageKey;
  const status = (c.pipeline_status || "yet_to_contact") as StatusKey;
  const days = daysSince(c.stage_changed_at);
  const aging = agingLevel(stage, status, days);
  const holdDue = isHoldDue(status, c.hold_until);
  const iv = c.pipeline_details?.interviews?.[stage];
  const doj = c.pipeline_details?.doj;
  const showBgv =
    stage === "joining" || (stage === "offer" && (status === "offered" || status === "offer_accepted")) || !!c.bgv_status;
  const options = STAGE_STATUSES[stage].includes(status) ? STAGE_STATUSES[stage] : [status, ...STAGE_STATUSES[stage]];

  return (
    <div className="flex flex-col gap-1 min-w-0">
      <div className="relative inline-block max-w-full">
        <select
          value={status}
          disabled={disabled}
          onChange={(e) => onStatusPick(e.target.value as StatusKey)}
          aria-label="Status"
          className={`${SELECT} ${statusToneClass(status)}`}
        >
          {options.map((s) => (
            <option key={s} value={s} className="bg-surface text-ink font-medium">
              {statusLabel(s)}
            </option>
          ))}
        </select>
        <Chevron />
      </div>

      <div className="flex flex-col gap-0.5 text-[10.5px] leading-snug">
        {status === "hold" && c.hold_until && (
          <span className={holdDue ? "text-rose-600 dark:text-rose-400 font-bold" : "text-ink-muted"}>
            {holdDue ? "Review due" : "Review"} · {formatShortDate(c.hold_until)}
          </span>
        )}
        {exitKind(status) && c.status_reason && (
          <span className="text-ink-2 truncate" title={c.status_reason}>
            {c.status_reason}
          </span>
        )}
        {status === "scheduled" && iv?.scheduled_at && (
          <span className="text-ink-2 inline-flex items-center gap-1">
            <Icon name="calendar" className="w-3 h-3 opacity-70" />
            {formatDateTime(iv.scheduled_at)}
            {iv.mode ? ` · ${iv.mode}` : ""}
          </span>
        )}
        {status === "complete" && typeof iv?.rating === "number" && (
          <span className="text-ink-2">Rated {iv.rating}/5</span>
        )}
        {(stage === "joining" || status === "offer_accepted") && doj && status !== "joined" && (
          <span className="text-ink-2">DOJ {formatShortDate(doj)}</span>
        )}
        {!exitKind(status) && status !== "joined" && stage !== "joining" && (
          <span className={`inline-flex items-center gap-1 ${AGING_CLASS[aging]} ${aging !== "ok" ? "font-bold" : ""}`}>
            <Icon name="clock" className="w-3 h-3 opacity-70" />
            {days === 0 ? "Today" : `${days}d`} in stage
          </span>
        )}
        {showBgv && (
          <select
            value={c.bgv_status || ""}
            disabled={disabled}
            onChange={(e) => onBgvChange(e.target.value || null)}
            aria-label="Background verification"
            className={`self-start text-[10.5px] font-bold rounded-sm border px-1.5 py-0.5 bg-page focus:outline-none focus:border-brand ${
              c.bgv_status === "cleared"
                ? "text-emerald-700 border-emerald-300 dark:text-emerald-300 dark:border-emerald-800"
                : c.bgv_status === "discrepancy"
                ? "text-rose-600 border-rose-300 dark:text-rose-300 dark:border-rose-800"
                : c.bgv_status === "initiated"
                ? "text-sky-700 border-sky-300 dark:text-sky-300 dark:border-sky-800"
                : "text-ink-muted border-border"
            }`}
          >
            <option value="">BGV: not started</option>
            {BGV_STATUSES.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
