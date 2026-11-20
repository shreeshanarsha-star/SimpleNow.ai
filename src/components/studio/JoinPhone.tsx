"use client";
// Presenter Studio — the audience phone (/join/<code>). No login, no app.
import { useCallback, useEffect, useRef, useState } from "react";
import { deviceToken, jsonInit } from "@/lib/studio/client";

type View =
  | { kind: "waiting" | "follow" | "ended" | "qa" }
  | { kind: "poll" | "poll_result"; key: string; question: string; options: string[]; open: boolean; counts: number[] | null; answer: number | null; mine: number | null }
  | { kind: "quiz_q"; idx: number; n: number; q: string; options: string[]; endsAt: number; open: boolean; answer: number | null; mine: number | null }
  | { kind: "quiz_intro" | "quiz_end"; n: number; seconds: number }
  | { kind: "results" | "close"; winners: string[]; myScore: { rank: number; correct: number; of: number } | null; polls: Array<{ question: string; options: string[]; counts: number[]; answer: number | null }> };
type State = { title: string; presenter: string; qaOn: boolean; serverNow: number; me: { name: string } | null; view: View; questions: Array<{ id: number; text: string; status: string }> };

const opt = "w-full rounded-2xl border px-4 py-4 text-left text-base font-medium transition active:scale-[0.98]";

export default function JoinPhone({ code }: { code: string }) {
  const [st, setSt] = useState<State | null>(null);
  const [err, setErr] = useState("");
  const [name, setName] = useState("");
  const [team, setTeam] = useState("");
  const [ask, setAsk] = useState("");
  const [toast, setToast] = useState("");
  const [now, setNow] = useState(Date.now());
  const [picked, setPicked] = useState<Record<string, number>>({});
  const token = useRef("");
  const offset = useRef(0);

  const load = useCallback(async () => {
    const t0 = Date.now();
    try {
      const r = await fetch(`/api/studio/public/${encodeURIComponent(code)}?t=${encodeURIComponent(token.current)}`, { cache: "no-store" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Could not load");
      offset.current = data.serverNow - (t0 + Date.now()) / 2;
      setSt(data);
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Connection problem, retrying…");
    }
  }, [code]);

  useEffect(() => {
    token.current = deviceToken();
    load();
    const t = setInterval(load, 1500);
    const c = setInterval(() => setNow(Date.now() + offset.current), 250);
    return () => {
      clearInterval(t);
      clearInterval(c);
    };
  }, [load]);

  const post = async (body: Record<string, unknown>) => {
    const r = await fetch(`/api/studio/public/${encodeURIComponent(code)}`, jsonInit("POST", { ...body, t: token.current }));
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "Failed");
    return data;
  };
  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2500);
  };

  if (!st) return <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-6 text-center text-white/80">{err || "Loading…"}</div>;

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-neutral-950 p-5 pb-28 text-white">
      <div className="mb-5 flex items-center justify-between text-xs text-white/50">
        <span>{st.title}</span>
        {st.me && <span>{st.me.name}</span>}
      </div>
      {children}
      {toast && <div className="fixed bottom-24 left-1/2 -translate-x-1/2 rounded-full bg-white px-4 py-2 text-sm text-black">{toast}</div>}
      {err && <div className="fixed left-0 right-0 top-0 bg-amber-500 px-3 py-1 text-center text-xs text-black">{err}</div>}
    </div>
  );

  if (!st.me)
    return shell(
      <div className="space-y-4">
        <div className="text-2xl font-bold">Welcome 👋</div>
        <div className="text-white/70">Your phone is your remote for today&apos;s session.</div>
        <input className="w-full rounded-xl bg-white/10 px-4 py-4 text-lg outline-none" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        <input className="w-full rounded-xl bg-white/10 px-4 py-3 outline-none" placeholder="Team (optional)" value={team} onChange={(e) => setTeam(e.target.value)} maxLength={80} />
        <button
          className="w-full rounded-2xl bg-white py-4 text-lg font-semibold text-black disabled:opacity-40"
          disabled={!name.trim()}
          onClick={async () => {
            try {
              await post({ op: "join", name, team });
              load();
            } catch (e) {
              flash(e instanceof Error ? e.message : "Failed");
            }
          }}
        >
          Join
        </button>
      </div>
    );

  const v = st.view;
  let main: React.ReactNode = null;
  if (v.kind === "waiting") main = <Center big="You're in!" small={`${st.presenter} will start shortly. Keep this page open.`} />;
  else if (v.kind === "follow") main = <Center big="Follow along on the screen" small="Polls, quiz and questions will appear here." />;
  else if (v.kind === "ended") main = <Center big="Thank you!" small="The session has ended." />;
  else if (v.kind === "quiz_intro") main = <Center big="Quiz time" small={`${v.n} questions · ${v.seconds} seconds each. Accuracy first; speed breaks ties.`} />;
  else if (v.kind === "quiz_end") main = <Center big="Quiz done" small="Scores are locked. Winners at the end." />;
  else if (v.kind === "qa") main = <Center big="Ask anything" small="Type your question below." />;
  else if (v.kind === "poll" || v.kind === "poll_result") {
    const mine = v.mine ?? picked[`p:${v.key}`] ?? null;
    const total = (v.counts || []).reduce((a, b) => a + b, 0);
    main = (
      <div className="space-y-3">
        <div className="text-xs uppercase tracking-wide text-white/50">{v.kind === "poll" ? "Poll" : "Poll result"}</div>
        <div className="text-xl font-semibold">{v.question}</div>
        {v.options.map((o, i) => {
          const pct = total && v.counts ? Math.round((v.counts[i] / total) * 100) : 0;
          return (
            <button
              key={i}
              disabled={!v.open || mine !== null}
              className={`${opt} ${mine === i ? "border-white bg-white text-black" : "border-white/20"} ${v.kind === "poll_result" && v.answer === i ? "ring-2 ring-emerald-400" : ""}`}
              onClick={async () => {
                setPicked((x) => ({ ...x, [`p:${v.key}`]: i }));
                try {
                  await post({ op: "vote", key: v.key, choice: i });
                  flash("Vote counted ✓");
                } catch (e) {
                  flash(e instanceof Error ? e.message : "Failed");
                  setPicked((x) => {
                    const n = { ...x };
                    delete n[`p:${v.key}`];
                    return n;
                  });
                }
                load();
              }}
            >
              <div className="flex justify-between gap-2">
                <span>{o}</span>
                {v.kind === "poll_result" && <span>{pct}%</span>}
              </div>
            </button>
          );
        })}
        {v.kind === "poll" && mine !== null && <div className="text-center text-sm text-white/60">Thanks! Results come up on the screen.</div>}
        {v.kind === "poll_result" && <div className="text-center text-sm text-white/60">Poll closed · {total} votes</div>}
      </div>
    );
  } else if (v.kind === "quiz_q") {
    const mine = v.mine ?? picked[`q:${v.idx}`] ?? null;
    const left = Math.max(0, Math.ceil((v.endsAt - now) / 1000));
    const open = v.open && left > 0;
    main = (
      <div className="space-y-3">
        <div className="flex justify-between text-xs text-white/50">
          <span>
            Question {v.idx + 1} of {v.n}
          </span>
          <span className="tabular-nums">{open ? `${left} s` : "Time's up"}</span>
        </div>
        <div className="text-xl font-semibold">{v.q}</div>
        {v.options.map((o, i) => (
          <button
            key={i}
            disabled={!open || mine !== null}
            className={`${opt} ${mine === i ? "border-white bg-white text-black" : "border-white/20"} ${v.answer === i ? "ring-2 ring-emerald-400" : ""}`}
            onClick={async () => {
              setPicked((x) => ({ ...x, [`q:${v.idx}`]: i }));
              try {
                await post({ op: "quiz", idx: v.idx, choice: i });
              } catch (e) {
                flash(e instanceof Error ? e.message : "Failed");
              }
            }}
          >
            {String.fromCharCode(65 + i)}. {o}
          </button>
        ))}
        {v.answer !== null && mine !== null && <div className="text-center text-lg">{mine === v.answer ? "✅ Correct!" : "❌ Not this time"}</div>}
        {v.answer !== null && mine === null && <div className="text-center text-sm text-white/60">No answer sent for this one.</div>}
      </div>
    );
  } else if (v.kind === "results" || v.kind === "close") {
    main = (
      <div className="space-y-4">
        {v.winners.length > 0 && (
          <div>
            <div className="text-xl font-semibold">Quiz champions</div>
            {v.winners.map((w, i) => (
              <div key={i} className="mt-2 text-lg">
                {["🥇", "🥈", "🥉"][i]} {w}
              </div>
            ))}
          </div>
        )}
        {v.myScore && (
          <div className="rounded-2xl bg-white/10 p-4">
            <div className="text-sm text-white/60">Your quiz (only you see this)</div>
            <div className="text-2xl font-bold">
              {v.myScore.correct}/{v.myScore.of} · #{v.myScore.rank}
            </div>
          </div>
        )}
        {v.polls.map((p, i) => {
          const total = (p.counts || []).reduce((a, b) => a + b, 0);
          return (
            <div key={i} className="rounded-2xl border border-white/10 p-4 text-sm">
              <div className="font-medium">{p.question}</div>
              {p.options.map((o, k) => (
                <div key={k} className="mt-1 flex justify-between text-white/70">
                  <span>
                    {o} {p.answer === k && "✓"}
                  </span>
                  <span>{total ? Math.round(((p.counts?.[k] || 0) / total) * 100) : 0}%</span>
                </div>
              ))}
            </div>
          );
        })}
        {v.kind === "close" && <Center big="Thank you!" small="" />}
      </div>
    );
  }

  return shell(
    <>
      {main}
      {st.qaOn && v.kind !== "ended" && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-white/10 bg-neutral-950 p-3">
          <div className="flex gap-2">
            <input className="flex-1 rounded-xl bg-white/10 px-3 py-3 outline-none" placeholder="Ask a question…" value={ask} maxLength={400} onChange={(e) => setAsk(e.target.value)} />
            <button
              className="rounded-xl bg-white px-4 font-semibold text-black disabled:opacity-40"
              disabled={ask.trim().length < 3}
              onClick={async () => {
                try {
                  await post({ op: "ask", text: ask });
                  setAsk("");
                  flash("Question sent ✓");
                  load();
                } catch (e) {
                  flash(e instanceof Error ? e.message : "Failed");
                }
              }}
            >
              Send
            </button>
          </div>
          {st.questions.length > 0 && <div className="mt-1 text-center text-xs text-white/50">{st.questions.length} sent · {st.questions.filter((q) => q.status === "answered").length} answered</div>}
        </div>
      )}
    </>
  );
}

function Center({ big, small }: { big: string; small: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <div className="text-3xl font-bold">{big}</div>
      {small && <div className="mt-2 text-white/60">{small}</div>}
    </div>
  );
}
