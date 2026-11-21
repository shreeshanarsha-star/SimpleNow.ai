"use client";
// Presenter Studio — the operator's remote (phone). Producer view: where we are,
// what's next, the next line, the audience, and the Q&A queue with approval.
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, jsonInit } from "@/lib/studio/client";
import { buildRunOfShow, stripCues } from "@/lib/studio/engine";
import type { Action, Live, Plan } from "@/lib/studio/types";

type Results = {
  people: Array<{ id: string; name: string }>;
  polls: Record<string, number[]>;
  ranking: Array<{ person: string; name: string; correct: number; ms: number; answered: number }>;
  quizCounts: Record<string, number>;
  questions: Array<{ id: number; text: string; name: string; status: string; draft: string }>;
};
type Data = { id: string; title: string; code: string; status: string; plan: Plan; live: Live; results: Results; serverNow: number };

const big = "rounded-2xl px-4 py-5 text-lg font-semibold active:scale-[0.98] disabled:opacity-40";

export default function ShowRemote({ id }: { id: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [typed, setTyped] = useState("");
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [drafting, setDrafting] = useState<number | null>(null);
  const [showSteps, setShowSteps] = useState(false);

  const load = useCallback(async () => {
    try {
      const x = await api<Data>(`/api/studio/live/${id}`);
      setD(x);
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Connection problem");
    }
  }, [id]);
  useEffect(() => {
    load();
    const t = setInterval(load, 1000);
    return () => clearInterval(t);
  }, [load]);

  const steps = useMemo(() => (d ? buildRunOfShow(d.plan) : []), [d?.plan]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (action: Action) => {
    if (!d) return;
    setBusy(true);
    setNote("");
    try {
      const res = await fetch(`/api/studio/live/${id}`, jsonInit("POST", { action, v: d.live.v }));
      if (res.status === 409) setNote("Someone else just moved the show. Updated; tap again if needed.");
      else if (!res.ok) setNote((await res.json().catch(() => ({}))).error || "Failed");
    } finally {
      setBusy(false);
      load();
    }
  };

  const draftAnswer = async (qid: number | null, question: string) => {
    if (!d) return;
    const key = qid ?? -1;
    setDrafting(key);
    try {
      const { text } = await api<{ text: string }>("/api/studio/ai", jsonInit("POST", { task: "answer", showId: id, question, questionId: qid || undefined }));
      setDrafts((x) => ({ ...x, [key]: text }));
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Draft failed");
    } finally {
      setDrafting(null);
    }
  };
  const qOp = async (qid: number, op: string) => {
    await api(`/api/studio/live/${id}`, jsonInit("POST", { question: { id: qid, op } }));
    load();
  };

  if (!d) return <div className="p-6 text-sm">{err || "Loading…"}</div>;
  const live = d.live;
  const cur = live.started ? steps[live.step] : null;
  const next = live.started ? steps[live.step + 1] : steps[0];
  const res = d.results;
  const pollCounts = cur?.pollKey ? res.polls[cur.pollKey] : null;
  const openQs = res.questions.filter((q) => q.status === "new" || q.status === "drafted");
  const doneQs = res.questions.filter((q) => q.status === "answered");

  return (
    <div className="mx-auto max-w-xl space-y-4 bg-page p-4 pb-24 text-ink">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-ink-muted">Remote · code {d.code}</div>
          <div className="font-semibold">{d.title}</div>
        </div>
        <div className="text-right text-xs">
          <div className={live.avatar === "ok" ? "text-good-text" : live.avatar === "voice" ? "text-critical" : "text-ink-muted"}>
            {live.avatar === "ok" ? "● Presenter on" : live.avatar === "voice" ? "● Backup voice" : live.avatar === "starting" ? "● Starting…" : "○ TV not started"}
          </div>
          <div className="text-ink-muted">{res.people.length} joined · {d.plan.mode === "assisted" ? "Assisted" : "Manual"}</div>
        </div>
      </div>
      {err && <div className="rounded-lg bg-critical-wash px-3 py-2 text-sm">{err}</div>}
      {live.avatar === "off" && <div className="rounded-lg bg-warning-wash px-3 py-2 text-sm">Open the TV screen and click “Click to start”.</div>}
      {note && <div className="rounded-lg bg-warning-wash px-3 py-2 text-sm">{note}</div>}

      {/* Now / next */}
      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="text-xs uppercase tracking-wide text-ink-muted">{live.ended ? "Finished" : live.started ? `Now · step ${live.step + 1} of ${steps.length}` : "Not started"}</div>
        <div className="text-xl font-semibold">{live.ended ? "The show has ended" : cur?.label || "Lobby (QR on screen)"}</div>
        {live.held && <div className="mt-1 inline-block rounded-full bg-warning px-2 py-0.5 text-xs font-semibold">ON HOLD</div>}
        {cur?.kind === "poll" && pollCounts && <div className="mt-2 text-sm">Votes so far: {pollCounts.reduce((a, b) => a + b, 0)} of {res.people.length}</div>}
        {cur?.kind === "quiz_q" && cur.quizIdx !== undefined && <div className="mt-2 text-sm">Answered: {res.quizCounts[String(cur.quizIdx)] || 0} of {res.people.length}</div>}
        {next && !live.ended && (
          <div className="mt-3 rounded-xl bg-page p-3 text-sm">
            <div className="text-xs text-ink-muted">Next: {next.label}</div>
            {next.say && <div className="mt-1 line-clamp-3 text-ink-2">“{stripCues(next.say)}”</div>}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="grid grid-cols-3 gap-2">
        <button className={`${big} border border-border bg-surface`} disabled={busy || !live.started} onClick={() => send({ type: "prev" })}>
          ⏮ Back
        </button>
        <button className={`${big} ${live.held ? "bg-good text-white" : "bg-warning"}`} disabled={busy || !live.started || live.ended} onClick={() => send({ type: live.held ? "resume" : "hold" })}>
          {live.held ? "▶ Resume" : "⏸ Hold"}
        </button>
        <button className={`${big} bg-brand text-white`} disabled={busy || live.ended} onClick={() => send({ type: live.started ? "next" : "start" })}>
          {live.started ? "Next ⏭" : "▶ Start"}
        </button>
      </div>
      <div className="text-center text-xs text-ink-muted">Next always moves exactly one step. Resume repeats the current line from the start.</div>

      {/* Q&A */}
      {d.plan.qa.enabled && (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="font-semibold">Questions ({openQs.length} waiting)</div>
            {cur?.kind !== "qa" && <span className="text-xs text-ink-muted">Answer any time; best during Q&A</span>}
          </div>
          <div className="space-y-3">
            {openQs.map((q) => {
              const draft = drafts[q.id] ?? q.draft;
              return (
                <div key={q.id} className="rounded-xl border border-border p-3">
                  <div className="text-sm">
                    <b>{q.name}:</b> {q.text}
                  </div>
                  {draft ? (
                    <>
                      <textarea className="mt-2 w-full rounded-lg border border-border bg-page p-2 text-sm" rows={4} value={draft} onChange={(e) => setDrafts((x) => ({ ...x, [q.id]: e.target.value }))} />
                      <div className="mt-2 flex gap-2">
                        <button
                          className="flex-1 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white"
                          onClick={async () => {
                            await send({ type: "say", text: draft });
                            qOp(q.id, "answered");
                          }}
                        >
                          🔊 Say it
                        </button>
                        <button className="rounded-lg border border-border px-3 py-2 text-sm" disabled={drafting === q.id} onClick={() => draftAnswer(q.id, q.text)}>
                          ↻
                        </button>
                        <button className="rounded-lg px-3 py-2 text-sm text-ink-muted" onClick={() => qOp(q.id, "dismiss")}>
                          Skip
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="mt-2 flex gap-2">
                      <button className="flex-1 rounded-lg border border-border px-3 py-2 text-sm" disabled={drafting === q.id} onClick={() => draftAnswer(q.id, q.text)}>
                        {drafting === q.id ? "Drafting…" : "✨ Draft answer"}
                      </button>
                      <button className="rounded-lg px-3 py-2 text-sm text-ink-muted" onClick={() => qOp(q.id, "dismiss")}>
                        Skip
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {!openQs.length && <div className="text-sm text-ink-muted">No questions waiting.</div>}
          </div>

          <div className="mt-4 border-t border-border pt-3">
            <div className="mb-1 text-xs text-ink-muted">A question from the room (type it):</div>
            <div className="flex gap-2">
              <input className="flex-1 rounded-lg border border-border bg-page px-3 py-2 text-sm" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="e.g. How do we start safely?" />
              <button className="rounded-lg border border-border px-3 py-2 text-sm" disabled={!typed.trim() || drafting === -1} onClick={() => draftAnswer(null, typed)}>
                {drafting === -1 ? "…" : "Draft"}
              </button>
            </div>
            {drafts[-1] && (
              <div className="mt-2">
                <textarea className="w-full rounded-lg border border-border bg-page p-2 text-sm" rows={4} value={drafts[-1]} onChange={(e) => setDrafts((x) => ({ ...x, [-1]: e.target.value }))} />
                <button
                  className="mt-1 w-full rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white"
                  onClick={async () => {
                    await send({ type: "say", text: drafts[-1] });
                    setDrafts((x) => {
                      const n = { ...x };
                      delete n[-1];
                      return n;
                    });
                    setTyped("");
                  }}
                >
                  🔊 Say it
                </button>
              </div>
            )}
          </div>
          {doneQs.length > 0 && <div className="mt-3 text-xs text-ink-muted">{doneQs.length} answered</div>}
        </div>
      )}

      {/* Say anything */}
      <SayBox onSay={(t) => send({ type: "say", text: t })} />

      {/* Jump */}
      <div className="rounded-2xl border border-border bg-surface p-4">
        <button className="w-full text-left font-semibold" onClick={() => setShowSteps((x) => !x)}>
          {showSteps ? "▾" : "▸"} Jump to a step
        </button>
        {showSteps && (
          <div className="mt-2 max-h-80 space-y-1 overflow-auto">
            {steps.map((s, i) => (
              <button key={i} className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${live.started && i === live.step ? "bg-brand text-white" : "hover:bg-page"}`} onClick={() => confirm(`Jump to "${s.label}"?`) && send({ type: "goto", step: i })}>
                {i + 1}. {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Results */}
      {(res.ranking.length > 0 || Object.values(res.polls).some((c) => c.some(Boolean))) && (
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
          <div className="mb-2 font-semibold">Live results</div>
          {res.ranking.slice(0, 10).map((r, i) => (
            <div key={r.person} className="flex justify-between">
              <span>
                {i + 1}. {r.name}
              </span>
              <span className="tabular-nums text-ink-muted">
                {r.correct}/{d.plan.quiz.items.length} · {(r.ms / 1000).toFixed(1)} s
              </span>
            </div>
          ))}
          {d.plan.polls.items.map((p) => (
            <div key={p.key} className="mt-2">
              <div className="text-ink-muted">{p.question}</div>
              <div>{p.options.map((o, i) => `${o}: ${res.polls[p.key]?.[i] || 0}`).join(" · ")}</div>
            </div>
          ))}
        </div>
      )}
      <div className="text-center text-xs text-ink-muted">
        <a className="underline" href={`/tools/presenter/studio/${id}`}>
          Edit this presentation
        </a>
      </div>
    </div>
  );
}

function SayBox({ onSay }: { onSay: (t: string) => void }) {
  const [t, setT] = useState("");
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-1 text-sm font-semibold">Make the presenter say…</div>
      <div className="flex gap-2">
        <input className="flex-1 rounded-lg border border-border bg-page px-3 py-2 text-sm" value={t} onChange={(e) => setT(e.target.value)} placeholder="Exact words, spoken right away" />
        <button
          className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
          disabled={!t.trim()}
          onClick={() => {
            onSay(t.trim());
            setT("");
          }}
        >
          🔊
        </button>
      </div>
    </div>
  );
}
