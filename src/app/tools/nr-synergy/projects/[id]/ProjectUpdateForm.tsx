"use client";

import { useId, useState, type FormEvent } from "react";
import { projects as s } from "@/lib/nrs/i18n/en/projects";
import { useAction } from "../../_home/useAction";
import { ErrorLine, inputClass, labelClass, primaryButtonClass } from "../../_home/ui";
import { PROJECT_STATUSES, isProjectStatus, type ProjectStatus } from "../_lib";

export interface UpdateFormValues {
  status: ProjectStatus;
  progress: string;
  challenges: string;
  plan_of_action: string;
  help_needed_member_id: string;
  next_milestone: string;
  next_milestone_on: string;
}

export default function ProjectUpdateForm({
  projectId,
  isOwner,
  currentPct,
  people,
  initial,
  editing,
}: {
  projectId: string;
  isOwner: boolean;
  currentPct: number;
  people: { id: string; full_name: string; designation: string | null }[];
  initial: UpdateFormValues;
  editing: boolean;
}) {
  const uid = useId();
  const [v, setV] = useState<UpdateFormValues>(initial);
  const [pct, setPct] = useState<string>(String(currentPct));
  const [saved, setSaved] = useState(false);
  const { run, pending, error, setError } = useAction();

  const set = <K extends keyof UpdateFormValues>(k: K, val: UpdateFormValues[K]) => {
    setSaved(false);
    setV((prev) => ({ ...prev, [k]: val }));
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!v.progress.trim()) {
      setError(s.form.progressRequired);
      return;
    }
    const pctNum = Number(pct);
    const ok = await run("/api/nr-synergy/projects/updates", {
      project_id: projectId,
      ...v,
      help_needed_member_id: v.help_needed_member_id || null,
      next_milestone_on: v.next_milestone_on || null,
      progress_pct: isOwner && pct !== "" && Number.isFinite(pctNum) ? Math.round(pctNum) : null,
    });
    if (ok) setSaved(true);
  }

  const f = (name: string) => `${uid}-${name}`;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
      {editing && <p className="text-[12px] text-ink-muted">{s.form.editing}</p>}

      <div>
        <label htmlFor={f("status")} className={labelClass}>
          {s.form.status}
        </label>
        <select
          id={f("status")}
          className={inputClass}
          value={v.status}
          onChange={(e) => {
            if (isProjectStatus(e.target.value)) set("status", e.target.value);
          }}
        >
          {PROJECT_STATUSES.map((st) => (
            <option key={st} value={st}>
              {s.status[st]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor={f("progress")} className={labelClass}>
          {s.form.progress}
        </label>
        <textarea
          id={f("progress")}
          className={inputClass}
          rows={3}
          required
          maxLength={4000}
          placeholder={s.form.progressHint}
          value={v.progress}
          onChange={(e) => set("progress", e.target.value)}
        />
      </div>

      <div>
        <label htmlFor={f("challenges")} className={labelClass}>
          {s.form.challenges}
        </label>
        <textarea
          id={f("challenges")}
          className={inputClass}
          rows={2}
          maxLength={4000}
          value={v.challenges}
          onChange={(e) => set("challenges", e.target.value)}
        />
      </div>

      <div>
        <label htmlFor={f("plan")} className={labelClass}>
          {s.form.planOfAction}
        </label>
        <textarea
          id={f("plan")}
          className={inputClass}
          rows={2}
          maxLength={4000}
          value={v.plan_of_action}
          onChange={(e) => set("plan_of_action", e.target.value)}
        />
      </div>

      <div>
        <label htmlFor={f("help")} className={labelClass}>
          {s.form.helpNeeded}
        </label>
        <select
          id={f("help")}
          className={inputClass}
          value={v.help_needed_member_id}
          onChange={(e) => set("help_needed_member_id", e.target.value)}
        >
          <option value="">{s.form.helpNone}</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.designation ? `${p.full_name} (${p.designation})` : p.full_name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
        <div>
          <label htmlFor={f("ms")} className={labelClass}>
            {s.form.nextMilestone}
          </label>
          <input
            id={f("ms")}
            className={inputClass}
            maxLength={300}
            value={v.next_milestone}
            onChange={(e) => set("next_milestone", e.target.value)}
          />
        </div>
        <div>
          <label htmlFor={f("mson")} className={labelClass}>
            {s.form.nextMilestoneOn}
          </label>
          <input
            id={f("mson")}
            type="date"
            className={inputClass}
            value={v.next_milestone_on}
            onChange={(e) => set("next_milestone_on", e.target.value)}
          />
        </div>
      </div>

      {isOwner && (
        <div>
          <label htmlFor={f("pct")} className={labelClass}>
            {s.form.progressPct}
          </label>
          <input
            id={f("pct")}
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            step={1}
            className={`${inputClass} max-w-[120px]`}
            value={pct}
            onChange={(e) => {
              setSaved(false);
              setPct(e.target.value);
            }}
          />
        </div>
      )}

      {error && <ErrorLine>{error}</ErrorLine>}
      <div className="flex items-center gap-3">
        <button type="submit" className={primaryButtonClass} disabled={pending}>
          {pending ? s.form.saving : s.form.save}
        </button>
        <span role="status" aria-live="polite" className="text-[12px] text-good-text">
          {saved ? s.form.saved : ""}
        </span>
      </div>
    </form>
  );
}
