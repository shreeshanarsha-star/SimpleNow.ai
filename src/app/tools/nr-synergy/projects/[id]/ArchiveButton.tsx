"use client";

import { projects as s } from "@/lib/nrs/i18n/en/projects";
import { useAction } from "../../_home/useAction";
import { secondaryButtonClass } from "../../_home/ui";

export default function ArchiveButton({ projectId, archived }: { projectId: string; archived: boolean }) {
  const { run, pending, error } = useAction();

  async function onClick() {
    if (!archived && !window.confirm(s.manage.archiveConfirm)) return;
    await run(`/api/nr-synergy/projects/${projectId}`, { action: archived ? "unarchive" : "archive" });
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={`${secondaryButtonClass} ${archived ? "" : "text-critical hover:bg-critical-wash"}`}
      >
        {pending ? s.manage.archiving : archived ? s.manage.unarchive : s.manage.archive}
      </button>
      {error && (
        <span role="alert" className="text-[11.5px] font-bold text-critical">
          {error}
        </span>
      )}
    </span>
  );
}
