"use client";

import { projects as s } from "@/lib/nrs/i18n/en/projects";
import { useAction } from "../../_home/useAction";
import { fill, primaryButtonClass, secondaryButtonClass } from "../../_home/ui";
import type { ProjectStatus } from "../_lib";

// Manager / HR: approve or decline the status suggested in a weekly update.
export default function StatusRequestActions({ projectId, from }: { projectId: string; from: ProjectStatus }) {
  const { run, pending, error } = useAction();
  const decide = (approve: boolean) => run(`/api/nr-synergy/projects/${projectId}`, { action: "status_decision", approve });
  return (
    <div className="flex flex-wrap items-center gap-2 mt-2">
      <button type="button" className={primaryButtonClass} disabled={pending} onClick={() => decide(true)}>
        {pending ? s.statusRequest.saving : s.statusRequest.approve}
      </button>
      <button type="button" className={secondaryButtonClass} disabled={pending} onClick={() => decide(false)}>
        {fill(s.statusRequest.decline, { from: s.status[from] })}
      </button>
      {error && (
        <span role="alert" className="text-[11.5px] font-bold text-critical">
          {error}
        </span>
      )}
    </div>
  );
}
