"use client";

import { useId, useState, type FormEvent } from "react";
import { help as s } from "@/lib/nrs/i18n/en/help";
import { useAction } from "../../_home/useAction";
import { ErrorLine, inputClass, labelClass, primaryButtonClass } from "../../_home/ui";

export default function ReplyForm({ ticketId }: { ticketId: string }) {
  const id = useId();
  const [body, setBody] = useState("");
  const { run, pending, error } = useAction();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    const ok = await run(`/api/nr-synergy/help/tickets/${ticketId}/messages`, { body });
    if (ok) setBody("");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 border-t border-border pt-3">
      <label htmlFor={id} className={labelClass}>
        {s.reply}
      </label>
      <textarea
        id={id}
        rows={3}
        maxLength={4000}
        className={inputClass}
        placeholder={s.replyPlaceholder}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      {error && <ErrorLine>{error}</ErrorLine>}
      <button type="submit" className={`${primaryButtonClass} self-start`} disabled={pending || !body.trim()}>
        {pending ? s.sending : s.send}
      </button>
    </form>
  );
}
