"use client";

import { useId, useState, type FormEvent } from "react";
import { home as s } from "@/lib/nrs/i18n/en/home";
import { useAction } from "./useAction";
import { ErrorLine, inputClass, labelClass, primaryButtonClass } from "./ui";

export default function KudosForm({
  values,
  people,
}: {
  values: { id: string; name: string }[];
  people: { id: string; full_name: string; designation: string | null }[];
}) {
  const uid = useId();
  const [to, setTo] = useState("");
  const [valueId, setValueId] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const { run, pending, error, setError } = useAction();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSent(false);
    if (!to) return setError(s.kudos.recipientRequired);
    if (!valueId) return setError(s.kudos.valueRequired);
    if (!message.trim()) return setError(s.kudos.messageRequired);
    const ok = await run("/api/nr-synergy/home/kudos", { to_member_id: to, value_id: valueId, message });
    if (ok) {
      setTo("");
      setValueId("");
      setMessage("");
      setSent(true);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2.5" noValidate aria-label={s.kudos.give}>
      <div>
        <label htmlFor={`${uid}-to`} className={labelClass}>
          {s.kudos.to}
        </label>
        <select id={`${uid}-to`} className={inputClass} value={to} required onChange={(e) => setTo(e.target.value)}>
          <option value="">{s.kudos.choosePerson}</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.designation ? `${p.full_name} (${p.designation})` : p.full_name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${uid}-value`} className={labelClass}>
          {s.kudos.value}
        </label>
        <select id={`${uid}-value`} className={inputClass} value={valueId} required onChange={(e) => setValueId(e.target.value)}>
          <option value="">{s.kudos.chooseValue}</option>
          {values.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${uid}-msg`} className={labelClass}>
          {s.kudos.message}
        </label>
        <textarea
          id={`${uid}-msg`}
          rows={2}
          maxLength={500}
          required
          className={inputClass}
          placeholder={s.kudos.messagePlaceholder}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>
      {error && <ErrorLine>{error}</ErrorLine>}
      <div className="flex items-center gap-3">
        <button type="submit" className={primaryButtonClass} disabled={pending}>
          {pending ? s.kudos.sending : s.kudos.send}
        </button>
        <span role="status" aria-live="polite" className="text-[12px] text-good-text">
          {sent ? s.kudos.sent : ""}
        </span>
      </div>
    </form>
  );
}
