"use client";

import { useId, useState } from "react";
import { knowledge as s } from "@/lib/nrs/i18n/en/knowledge";
import { secondaryButtonClass } from "../../_home/ui";

export default function Transcript({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className={`${secondaryButtonClass} self-start`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? s.joe.hideTranscript : s.joe.showTranscript}
      </button>
      <div id={id} hidden={!open} className="rounded-sm bg-page p-3">
        <h3 className="sr-only">{s.joe.transcript}</h3>
        <p className="text-[13px] leading-relaxed text-ink-2 whitespace-pre-line break-words">{text}</p>
      </div>
    </div>
  );
}
