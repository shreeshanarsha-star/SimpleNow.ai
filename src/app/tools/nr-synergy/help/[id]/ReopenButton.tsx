"use client";

import { desk } from "@/lib/nrs/i18n/en/desk";
import { useAction } from "../../_home/useAction";
import { ErrorLine, secondaryButtonClass } from "../../_home/ui";

export default function ReopenButton({ ticketId }: { ticketId: string }) {
  const { run, pending, error } = useAction();
  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        className={secondaryButtonClass}
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={() => void run(`/api/nr-synergy/help/tickets/${ticketId}/reopen`, {})}
      >
        {pending ? desk.help.reopening : desk.help.reopen}
      </button>
      {error && <ErrorLine>{error}</ErrorLine>}
    </div>
  );
}
