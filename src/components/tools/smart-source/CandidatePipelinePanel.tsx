"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { STAGES, stageLabel, statusLabel, type StageKey } from "@/lib/smartSourcePipeline";
import { formatDateTime, formatShortDate, type PipelineFields } from "./pipelineUi";

type HistoryEvent = {
  id: string;
  from_stage: string | null;
  from_status: string | null;
  to_stage: string;
  to_status: string;
  reason: string | null;
  note: string | null;
  auto: boolean;
  actor_name: string | null;
  created_at: string;
};

// Drawer content for one candidate in a project: what was captured at each
// step (interview slots, ratings, offer, DOJ, BGV) and the full
// Stage/Status history.
export default function CandidatePipelinePanel({
  projectId,
  candidateId,
  c,
  refreshKey,
}: {
  projectId: string;
  candidateId: string;
  c: PipelineFields;
  refreshKey: string;
}) {
  const [events, setEvents] = useState<HistoryEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch(`/api/smart-source/projects/${projectId}/pipeline?candidateId=${encodeURIComponent(candidateId)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Could not load history.");
        if (!cancelled) setEvents(data.events || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load history.");
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, candidateId, refreshKey]);

  const d = c.pipeline_details || {};
  const interviews = STAGES.filter((s) => d.interviews?.[s.key]).map((s) => ({
    stage: s.key as StageKey,
    ...d.interviews![s.key]!,
  }));
  const hasFacts = interviews.length > 0 || d.offered_ctc || d.doj || c.bgv_status;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="flex flex-col gap-2">
        <div className="text-[11px] font-extrabold uppercase tracking-wider text-ink-muted">Captured details</div>
        {!hasFacts ? (
          <p className="text-[12px] text-ink-muted">
            Nothing captured yet. Interview slots, ratings, offer CTC and date of joining appear here as the candidate moves
            through stages.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5 text-[12px]">
            {interviews.map((iv) => (
              <div key={iv.stage} className="border border-border rounded-sm px-2.5 py-1.5 bg-page/60">
                <div className="font-bold text-ink">{stageLabel(iv.stage)}</div>
                <div className="text-ink-2">
                  {iv.scheduled_at ? formatDateTime(iv.scheduled_at) : "Not scheduled"}
                  {iv.mode ? ` · ${iv.mode}` : ""}
                  {iv.panel ? ` · ${iv.panel}` : ""}
                </div>
                {(typeof iv.rating === "number" || iv.feedback) && (
                  <div className="text-ink-2 mt-0.5">
                    {typeof iv.rating === "number" && <span className="font-bold">Rating {iv.rating}/5. </span>}
                    {iv.feedback && <span className="whitespace-pre-wrap">{iv.feedback}</span>}
                  </div>
                )}
              </div>
            ))}
            {d.offered_ctc && (
              <div className="text-ink-2">
                <span className="font-bold text-ink">Offered CTC:</span> {d.offered_ctc}
              </div>
            )}
            {d.doj && (
              <div className="text-ink-2">
                <span className="font-bold text-ink">Date of joining:</span> {formatShortDate(d.doj)}
              </div>
            )}
            {c.bgv_status && (
              <div className="text-ink-2">
                <span className="font-bold text-ink">BGV:</span> {c.bgv_status}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-[11px] font-extrabold uppercase tracking-wider text-ink-muted">History</div>
        {error ? (
          <p className="text-[12px] text-critical">{error}</p>
        ) : events === null ? (
          <p className="text-[12px] text-ink-muted">Loading…</p>
        ) : events.length === 0 ? (
          <p className="text-[12px] text-ink-muted">
            No changes recorded yet. Every Stage/Status change from now on is logged here.
          </p>
        ) : (
          <ol className="flex flex-col gap-1.5 max-h-64 overflow-y-auto pr-1">
            {events.map((e) => (
              <li key={e.id} className="flex gap-2 text-[12px]">
                <Icon
                  name={e.auto ? "zap" : "check"}
                  className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${e.auto ? "text-brand" : "text-ink-muted"}`}
                />
                <div className="min-w-0">
                  <div className="text-ink">
                    <span className="font-bold">{stageLabel(e.to_stage)}</span> · {statusLabel(e.to_status)}
                    {e.auto && <span className="text-ink-muted"> (auto-advanced)</span>}
                  </div>
                  {(e.reason || e.note) && (
                    <div className="text-ink-2">{[e.reason, e.note].filter(Boolean).join(" — ")}</div>
                  )}
                  <div className="text-[10.5px] text-ink-muted">
                    {formatDateTime(e.created_at)}
                    {e.actor_name ? ` · ${e.actor_name}` : ""}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
