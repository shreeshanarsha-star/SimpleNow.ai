"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { team as s, fillTeam as fill } from "@/lib/nrs/i18n/en/team";
import type { NrsDecision } from "@/lib/nrs/approvals";
import { postJson } from "../../time/_lib/client";
import type { QueueItem } from "../_lib/data";

function submittedOn(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
}

export default function ApprovalCard({ item }: { item: QueueItem }) {
  const router = useRouter();
  const ids = useId();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<NrsDecision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function act(decision: NrsDecision) {
    setError(null);
    if (decision !== "approve" && !comment.trim()) {
      setError(s.commentRequired);
      return;
    }
    setBusy(decision);
    const res = await postJson("/api/nr-synergy/approvals/decide", {
      stepId: item.stepId,
      decision,
      comment: comment.trim() || null,
    });
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDone(true);
    router.refresh();
  }

  const btn =
    "rounded-sm px-3.5 py-2 text-[12.5px] font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 disabled:opacity-60";

  return (
    <article className="rounded-md border border-border bg-surface p-4 flex flex-col gap-3" aria-labelledby={`${ids}-t`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-brand-dark">
            {s.kinds[item.kind]}
            {item.stepNo > 1 ? ` · ${fill(s.step, { n: item.stepNo })}` : ""}
          </p>
          <h3 id={`${ids}-t`} className="text-[14px] font-bold text-ink">
            {item.requesterName}
          </h3>
          <p className="text-[12px] text-ink-muted">
            {[item.requesterRole, item.requesterCountry, fill(s.submittedOn, { date: submittedOn(item.createdAt) })]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {(item.actingFor || item.asRole) && (
          <span className="rounded-full bg-page px-2 py-0.5 text-[11px] font-semibold text-ink-2">
            {item.actingFor ? fill(s.actingFor, { name: item.actingFor }) : fill(s.asRole, { role: s.roles[item.asRole!] })}
          </span>
        )}
      </div>

      <p className="text-[13px] text-ink-2">{item.title}</p>

      {item.details.length > 0 && (
        <dl className="grid grid-cols-[minmax(96px,auto)_1fr] gap-x-3 gap-y-1 rounded-sm bg-page px-3 py-2 text-[12.5px]">
          {item.details.map((d) => (
            <div key={d.label} className="contents">
              <dt className="text-ink-muted">{d.label}</dt>
              <dd className="text-ink whitespace-pre-line min-w-0 break-words">{d.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {done ? (
        <p className="text-[12.5px] font-semibold text-good-text" role="status">
          {s.decided}
        </p>
      ) : (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] font-semibold text-ink-muted">
              {s.commentLabel} <span className="font-normal">({s.commentHint})</span>
            </span>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              maxLength={2000}
              className="w-full rounded-sm border border-border bg-surface px-3 py-2 text-[13px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => act("approve")} disabled={busy !== null} className={`${btn} bg-brand text-white`}>
              {busy === "approve" ? s.deciding : s.approve}
            </button>
            <button
              type="button"
              onClick={() => act("send_back")}
              disabled={busy !== null}
              className={`${btn} border border-border bg-surface text-ink hover:bg-page`}
            >
              {busy === "send_back" ? s.deciding : s.sendBack}
            </button>
            <button
              type="button"
              onClick={() => act("reject")}
              disabled={busy !== null}
              className={`${btn} border border-critical/40 bg-surface text-critical hover:bg-critical-wash`}
            >
              {busy === "reject" ? s.deciding : s.reject}
            </button>
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="text-[12px] font-semibold text-critical">
          {error}
        </p>
      )}
    </article>
  );
}
