"use client";

import { useId, useState } from "react";
import Icon from "@/components/Icon";
import { knowledge as s } from "@/lib/nrs/i18n/en/knowledge";
import { useAction } from "../../_home/useAction";
import { ErrorLine, fill, fmtDate, inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from "../../_home/ui";

export default function JourneyStep({
  step,
  label,
  completedAt,
  reflection,
}: {
  step: string;
  label: string;
  completedAt: string | null;
  reflection: string;
}) {
  const id = useId();
  const [text, setText] = useState(reflection);
  const [saved, setSaved] = useState(false);
  const { run, pending, error } = useAction();
  const done = !!completedAt;

  async function save() {
    setSaved(false);
    const ok = await run("/api/nr-synergy/knowledge/joe", { step, reflection: text });
    if (ok) setSaved(true);
  }

  return (
    <li className={`border rounded-sm p-3 flex flex-col gap-2 ${done ? "border-good/40 bg-good-wash/40" : "border-border"}`}>
      <div className="flex items-start gap-2">
        <span
          className={`mt-0.5 w-5 h-5 shrink-0 rounded-full flex items-center justify-center ${
            done ? "bg-good text-white" : "border border-border-strong"
          }`}
          aria-hidden="true"
        >
          {done && <Icon name="check" className="w-3.5 h-3.5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-ink break-words">{label}</p>
          {done && <p className="text-[11.5px] text-good-text">{fill(s.joe.completedOn, { date: fmtDate(completedAt) })}</p>}
        </div>
      </div>
      <div>
        <label htmlFor={id} className={labelClass}>
          {s.joe.reflection}
        </label>
        <textarea
          id={id}
          rows={2}
          maxLength={4000}
          className={inputClass}
          value={text}
          onChange={(e) => {
            setSaved(false);
            setText(e.target.value);
          }}
        />
      </div>
      {error && <ErrorLine>{error}</ErrorLine>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          className={done ? secondaryButtonClass : primaryButtonClass}
          disabled={pending || (done && text === reflection)}
          onClick={() => void save()}
        >
          {pending ? s.joe.saving : done ? s.joe.saveReflection : s.joe.markComplete}
        </button>
        <span role="status" aria-live="polite" className="text-[12px] text-good-text">
          {saved ? s.joe.saved : ""}
        </span>
      </div>
    </li>
  );
}
