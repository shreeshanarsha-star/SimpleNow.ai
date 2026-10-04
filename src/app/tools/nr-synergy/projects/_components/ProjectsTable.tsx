"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { projects as s } from "@/lib/nrs/i18n/en/projects";
import { postJson } from "../../time/_lib/client";
import { Pill, fill, fmtDate, fmtDateTime, inputClass } from "../../_home/ui";
import { STATUS_TONE, type ProjectStatus } from "../_lib";
import type { ProjectScope, TableRow, TableUpdate, WeekState } from "../_table";

const t = s.table;
const USER_STATUSES: ProjectStatus[] = ["in_progress", "on_hold", "completed"];

const DOT: Record<WeekState, string> = {
  approved: "bg-good border-good",
  pending: "bg-gradient-to-r from-warning from-50% to-transparent to-50% border-warning",
  returned: "bg-critical border-critical",
  missed: "bg-transparent border-critical/60",
  none: "bg-transparent border-border",
};

const REVIEW_TONE = { pending: "warning", approved: "good", rejected: "critical", sent_back: "critical" } as const;

function draftKey(id: string, week: string) {
  return `nrs.projdraft.${id}.${week}`;
}

function Weeks({ row }: { row: TableRow }) {
  return (
    <div className="flex items-center gap-1" aria-label={t.weeksLabel}>
      {row.weeks.map((w) => (
        <span
          key={w.week}
          title={`${fill(t.weekOf, { date: fmtDate(w.week) })}: ${t.weekState[w.state]}`}
          className={`inline-block w-3 h-3 rounded-full border-2 ${DOT[w.state]}`}
        />
      ))}
    </div>
  );
}

function Submitted({ u, tz }: { u: TableUpdate; tz: string }) {
  return (
    <div className="flex flex-col gap-1">
      <Pill tone={REVIEW_TONE[u.review_status]}>{s.timeline.review[u.review_status]}</Pill>
      <span className="text-[11px] text-ink-muted">{fill(t.submittedAt, { when: fmtDateTime(u.created_at, tz) })}</span>
    </div>
  );
}

function Cell({ text, muted }: { text: string | null | undefined; muted?: boolean }) {
  if (!text) return <span className="text-ink-muted">—</span>;
  return <p className={`whitespace-pre-line break-words line-clamp-4 ${muted ? "text-ink-muted italic" : "text-ink-2"}`}>{text}</p>;
}

function ApproveButtons({ row, onDone }: { row: TableRow; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [returning, setReturning] = useState(false);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!row.action) return null;
  const isProject = row.action.kind === "project";

  async function decide(decision: "approve" | "send_back" | "reject") {
    setError(null);
    if (decision !== "approve" && !comment.trim()) {
      setReturning(true);
      setError(t.commentRequired);
      return;
    }
    setBusy(true);
    const res = await postJson("/api/nr-synergy/approvals/decide", { stepId: row.action!.stepId, decision, comment: comment.trim() || null });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onDone();
  }

  return (
    <div className="flex flex-col gap-1.5 min-w-[150px]">
      <span className="text-[11px] font-bold text-ink-2 uppercase tracking-wide">{isProject ? t.needsProjectApproval : t.needsUpdateApproval}</span>
      {returning && (
        <textarea
          className={`${inputClass} text-[12px]`}
          rows={2}
          placeholder={t.commentPlaceholder}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          aria-label={t.commentPlaceholder}
        />
      )}
      <div className="flex flex-wrap gap-1.5">
        <button type="button" disabled={busy} onClick={() => void decide("approve")} className="rounded-full bg-good text-white px-3 py-1 text-[12px] font-bold disabled:opacity-50">
          {t.approve}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => (returning ? void decide("send_back") : setReturning(true))}
          className="rounded-full border border-border px-3 py-1 text-[12px] font-bold text-ink-2 hover:bg-page disabled:opacity-50"
        >
          {t.returnIt}
        </button>
        {isProject && returning && (
          <button type="button" disabled={busy} onClick={() => void decide("reject")} className="rounded-full px-3 py-1 text-[12px] font-bold text-critical hover:bg-critical-wash disabled:opacity-50">
            {t.reject}
          </button>
        )}
      </div>
      {error && <span role="alert" className="text-[11.5px] font-bold text-critical">{error}</span>}
    </div>
  );
}

function EntryRow({ row, tz, onDone }: { row: TableRow; tz: string; onDone: () => void }) {
  const week = row.weeks[row.weeks.length - 1]?.week ?? "";
  const key = draftKey(row.id, week);
  const [v, setV] = useState({ progress: "", challenges: "", plan_of_action: "", status: row.status === "pending" ? "in_progress" : row.status });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) setV((prev) => ({ ...prev, ...(JSON.parse(raw) as Partial<typeof prev>) }));
    } catch {
      // drafts are a convenience
    }
  }, [key]);
  const set = (k: keyof typeof v, val: string) =>
    setV((prev) => {
      const next = { ...prev, [k]: val };
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });

  async function submit() {
    setError(null);
    if (!v.progress.trim()) return setError(s.update.progressRequired);
    if (!window.confirm(t.confirmSubmit)) return;
    setBusy(true);
    const res = await postJson("/api/nr-synergy/projects/updates", {
      project_id: row.id,
      status: v.status,
      progress: v.progress,
      challenges: v.challenges,
      plan_of_action: v.plan_of_action,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
    onDone();
  }

  const box = (k: "progress" | "challenges" | "plan_of_action", label: string, last: string | null | undefined) => (
    <td className="px-3 py-2 align-top">
      <textarea
        className={`${inputClass} text-[12.5px] min-h-[84px]`}
        rows={3}
        maxLength={4000}
        aria-label={label}
        placeholder={label}
        value={v[k]}
        onChange={(e) => set(k, e.target.value)}
      />
      {last && <p className="mt-1 text-[11px] text-ink-muted line-clamp-2" title={last}>{fill(t.lastWeek, { text: last })}</p>}
    </td>
  );

  return (
    <>
      {box("progress", t.colUpdate, row.previous?.progress)}
      {box("challenges", t.colChallenges, row.previous?.challenges)}
      {box("plan_of_action", t.colPlan, row.previous?.plan_of_action)}
      <td className="px-3 py-2 align-top">
        <Weeks row={row} />
      </td>
      <td className="px-3 py-2 align-top">
        <div className="flex flex-col gap-1.5 min-w-[150px]">
          <label className="text-[11px] font-bold text-ink-2" htmlFor={`st-${row.id}`}>
            {t.statusThisWeek}
          </label>
          <select id={`st-${row.id}`} className={`${inputClass} text-[12.5px] py-1.5`} value={v.status} onChange={(e) => set("status", e.target.value)}>
            {USER_STATUSES.map((st) => (
              <option key={st} value={st}>
                {s.status[st]}
              </option>
            ))}
          </select>
          {v.status !== row.status && <span className="text-[11px] text-ink-muted">{t.statusAfterApproval}</span>}
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="rounded-full bg-gradient-to-r from-brand to-brand-dark text-white px-3 py-1.5 text-[12.5px] font-bold disabled:opacity-50"
          >
            {busy ? t.submitting : t.submit}
          </button>
          {error && <span role="alert" className="text-[11.5px] font-bold text-critical">{error}</span>}
          <span className="text-[10.5px] text-ink-muted">{fill(t.weekLabel, { date: fmtDate(week, tz) })}</span>
        </div>
      </td>
    </>
  );
}

export default function ProjectsTable({ rows, scope, tz }: { rows: TableRow[]; scope: ProjectScope; tz: string }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("");
  const refresh = () => router.refresh();

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!needle || r.name.toLowerCase().includes(needle) || (r.description ?? "").toLowerCase().includes(needle) || r.ownerName.toLowerCase().includes(needle)) &&
        (!statusF ||
          (statusF === "needs_me" ? !!r.action : statusF === "overdue" ? r.overdue : statusF === "awaiting" ? r.approvalStatus !== "approved" : r.status === statusF && r.approvalStatus === "approved"))
    );
  }, [rows, q, statusF]);

  const needsMe = rows.filter((r) => r.action).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" className={`${inputClass} max-w-[280px]`} placeholder={t.search} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t.search} />
        <select className={`${inputClass} max-w-[220px]`} value={statusF} onChange={(e) => setStatusF(e.target.value)} aria-label={t.filter}>
          <option value="">{t.allStatuses}</option>
          {scope !== "mine" && <option value="needs_me">{fill(t.needsMe, { count: needsMe })}</option>}
          <option value="awaiting">{t.awaiting}</option>
          {USER_STATUSES.map((st) => (
            <option key={st} value={st}>
              {s.status[st]}
            </option>
          ))}
          <option value="overdue">{s.overdue}</option>
        </select>
        <span className="text-[12px] text-ink-muted">{fill(t.count, { count: list.length })}</span>
        <span className="ml-auto flex items-center gap-3 text-[11px] text-ink-muted">
          {(["approved", "pending", "returned", "missed"] as WeekState[]).map((st) => (
            <span key={st} className="inline-flex items-center gap-1">
              <span className={`inline-block w-2.5 h-2.5 rounded-full border-2 ${DOT[st]}`} />
              {t.weekState[st]}
            </span>
          ))}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[1180px] text-[12.5px]">
          <thead className="bg-page text-left">
            <tr className="text-[11px] uppercase tracking-wide text-ink-muted">
              <th className="px-3 py-2.5 w-[200px]">{t.colProject}</th>
              <th className="px-3 py-2.5 w-[190px]">{t.colDescription}</th>
              <th className="px-3 py-2.5 w-[110px]">{t.colStatus}</th>
              <th className="px-3 py-2.5">{t.colUpdate}</th>
              <th className="px-3 py-2.5">{t.colChallenges}</th>
              <th className="px-3 py-2.5">{t.colPlan}</th>
              <th className="px-3 py-2.5 w-[120px]">{t.colWeeks}</th>
              <th className="px-3 py-2.5 w-[170px]">{t.colAction}</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-ink-muted">
                  {scope === "mine" ? t.emptyMine : scope === "team" ? t.emptyTeam : t.emptyAll}
                </td>
              </tr>
            )}
            {list.map((r) => {
              const latest = r.thisWeek ?? r.previous;
              const expanded = open === r.id;
              return (
                <Fragment key={r.id}>
                  <tr className={`border-t border-border align-top ${r.overdue ? "bg-warning-wash/40" : r.action ? "bg-brand-wash/30" : ""}`}>
                    <td className="px-3 py-2">
                      <Link href={`/tools/nr-synergy/projects/${r.id}`} className="font-bold text-ink hover:underline break-words">
                        {r.name}
                      </Link>
                      <p className="text-[11.5px] text-ink-muted">
                        {r.ownerName}
                        {r.division ? ` · ${r.division}` : ""}
                      </p>
                      {r.value && <p className="text-[11.5px] text-ink-2 tabular-nums">{r.value}</p>}
                      <button
                        type="button"
                        onClick={() => setOpen(expanded ? null : r.id)}
                        aria-expanded={expanded}
                        className="mt-1 text-[11.5px] font-bold text-brand hover:underline"
                      >
                        {expanded ? t.hideHistory : fill(t.showHistory, { count: r.history.length })}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <Cell text={r.description} />
                    </td>
                    <td className="px-3 py-2">
                      {r.approvalStatus === "approved" ? (
                        <Pill tone={STATUS_TONE[r.status]}>{s.status[r.status]}</Pill>
                      ) : (
                        <Pill tone={r.approvalStatus === "sent_back" ? "critical" : "warning"}>{t.approval[r.approvalStatus]}</Pill>
                      )}
                      {r.overdue && (
                        <span className="block mt-1">
                          <Pill tone="critical">{s.overdue}</Pill>
                        </span>
                      )}
                      {r.approvalStatus === "sent_back" && r.createdByMe && (
                        <Link href={`/tools/nr-synergy/projects/${r.id}/edit`} className="block mt-1 text-[11.5px] font-bold text-brand hover:underline">
                          {s.submissions.editResubmit} →
                        </Link>
                      )}
                    </td>

                    {r.canPost && !r.thisWeek && scope === "mine" ? (
                      <EntryRow row={r} tz={tz} onDone={refresh} />
                    ) : (
                      <>
                        <td className="px-3 py-2">
                          <Cell text={latest?.progress} muted={!r.thisWeek} />
                        </td>
                        <td className="px-3 py-2">
                          <Cell text={latest?.challenges} muted={!r.thisWeek} />
                        </td>
                        <td className="px-3 py-2">
                          <Cell text={latest?.plan_of_action} muted={!r.thisWeek} />
                        </td>
                        <td className="px-3 py-2">
                          <Weeks row={r} />
                        </td>
                        <td className="px-3 py-2">
                          {r.action ? (
                            <ApproveButtons row={r} onDone={refresh} />
                          ) : r.thisWeek ? (
                            <Submitted u={r.thisWeek} tz={tz} />
                          ) : r.approvalStatus !== "approved" ? (
                            <span className="text-[11.5px] text-ink-muted">{t.waitingProjectApproval}</span>
                          ) : (
                            <span className="text-[11.5px] text-ink-muted">{latest ? fill(t.lastSubmitted, { date: fmtDate(latest.created_at, tz) }) : t.noUpdates}</span>
                          )}
                          {r.thisWeek && r.thisWeek.status !== r.status && (
                            <p className="mt-1 text-[11px] text-ink-muted">{fill(t.requestedStatus, { status: s.status[r.thisWeek.status] })}</p>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                  {expanded && (
                    <tr className="bg-page/60">
                      <td colSpan={8} className="px-4 py-3">
                        {r.history.length === 0 ? (
                          <p className="text-ink-muted">{t.noUpdates}</p>
                        ) : (
                          <table className="w-full text-[12px]">
                            <thead>
                              <tr className="text-left text-[10.5px] uppercase tracking-wide text-ink-muted">
                                <th className="py-1 pr-3 w-[150px]">{t.colSubmitted}</th>
                                <th className="py-1 pr-3 w-[110px]">{t.colStatus}</th>
                                <th className="py-1 pr-3">{t.colUpdate}</th>
                                <th className="py-1 pr-3">{t.colChallenges}</th>
                                <th className="py-1 pr-3">{t.colPlan}</th>
                                <th className="py-1 w-[150px]">{t.colApproval}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.history.map((u) => (
                                <tr key={u.id} className="border-t border-border align-top">
                                  <td className="py-1.5 pr-3">
                                    <span className="font-bold text-ink">{fmtDateTime(u.created_at, tz)}</span>
                                    <span className="block text-[11px] text-ink-muted">{u.author}</span>
                                  </td>
                                  <td className="py-1.5 pr-3">{s.status[u.status]}</td>
                                  <td className="py-1.5 pr-3 whitespace-pre-line break-words">{u.progress}</td>
                                  <td className="py-1.5 pr-3 whitespace-pre-line break-words">{u.challenges ?? "—"}</td>
                                  <td className="py-1.5 pr-3 whitespace-pre-line break-words">{u.plan_of_action ?? "—"}</td>
                                  <td className="py-1.5">
                                    <Pill tone={REVIEW_TONE[u.review_status]}>{s.timeline.review[u.review_status]}</Pill>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
