"use client";

import { useId, useState, type FormEvent } from "react";
import { help as s } from "@/lib/nrs/i18n/en/help";
import { useAction } from "../_home/useAction";
import { ErrorLine, inputClass, labelClass, primaryButtonClass } from "../_home/ui";
import { TICKET_CATEGORIES, isTicketCategory, type TicketCategory } from "./_lib";

export default function NewTicketForm() {
  const uid = useId();
  const [category, setCategory] = useState<TicketCategory>("it");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [done, setDone] = useState(false);
  const { run, pending, error, setError } = useAction();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setDone(false);
    if (!title.trim()) {
      setError(s.titleRequired);
      return;
    }
    const ok = await run("/api/nr-synergy/help/tickets", { category, title, description });
    if (ok) {
      setTitle("");
      setDescription("");
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
