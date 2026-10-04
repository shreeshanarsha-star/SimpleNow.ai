"use client";

import { useId, useState, type FormEvent } from "react";
import { help as s } from "@/lib/nrs/i18n/en/help";
import { desk } from "@/lib/nrs/i18n/en/desk";
import { useAction } from "../_home/useAction";
import { ErrorLine, inputClass, labelClass, primaryButtonClass } from "../_home/ui";
import { TICKET_CATEGORIES, TICKET_PRIORITIES, isTicketCategory, isTicketPriority, type TicketCategory, type TicketPriority } from "./_lib";

export default function NewTicketForm({ prefill }: { prefill?: { category?: string; title?: string; description?: string } }) {
  const uid = useId();
  const [category, setCategory] = useState<TicketCategory>(isTicketCategory(prefill?.category) ? prefill.category : "it");
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [title, setTitle] = useState(prefill?.title ?? "");
  const [description, setDescription] = useState(prefill?.description ?? "");
  const [done, setDone] = useState(false);
  const { run, pending, error, setError } = useAction();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setDone(false);
    if (!title.trim()) {
      setError(s.titleRequired);
      return;
    }
    const ok = await run("/api/nr-synergy/help/tickets", { category, title, description, priority });
    if (ok) {
      setTitle("");
      setDescription("");
      setPriority("normal");
      setDone(true);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
      <fieldset>
        <legend className={labelClass}>{s.category}</legend>
        <div className="flex flex-wrap gap-2">
          {TICKET_CATEGORIES.map((c) => (
            <label
              key={c}
              className={`cursor-pointer rounded-sm border px-3 py-1.5 text-[12.5px] font-bold focus-within:ring-2 focus-within:ring-brand ${
                category === c ? "border-brand bg-brand-wash text-brand-dark" : "border-border text-ink-2 hover:bg-page"
              }`}
            >
              <input
                type="radio"
                name={`${uid}-cat`}
                value={c}
                checked={category === c}
                onChange={(e) => {
                  if (isTicketCategory(e.target.value)) setCategory(e.target.value);
                }}
                className="sr-only"
              />
              {s.categories[c]}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor={`${uid}-priority`} className={labelClass}>
          {desk.help.priority}
        </label>
        <select
          id={`${uid}-priority`}
          className={inputClass}
          value={priority}
          aria-describedby={`${uid}-priority-hint`}
          onChange={(e) => {
            if (isTicketPriority(e.target.value)) setPriority(e.target.value);
          }}
        >
          {TICKET_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {desk.priority[p]}
            </option>
          ))}
        </select>
        <p id={`${uid}-priority-hint`} className="mt-1 text-[11.5px] text-ink-muted">
          {desk.help.priorityHint}
        </p>
      </div>
      <div>
        <label htmlFor={`${uid}-title`} className={labelClass}>
          {s.ticketTitle}
        </label>
        <input
          id={`${uid}-title`}
          className={inputClass}
          maxLength={200}
          required
          placeholder={s.ticketTitlePlaceholder}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor={`${uid}-desc`} className={labelClass}>
          {s.description}
        </label>
        <textarea
          id={`${uid}-desc`}
          rows={4}
          maxLength={4000}
          className={inputClass}
          placeholder={s.descriptionPlaceholder}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      {error && <ErrorLine>{error}</ErrorLine>}
      <div className="flex items-center gap-3">
        <button type="submit" className={primaryButtonClass} disabled={pending}>
          {pending ? s.creating : s.create}
        </button>
        <span role="status" aria-live="polite" className="text-[12px] text-good-text">
          {done ? s.created : ""}
        </span>
      </div>
    </form>
  );
}
