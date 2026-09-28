"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import {
  STAGES,
  agingLevel,
  daysSince,
  exitKind,
  statusLabel,
  type StageKey,
  type StatusKey,
} from "@/lib/smartSourcePipeline";
import { AGING_CLASS, stageBandStyle, statusToneClass, type PipelineFields } from "./pipelineUi";

type Card = PipelineFields & {
  id: string;
  name: string | null;
  designation: string | null;
  company: string | null;
  match_score: number | null;
};

// Board view: one column per stage. Dropping a card on a column moves the
// candidate into that stage at its default status (same path as the list
// view's Stage dropdown). Exited candidates sit in a read-only "Other"
// column; change them from the list view.
export default function PipelineKanban<T extends Card>({
  candidates,
  enabledStages,
  scoreClass,
  onStageChange,
}: {
  candidates: T[];
  enabledStages: StageKey[];
  scoreClass: (score: number | null) => string;
  onStageChange: (candidateId: string, stage: StageKey) => void;
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const active = candidates.filter((c) => !exitKind(c.pipeline_status));
  const exited = candidates.filter((c) => exitKind(c.pipeline_status));
  const columns = STAGES.filter(
    (s) => enabledStages.includes(s.key) || active.some((c) => c.pipeline_stage === s.key)
  );

  function renderCard(c: T, draggable: boolean) {
    const stage = (c.pipeline_stage || "sourcing") as StageKey;
    const status = (c.pipeline_status || "yet_to_contact") as StatusKey;
    const days = daysSince(c.stage_changed_at);
    const aging = agingLevel(stage, status, days);
    return (
      <div
        key={c.id}
        draggable={draggable}
        onDragStart={(e) => {
          setDraggedId(c.id);
          e.dataTransfer.setData("text/plain", c.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => {
          setDraggedId(null);
          setOver(null);
        }}
        className={`bg-surface border border-border rounded-md p-2 shadow-soft-sm transition-opacity ${
          draggable ? "cursor-grab active:cursor-grabbing" : ""
        } ${draggedId === c.id ? "opacity-40" : "opacity-100"}`}
      >
        <div className="flex items-start justify-between gap-1.5">
          <span className="font-bold text-ink text-[12px] truncate">{c.name || "Unnamed Candidate"}</span>
          <span className={`shrink-0 text-[10px] font-bold px-1.5 rounded-full ${scoreClass(c.match_score)}`}>
            {c.match_score ?? "—"}
          </span>
        </div>
        <div className="text-[11px] text-ink-2 truncate">{c.designation || "—"}</div>
        {c.company && <div className="text-[10.5px] text-ink-muted truncate">at {c.company}</div>}
        <div className="flex items-center justify-between gap-1.5 mt-1.5">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border truncate ${statusToneClass(status)}`}>
            {draggable ? statusLabel(status) : `${STAGES.find((s) => s.key === stage)?.short} · ${statusLabel(status)}`}
          </span>
          {draggable && status !== "joined" && stage !== "joining" && (
            <span className={`shrink-0 inline-flex items-center gap-0.5 text-[10px] ${AGING_CLASS[aging]}`}>
              <Icon name="clock" className="w-2.5 h-2.5" />
              {days}d
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-3 min-w-max">
        {columns.map((s, i) => {
          const list = active.filter((c) => (c.pipeline_stage || "sourcing") === s.key);
          const isOver = over === s.key;
          const droppable = enabledStages.includes(s.key);
          return (
            <div
              key={s.key}
              onDragOver={(e) => {
                if (!droppable) return;
                e.preventDefault();
                if (over !== s.key) setOver(s.key);
              }}
              onDragLeave={() => setOver((p) => (p === s.key ? null : p))}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain") || draggedId;
                setOver(null);
                setDraggedId(null);
                if (!id || !droppable) return;
                const card = candidates.find((c) => c.id === id);
                if (card && card.pipeline_stage !== s.key) onStageChange(id, s.key);
              }}
              className={`w-60 shrink-0 flex flex-col rounded-md border transition-colors ${
                isOver ? "border-brand bg-brand-wash/40" : "border-border bg-page/40"
              }`}
            >
              <div
                style={stageBandStyle(i)}
                className="px-2.5 py-2 rounded-t-md flex items-center justify-between gap-2"
              >
                <span className="text-[11.5px] font-bold truncate">{s.label}</span>
                <span className="text-[10.5px] font-bold px-1.5 rounded-full bg-white/40 dark:bg-black/20 shrink-0">
                  {list.length}
                </span>
              </div>
              <div className="flex flex-col gap-2 p-2 min-h-[70px] max-h-[65vh] overflow-y-auto">
                {list.length === 0 ? (
                  <div className="text-[11px] text-ink-muted italic text-center py-3">No candidates</div>
                ) : (
                  list.map((c) => renderCard(c, true))
                )}
              </div>
            </div>
          );
        })}

        {exited.length > 0 && (
          <div className="w-60 shrink-0 flex flex-col rounded-md border border-dashed border-border bg-page/20">
            <div className="px-2.5 py-2 border-b border-border rounded-t-md flex items-center justify-between gap-2 text-ink-2">
              <span className="text-[11.5px] font-bold">Other (hold / rejected / withdrawn)</span>
              <span className="text-[10.5px] font-bold">{exited.length}</span>
            </div>
            <div className="flex flex-col gap-2 p-2 max-h-[65vh] overflow-y-auto">
              {exited.map((c) => renderCard(c, false))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
