"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import {
  STAGES,
  STAGE_STATUSES,
  agingLevel,
  daysSince,
  exitKind,
  isHoldDue,
  statusLabel,
  type StageKey,
  type StatusKey,
} from "@/lib/smartSourcePipeline";
import { EXIT_CHIPS, stageBandStyle, type PipelineFields } from "./pipelineUi";

// Filter keys shared with the candidate list:
//   "All" | "stage:<key>" | "exit:hold|rejected|withdrawn" | "holds_due" | "aging"
export type PipelineFilter = string;

export function matchesPipelineFilter(c: PipelineFields, filter: PipelineFilter): boolean {
  if (filter === "All") return true;
  const stage = (c.pipeline_stage || "sourcing") as StageKey;
  const status = (c.pipeline_status || "yet_to_contact") as StatusKey;
  const exit = exitKind(status);
  if (filter.startsWith("stage:")) return !exit && stage === filter.slice(6);
  if (filter.startsWith("exit:")) return exit === filter.slice(5);
  if (filter === "holds_due") return isHoldDue(status, c.hold_until);
  if (filter === "aging") return agingLevel(stage, status, daysSince(c.stage_changed_at)) !== "ok";
  return true;
}

function chevronClip(index: number, total: number): string {
  const n = "12px";
  if (total === 1) return "none";
  if (index === 0) return `polygon(0 0, calc(100% - ${n}) 0, 100% 50%, calc(100% - ${n}) 100%, 0 100%)`;
  if (index === total - 1) return `polygon(0 0, 100% 0, 100% 100%, 0 100%, ${n} 50%)`;
  return `polygon(0 0, calc(100% - ${n}) 0, 100% 50%, calc(100% - ${n}) 100%, 0 100%, ${n} 50%)`;
}

// Stage funnel (active candidates only) + "Other" outcomes + attention chips.
// Hovering a stage shows its status breakdown.
export default function PipelineFunnel({
  candidates,
  enabledStages,
  filter,
  onFilter,
}: {
  candidates: PipelineFields[];
  enabledStages: StageKey[];
  filter: PipelineFilter;
  onFilter: (f: PipelineFilter) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [edge, setEdge] = useState({ atStart: true, atEnd: true });

  const counts = useMemo(() => {
    const byStage: Record<string, Record<string, number>> = {};
    const stageTotal: Record<string, number> = {};
    const exits: Record<string, number> = { hold: 0, rejected: 0, withdrawn: 0 };
    let holdsDue = 0;
    let aging = 0;
    for (const c of candidates) {
      const stage = (c.pipeline_stage || "sourcing") as StageKey;
      const status = (c.pipeline_status || "yet_to_contact") as StatusKey;
      const exit = exitKind(status);
      if (exit) {
        exits[exit] = (exits[exit] || 0) + 1;
        if (isHoldDue(status, c.hold_until)) holdsDue++;
        continue;
      }
      stageTotal[stage] = (stageTotal[stage] || 0) + 1;
      byStage[stage] = byStage[stage] || {};
      byStage[stage][status] = (byStage[stage][status] || 0) + 1;
      if (agingLevel(stage, status, daysSince(c.stage_changed_at)) !== "ok") aging++;
    }
    return { byStage, stageTotal, exits, holdsDue, aging };
  }, [candidates]);

  // Show enabled stages, plus any disabled stage that still holds candidates.
  const bands = STAGES.filter((s) => enabledStages.includes(s.key) || (counts.stageTotal[s.key] || 0) > 0);

  const updateEdge = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setEdge({ atStart: el.scrollLeft <= 4, atEnd: el.scrollLeft >= el.scrollWidth - el.clientWidth - 4 });
  }, []);

  useEffect(() => {
    updateEdge();
    window.addEventListener("resize", updateEdge);
    return () => window.removeEventListener("resize", updateEdge);
  }, [updateEdge, bands.length]);

  function breakdown(stage: StageKey): string {
    const m = counts.byStage[stage] || {};
    const lines = STAGE_STATUSES[stage].filter((s) => m[s]).map((s) => `${statusLabel(s)}: ${m[s]}`);
    return lines.length ? lines.join("\n") : "No active candidates";
  }

  const toggle = (key: PipelineFilter) => onFilter(filter === key ? "All" : key);
  const scrollBtn =
    "absolute top-1/2 -translate-y-1/2 z-20 w-6 h-6 rounded-full border border-border bg-surface text-ink-2 shadow-soft-sm flex items-center justify-center transition-opacity";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => scrollRef.current?.scrollBy({ left: -220, behavior: "smooth" })}
        aria-label="Scroll stages left"
        className={`${scrollBtn} left-0 ${edge.atStart ? "opacity-0 pointer-events-none" : "opacity-100 hover:text-ink"}`}
      >
        <Icon name="chevronLeft" className="w-3 h-3" />
      </button>

      <div ref={scrollRef} onScroll={updateEdge} className="no-scrollbar flex items-stretch overflow-x-auto px-6">
        <button
          type="button"
          onClick={() => onFilter("All")}
          className={`shrink-0 flex flex-col items-center justify-center gap-0.5 px-4 py-1.5 mr-2.5 rounded-md border text-[11px] font-bold transition-all ${
            filter === "All" ? "bg-brand text-white border-brand shadow-soft-sm" : "bg-page text-ink-2 border-border hover:border-brand/40"
          }`}
        >
          <span className="text-[13.5px] font-extrabold leading-none">{candidates.length}</span>
          <span>All</span>
        </button>

        {bands.map((s, i) => {
          const key = `stage:${s.key}`;
          const count = counts.stageTotal[s.key] || 0;
          const selected = filter === key;
          const style = stageBandStyle(i);
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => toggle(key)}
              title={`${s.label} — ${count} active\n${breakdown(s.key)}`}
              style={{
                ...style,
                clipPath: chevronClip(i, bands.length),
                marginLeft: i === 0 ? 0 : "-11px",
                zIndex: bands.length - i,
                outline: selected ? "2px solid white" : undefined,
                outlineOffset: selected ? "-3px" : undefined,
              }}
              className={`shrink-0 flex flex-col items-center justify-center gap-0.5 min-w-[88px] px-4 py-1.5 transition-[filter] hover:brightness-110 ${
                count === 0 && !selected ? "opacity-70" : ""
              } ${!enabledStages.includes(s.key) ? "italic" : ""}`}
            >
              <span className="text-[11px] font-extrabold leading-none whitespace-nowrap">{s.label}</span>
              <span className="text-[13px] font-extrabold leading-none">{count}</span>
            </button>
          );
        })}

        <div className="shrink-0 w-px bg-border mx-3 my-1" />
        <span className="shrink-0 self-center text-[9.5px] font-extrabold uppercase tracking-wider text-ink-muted mr-2">
          Other
        </span>
        {EXIT_CHIPS.map((x) => {
          const key = `exit:${x.key}`;
          const count = counts.exits[x.key] || 0;
          const selected = filter === key;
          return (
            <button
              key={x.key}
              type="button"
              onClick={() => toggle(key)}
              className={`shrink-0 self-center inline-flex items-center gap-1.5 px-2.5 py-1 mr-1.5 rounded-full border text-[11px] font-bold transition-all ${
                selected
                  ? `bg-page border-current shadow-soft-sm ${x.text}`
                  : `bg-page/60 border-transparent hover:border-border ${count > 0 ? x.text : "text-ink-muted"}`
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${x.dot}`} />
              <span>{x.label}</span>
              <span className="font-extrabold">{count}</span>
            </button>
          );
        })}

        {(counts.holdsDue > 0 || counts.aging > 0 || filter === "holds_due" || filter === "aging") && (
          <>
            <div className="shrink-0 w-px bg-border mx-3 my-1" />
            <span className="shrink-0 self-center text-[9.5px] font-extrabold uppercase tracking-wider text-ink-muted mr-2">
              Attention
            </span>
            {(counts.holdsDue > 0 || filter === "holds_due") && (
              <button
                type="button"
                onClick={() => toggle("holds_due")}
                title="Candidates on hold whose review date has arrived"
                className={`shrink-0 self-center inline-flex items-center gap-1.5 px-2.5 py-1 mr-1.5 rounded-full border text-[11px] font-bold text-rose-600 dark:text-rose-400 ${
                  filter === "holds_due" ? "bg-page border-current shadow-soft-sm" : "bg-page/60 border-transparent hover:border-border"
                }`}
              >
                <Icon name="bell" className="w-3 h-3" />
                <span>Holds due</span>
                <span className="font-extrabold">{counts.holdsDue}</span>
              </button>
            )}
            {(counts.aging > 0 || filter === "aging") && (
              <button
                type="button"
                onClick={() => toggle("aging")}
                title="Active candidates sitting in their stage longer than expected"
                className={`shrink-0 self-center inline-flex items-center gap-1.5 px-2.5 py-1 mr-1.5 rounded-full border text-[11px] font-bold text-amber-600 dark:text-amber-400 ${
                  filter === "aging" ? "bg-page border-current shadow-soft-sm" : "bg-page/60 border-transparent hover:border-border"
                }`}
              >
                <Icon name="clock" className="w-3 h-3" />
                <span>Stuck</span>
                <span className="font-extrabold">{counts.aging}</span>
              </button>
            )}
          </>
        )}
      </div>

      <button
        type="button"
        onClick={() => scrollRef.current?.scrollBy({ left: 220, behavior: "smooth" })}
        aria-label="Scroll stages right"
        className={`${scrollBtn} right-0 ${edge.atEnd ? "opacity-0 pointer-events-none" : "opacity-100 hover:text-ink"}`}
      >
        <Icon name="chevronRight" className="w-3 h-3" />
      </button>
    </div>
  );
}
