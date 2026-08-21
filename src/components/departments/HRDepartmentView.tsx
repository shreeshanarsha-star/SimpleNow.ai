"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import { ALL_ITEMS, type Department, type Tool } from "@/lib/departments";

// Short, honest one-line descriptions for each real HR tool. Presentational
// copy only -- does not add, rename, or imply any capability the tool
// doesn't already have.
const TOOL_BLURBS: Record<string, string> = {
  "Job Postings.ai": "Create and optimize job descriptions and postings.",
  "Apply.ai": "Public application flow for every open role.",
  "Smart Source.ai": "Discover and identify relevant candidates.",
  "Smart Hunt.ai": "Proactively find passive candidates at scale.",
  "Smart Screen.ai": "Evaluate and shortlist candidates against a JD.",
  "Assessment.ai": "Assess skills, traits and role fit.",
  "Interview.ai": "Structure and evaluate interviews.",
  "Offer.ai": "Create, manage and send compensation offers.",
  "Onboard.ai": "Move selected candidates into onboarding.",
  "Induction.ai": "Guide new hires through their first weeks.",
  "Campus.ai": "Manage campus hiring and early-career pipelines.",
  "Refer.ai": "Employee referrals, made effortless.",
  "Performance.ai": "Continuous performance conversations and reviews.",
  "Learn.ai": "Personalized learning paths and skill-building.",
  "Rewards.ai": "Compensation, benefits and recognition.",
  "People Analytics.ai": "Workforce trends and people insights.",
  "HR Dashboard.ai": "A single view of HR health and activity.",
};

// The natural Talent Acquisition journey, built entirely from tools that
// already exist in departments.ts -- no renamed, invented, or reordered
// tools, just the real "Talent Acquisition" group organized by where each
// one sits in the hiring lifecycle.
const TA_STAGES: { label: string; icon: string; names: string[] }[] = [
  { label: "Define", icon: "fileText", names: ["Job Postings.ai"] },
  { label: "Source", icon: "search", names: ["Apply.ai", "Smart Source.ai", "Smart Hunt.ai"] },
  { label: "Screen", icon: "filter", names: ["Smart Screen.ai"] },
  { label: "Assess", icon: "check", names: ["Assessment.ai"] },
  { label: "Interview", icon: "calendar", names: ["Interview.ai"] },
  { label: "Offer", icon: "award", names: ["Offer.ai"] },
  { label: "Onboard", icon: "flag", names: ["Onboard.ai", "Induction.ai", "Campus.ai"] },
];

const EXAMPLE_PROMPTS: { label: string; href: string }[] = [
  { label: "Create a job posting", href: "/tools/job-postings-ai" },
  { label: "Screen resumes against a JD", href: "/tools/smart-screen-ai" },
  { label: "Draft a compensation offer", href: "/tools/offer-ai" },
];

export default function HRDepartmentView({ dept }: { dept: Department }) {
  const router = useRouter();
  const [q, setQ] = useState("");

  const liveCount = dept.tools.filter((t) => t.s === "live").length;
  const soonCount = dept.tools.filter((t) => t.s === "soon").length;

  const taTools = dept.tools.filter((t) => t.group === "Talent Acquisition");
  const otherGroups = groupBy(
    dept.tools.filter((t) => t.group && t.group !== "Talent Acquisition")
  );

  function runPrompt() {
    const query = q.trim().toLowerCase();
    if (!query) return;
    for (const d of ALL_ITEMS) {
      const tool = d.tools.find((t) => t.n.toLowerCase().includes(query));
      if (tool && tool.s === "live" && tool.href) {
        router.push(tool.href);
        return;
      }
    }
  }

  return (
    <AppShell title={dept.name}>
      <div className="flex flex-col gap-10 pb-10 max-w-[860px]">
        {/* Landing area */}
        <div className="flex flex-col gap-2 pt-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-brand-wash text-brand flex items-center justify-center flex-shrink-0">
              <Icon name={dept.icon} className="w-[18px] h-[18px]" />
            </div>
            <h2 className="m-0 text-[24px] font-semibold text-ink tracking-tight">
              {dept.name}
            </h2>
          </div>
          <p className="m-0 text-[13.5px] text-ink-2 max-w-lg leading-relaxed">
            {dept.desc}
          </p>
          <div className="text-[11.5px] text-ink-muted mt-0.5">
            {liveCount} systems live · {soonCount} in development
          </div>
        </div>

        {/* Contextual Askshree prompt */}
        <div>
          <div className="flex items-center gap-2.5 bg-surface border border-border rounded-2xl pl-4 pr-2.5 py-2.5 max-w-[600px] shadow-soft-sm focus-within:border-brand/40 transition-colors">
            <Icon name="sparkle" className="w-4 h-4 text-brand flex-shrink-0" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runPrompt()}
              placeholder="What do you want to accomplish?"
              className="border-none outline-none bg-transparent text-[13px] w-full py-0.5"
            />
            <button
              onClick={runPrompt}
              aria-label="Go"
              className="w-8 h-8 rounded-full bg-ink text-white border-none flex items-center justify-center flex-shrink-0 hover:bg-ink/85 transition-colors"
            >
              <Icon name="arrowUp" className="w-[13px] h-[13px]" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {EXAMPLE_PROMPTS.map((p) => (
              <Link
                key={p.label}
                href={p.href}
                className="text-[11.5px] text-ink-muted border border-border rounded-full px-2.5 py-1 hover:border-brand/40 hover:text-ink transition-colors"
              >
                {p.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Talent Acquisition workflow */}
        <section className="flex flex-col gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
              Talent Acquisition
            </div>
            <p className="m-0 mt-1 text-[12.5px] text-ink-2 max-w-md">
              Define, source, screen, assess and hire the right people faster.
            </p>
          </div>

          <div className="flex flex-wrap items-start gap-x-1 gap-y-5">
            {TA_STAGES.map((stage, i) => {
              const tools = stage.names
                .map((n) => taTools.find((t) => t.n === n))
                .filter((t): t is Tool => Boolean(t));
              if (!tools.length) return null;
              return (
                <div key={stage.label} className="flex items-start gap-1">
                  <div className="flex flex-col gap-2 w-[168px] flex-shrink-0">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                      <Icon name={stage.icon} className="w-[11px] h-[11px]" />
                      {stage.label}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {tools.map((tool) => (
                        <ToolTile key={tool.n} tool={tool} />
                      ))}
                    </div>
                  </div>
                  {i < TA_STAGES.length - 1 && (
                    <Icon
                      name="chevronLeft"
                      className="w-3.5 h-3.5 text-border-strong rotate-180 mt-2 flex-shrink-0"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Other HR capabilities */}
        {otherGroups.length > 0 && (
          <section className="flex flex-col">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-1">
              Other HR capabilities
            </div>
            {otherGroups.map((g) => (
              <div
                key={g.name}
                className="flex flex-col sm:flex-row sm:items-baseline gap-1.5 sm:gap-6 py-3.5 border-t border-border"
              >
                <div className="sm:w-[180px] flex-shrink-0 text-[12px] font-semibold text-ink-2">
                  {g.name}
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-2 flex-1">
                  {g.tools.map((t) => (
                    <div key={t.n} className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="w-[5px] h-[5px] rounded-full border border-ink-muted flex-shrink-0" />
                        <span className="text-[12.5px] font-medium text-ink-2">{t.n}</span>
                      </div>
                      {TOOL_BLURBS[t.n] && (
                        <span className="text-[11px] text-ink-muted pl-[11px]">
                          {TOOL_BLURBS[t.n]}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    </AppShell>
  );
}

function ToolTile({ tool }: { tool: Tool }) {
  const blurb = TOOL_BLURBS[tool.n];

  if (tool.s === "live" && tool.href) {
    return (
      <Link
        href={tool.href}
        className="group block border border-border rounded-md px-3 py-2.5 bg-surface hover:border-brand/40 hover:shadow-soft-sm transition-all duration-150"
      >
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-good mb-1">
          <span className="w-[5px] h-[5px] rounded-full bg-good" />
          Live
        </div>
        <div className="text-[13px] font-semibold text-ink leading-tight">{tool.n}</div>
        {blurb && <div className="text-[11px] text-ink-muted mt-0.5 leading-snug">{blurb}</div>}
        <div className="text-[11px] font-medium text-brand mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          Open →
        </div>
      </Link>
    );
  }

  return (
    <div className="px-3 py-2">
      <div className="text-[12.5px] font-medium text-ink-2 leading-tight">{tool.n}</div>
      <div className="flex items-center gap-1.5 text-[10.5px] text-ink-muted mt-1">
        <span className="w-1 h-1 rounded-full border border-ink-muted" />
        Coming soon
      </div>
    </div>
  );
}

function groupBy(tools: Tool[]): { name: string; tools: Tool[] }[] {
  const map = new Map<string, Tool[]>();
  for (const t of tools) {
    const key = t.group!;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  }
  return Array.from(map.entries()).map(([name, tools]) => ({ name, tools }));
}
