"use client";

import { knowledge as s } from "@/lib/nrs/i18n/en/knowledge";
import { useAction } from "../../../_home/useAction";
import { ErrorLine, primaryButtonClass } from "../../../_home/ui";

export default function AckButton({ versionId }: { versionId: string }) {
  const { run, pending, error } = useAction();
  return (
    <div className="flex flex-col gap-2 items-start">
      <button
        type="button"
        className={primaryButtonClass}
        disabled={pending}
        onClick={() => void run("/api/nr-synergy/knowledge/ack", { version_id: versionId })}
      >
        {pending ? s.acknowledging : s.acknowledge}
      </button>
      {error && <ErrorLine>{error}</ErrorLine>}
    </div>
  );
}
