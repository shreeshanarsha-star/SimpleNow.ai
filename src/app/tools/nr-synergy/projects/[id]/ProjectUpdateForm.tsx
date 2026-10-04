"use client";

import { useId, useState, type FormEvent } from "react";
import { projects as s } from "@/lib/nrs/i18n/en/projects";
import { useAction } from "../../_home/useAction";
import { ErrorLine, fill, inputClass, labelClass, primaryButtonClass } from "../../_home/ui";
import { PROJECT_STATUSES, isProjectStatus, type ProjectStatus } from "../_lib";

interface Values {
  status: ProjectStatus;
  progress: string;
  challenges: string;
  plan_of_action: string;
  help_needed_member_id: string;
  next_steps: string;
}

// Post-only: weekly updates can't be edited or deleted once posted.
export default function ProjectUpdateForm({
  projectId,
  people,
  initialStatus,
  initialNextSteps,
  canSetStatus = false,
}: {
  projectId: string;
  people: { id: string; full_name: string; designation: string | null }[];
  initialStatus: ProjectStatus;
  initialNextSteps: string;
  /** Manager / HR: the status applies at once. Others only suggest it. */
  canSetStatus?: boolean;
}) {
  const uid = useId();
  const blank: Values = {
    status: initialStatus,
    progress: "",
    challenges: "",
    plan_of_action: "",
    help_needed_member_id: "",
    next_steps: initialNextSteps,
  };
  const [v, setV] = useState<Values>(blank);
  const [posted, setPosted] = useState<false | "plain" | "request">(false);
  const { run, pending, error, setError } = useAction();
  const f = (n: string) => `${uid}-${n}`;

  const set = <K extends keyof Values>(k: K, val: Values[K]) => {
    setPosted(false);
    setV((prev) => ({ ...prev, [k]: val }));
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!v.progress.trim()) {
      setError(s.update.progressRequired);
      return;
    }
    if (!window.confirm(s.update.confirm)) return;
    const ok = await run("/api/nr-synergy/projects/updates", {
      project_id: projectId,
      ...v,
      help_needed_member_id: v.help_needed_member_id || null,
    });
    if (ok) {
      const asked = !canSetStatus && v.status !== initialStatus;
      setV({ ...blank, status: canSetStatus ? v.status : initialStatus, next_steps: v.next_steps });
      setPosted(asked ? "request" : "plain");
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate aria-busy={pending}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={f("status")} className={labelClass}>
            {canSetStatus ? s.update.status : s.update.statusSuggest}
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
                {!canSetStatus && st === initialStatus ? fill(s.update.statusNoChange, { status: s.status[st] }) : s.status[st]}
              </option>
            ))}
          </select>
          {!canSetStatus && <p className="text-[11.5px] text-ink-muted mt-1">{s.update.statusSuggestHint}</p>}
        </div>
        <div>
          <label htmlFor={f("help")} className={labelClass}>
            {s.update.helpNeeded}
          </label>
          <select id={f("help")} className={inputClass} value={v.help_needed_member_id} onChange={(e) => set("help_needed_member_id", e.target.value)}>
            <option value="">{s.update.helpNone}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.designation ? `${p.full_name} (${p.designation})` : p.full_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor={f("progress")} className={labelClass}>
          {s.update.progress}
        </label>
        <textarea
          id={f("progress")}
          className={inputClass}
          rows={3}
          required
          maxLength={4000}
          placeholder={s.update.progressHint}
          value={v.progress}
          onChange={(e) => set("progress", e.target.value)}
        />
      </div>
      <div>
        <label htmlFor={f("challenges")} className={labelClass}>
          {s.update.challenges}
        </label>
        <textarea id={f("challenges")} className={inputClass} rows={2} maxLength={4000} value={v.challenges} onChange={(e) => set("challenges", e.target.value)} />
      </div>
      <div>
        <label htmlFor={f("plan")} className={labelClass}>
          {s.update.plan}
        </label>
        <textarea id={f("plan")} className={inputClass} rows={2} maxLength={4000} value={v.plan_of_action} onChange={(e) => set("plan_of_action", e.target.value)} />
      </div>
      <div>
        <label htmlFor={f("next")} className={labelClass}>
          {s.update.nextSteps}
        </label>
        <textarea id={f("next")} className={inputClass} rows={2} maxLength={2000} value={v.next_steps} onChange={(e) => set("next_steps", e.target.value)} />
      </div>

      {error && <ErrorLine>{error}</ErrorLine>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={primaryButtonClass} disabled={pending}>
          {pending ? s.update.posting : s.update.post}
        </button>
        <span role="status" aria-live="polite" className="text-[12px] font-bold text-good-text">
          {posted === "request" ? s.update.postedWithRequest : posted ? s.update.posted : ""}
        </span>
      </div>
    </form>
  );
}
