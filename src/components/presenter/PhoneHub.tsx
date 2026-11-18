"use client";
// Presenter.ai — the audience's phone (/p/<code>). No login: a random device
// token kept on the phone identifies the person for this session.
import { useCallback, useEffect, useRef, useState } from "react";
import Passport from "@/components/presenter/Passport";
import { ASSESSMENT, PHONE_TAKEAWAYS, QUIZ, SHARED_DOCS, pollByKey, quizClock, type HubPhase, type QuizState } from "@/lib/presenter/content";

type HubView = { phase: HubPhase; quiz: QuizState | null; poll: string | null; pollReveal: number | null; finaleStep: number; flyerUrl: string | null; sharedDocs?: string[] };
type Me = { name: string; quiz: string[]; assess: Record<string, number>; polls: Record<string, number>; commit: string | null };
type State = {
  session: { title: string; code: string };
  hub: HubView;
  me: Me | null;
  badge: { level: string | null; quiz: number; quizOf: number } | null;
  myQuestions: Array<{ id: string; text: string; answer: string | null }>;
  deckUrl?: string | null;
  serverNow: number;
};

const TOKEN_KEY = "presenter-device-token";
function deviceToken() {
  let t = "";
  try {
    t = localStorage.getItem(TOKEN_KEY) || "";
  } catch {}
  if (!t) {
    t = (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(/[^a-zA-Z0-9-]/g, "") + Math.random().toString(36).slice(2, 8);
    try {
      localStorage.setItem(TOKEN_KEY, t);
    } catch {}
  }
  return t;
}

const btn = "w-full rounded-2xl px-4 py-4 text-left text-base font-medium transition active:scale-[0.98]";

export default function PhoneHub({ code }: { code: string }) {
  const [st, setSt] = useState<State | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"now" | "ask">("now");
  const [now, setNow] = useState(Date.now());
  const token = useRef("");
  const offset = useRef(0);
  const pending = useRef<Record<string, number>>({}); // optimistic answers

  const load = useCallback(async () => {
    const t0 = Date.now();
    try {
      const res = await fetch(`/api/presenter/hub?code=${encodeURIComponent(code)}&t=${encodeURIComponent(token.current)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load");
      const t1 = Date.now();
      offset.current = data.serverNow - (t0 + t1) / 2;
      setSt(data);
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Connection problem, retrying…");
    }
  }, [code]);

  const post = useCallback(
    async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/presenter/hub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, t: token.current, ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      return data;
    },
    [code]
  );

  useEffect(() => {
    token.current = deviceToken();
    load();
  }, [load]);

  // Poll faster during the quiz.
  const phase = st?.hub.phase;
  useEffect(() => {
    const iv = setInterval(load, phase === "quiz" ? 1500 : 2500);
    return () => clearInterval(iv);
  }, [load, phase]);

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(iv);
  }, []);

  if (!st) {
    return (
      <Shell>
        <div className="py-20 text-center text-white/60">{err || "Joining…"}</div>
      </Shell>
    );
  }

  if (!st.me) return <Join title={st.session.title} onJoin={async (b) => { await post({ action: "join", ...b }); await load(); }} />;

  const serverNow = now + offset.current;

  return (
    <Shell>
      <div className="flex items-center justify-between pb-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-orange-400">{st.session.title}</div>
          <div className="text-sm text-white/60">Hi {st.me.name}</div>
        </div>
        <div className="flex rounded-full bg-white/10 p-1 text-sm">
          <button onClick={() => setTab("now")} className={`rounded-full px-4 py-1.5 ${tab === "now" ? "bg-orange-600" : ""}`}>Live</button>
          <button onClick={() => setTab("ask")} className={`rounded-full px-4 py-1.5 ${tab === "ask" ? "bg-orange-600" : ""}`}>Ask</button>
        </div>
      </div>
      {err && <div className="mb-3 rounded-xl bg-yellow-500/20 px-3 py-2 text-xs text-yellow-200">{err}</div>}

      {(st.hub.sharedDocs || []).map((k) => {
        const d = SHARED_DOCS.find((x) => x.key === k);
        return d ? (
          <a key={k} href={d.url} target="_blank" rel="noreferrer" className="mb-3 block rounded-2xl bg-sky-900/60 p-3 ring-1 ring-sky-500/40">
            <div className="text-sm font-semibold">📄 {d.title}</div>
            <div className="mt-0.5 text-xs text-white/60">{d.sub}</div>
            <div className="mt-2 text-xs font-semibold text-sky-300 underline">Open / download the PDF</div>
          </a>
        ) : null;
      })}
      {tab === "ask" ? (
        <Ask st={st} post={post} reload={load} />
      ) : (
        <Now st={st} serverNow={serverNow} post={post} reload={load} pending={pending.current} goAsk={() => setTab("ask")} />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[100dvh] bg-neutral-950 px-4 pb-10 pt-4 text-white"><div className="mx-auto max-w-md">{children}</div></div>;
}

/* ------------------------------ Join ------------------------------ */
function Join({ title, onJoin }: { title: string; onJoin: (b: { name: string; intro: string; remember: boolean }) => Promise<void> }) {
  const [name, setName] = useState("");
  const [intro, setIntro] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <Shell>
      <div className="pt-6 text-xs uppercase tracking-wider text-orange-400">{title}</div>
      <h1 className="mt-1 text-3xl font-bold">Welcome. You&apos;re part of the show.</h1>
      <p className="mt-2 text-white/60">Quiz, polls and questions all happen here.</p>
      <form
        className="mt-6 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr("");
          try {
            await onJoin({ name, intro, remember });
          } catch (x) {
            setErr(x instanceof Error ? x.message : "Could not join");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="block">
          <span className="text-sm text-white/70">Your name (as the team knows you)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="given-name" className="mt-1 w-full rounded-xl bg-white/10 px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-orange-500" placeholder="e.g. Priya" />
        </label>
        <label className="block">
          <span className="text-sm text-white/70">Your team and designation (optional)</span>
          <input value={intro} onChange={(e) => setIntro(e.target.value)} maxLength={160} className="mt-1 w-full rounded-xl bg-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500" placeholder="e.g. Talent Acquisition, Manager" />
        </label>
        <div className="rounded-xl bg-white/5 p-3 text-xs leading-relaxed text-white/60">
          We&apos;ll remember your name and your intro for future sessions. Quiz and assessment scores are never shown to anyone else; only the top 3 quiz names appear on screen.
          <label className="mt-2 flex items-center gap-2 text-white/80">
            <input type="checkbox" checked={!remember} onChange={(e) => setRemember(!e.target.checked)} className="h-4 w-4" /> Don&apos;t remember me after today
          </label>
        </div>
        {err && <div className="text-sm text-red-400">{err}</div>}
        <button disabled={busy || name.trim().length < 2} className="w-full rounded-2xl bg-orange-600 py-4 text-lg font-semibold disabled:opacity-40">
          {busy ? "Joining…" : "Join"}
        </button>
      </form>
    </Shell>
  );
}

/* ------------------------------ Live ------------------------------ */
type PostFn = (p: Record<string, unknown>) => Promise<any>;

function Now({ st, serverNow, post, reload, pending, goAsk }: { st: State; serverNow: number; post: PostFn; reload: () => void; pending: Record<string, number>; goAsk: () => void }) {
  const { hub, me } = st;
  if (!me) return null;

  if (hub.phase === "quiz") return <Quiz hub={hub} me={me} serverNow={serverNow} post={post} pending={pending} />;
  if (hub.phase === "assessment") return <Assessment me={me} post={post} reload={reload} />;
  if (hub.phase === "poll") return <PollCard key={hub.poll || ""} pollKey={hub.poll} reveal={hub.pollReveal} me={me} post={post} reload={reload} />;
  if (hub.phase === "wishwall")
    return (
      <Card title="The HR Wish Wall">
        <p className="text-white/60">Your &quot;task I&apos;d never do again&quot; is on the TV wall (no names). Look up: Shree is grouping them.</p>
      </Card>
    );
  if (hub.phase === "commit") return <Commit me={me} post={post} reload={reload} />;
  if (hub.phase === "build")
    return (
      <Card title="Shree is building an app">
        <p className="text-white/60">From your ideas, live. Nobody is writing code. It lands on this phone when it&apos;s ready.</p>
      </Card>
    );
  if (hub.phase === "flyer")
    return (
      <Card title="Your app is ready">
        {hub.flyerUrl ? (
          <a href={hub.flyerUrl} target="_blank" rel="noreferrer" className="block rounded-2xl bg-orange-600 py-4 text-center text-lg font-semibold">Open the flyer app</a>
        ) : (
          <p className="text-white/60">It&apos;s still building. The link appears here the moment it&apos;s ready.</p>
        )}
      </Card>
    );
  if (hub.phase === "questions")
    return (
      <Card title="Ask anything">
        <p className="text-white/60">No question is too basic. Ask here and get an instant answer; the best ones go to Shree and Shreesha.</p>
        <button onClick={goAsk} className="mt-4 w-full rounded-2xl bg-orange-600 py-4 text-lg font-semibold">Ask a question</button>
        {hub.flyerUrl && (
          <a href={hub.flyerUrl} target="_blank" rel="noreferrer" className="mt-3 block text-center text-sm text-orange-300 underline">
            Open today&apos;s flyer app
          </a>
        )}
      </Card>
    );
  if ((hub.phase === "finale" || hub.phase === "closed") && st.badge) return <Badge st={st} />;
  if (hub.phase === "closed") return <Takeaways />;
  return (
    <Card title={hub.phase === "finale" ? "Finale" : "You're in"}>
      <p className="text-white/60">{hub.phase === "finale" ? "Eyes on the screen: the winners are coming." : "Keep this page open. Things will appear here as the session moves."}</p>
    </Card>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl bg-white/[0.06] p-5">
      <h2 className="mb-3 text-xl font-bold">{title}</h2>
      {children}
    </div>
  );
}

function Quiz({ hub, me, serverNow, post, pending }: { hub: HubView; me: Me; serverNow: number; post: PostFn; pending: Record<string, number> }) {
  const clock = quizClock(hub.quiz, serverNow);
  const [msg, setMsg] = useState("");
  if (clock.status === "off") return <Card title="Quickfire quiz"><p className="text-white/60">Get ready…</p></Card>;
  if (clock.status === "leadin")
    return (
      <Card title="Quickfire quiz">
        <div className="py-8 text-center text-7xl font-black text-orange-500">{Math.ceil(clock.msLeft / 1000)}</div>
        <p className="text-center text-white/60">30 questions. Tap fast. No going back.</p>
      </Card>
    );
  if (clock.status === "done")
    return (
      <Card title="That's the quiz">
        <p className="text-white/60">Scores are locked. The winner is revealed at the finale. Stay sharp.</p>
      </Card>
    );
  const q = QUIZ[clock.idx];
  const key = `q${clock.idx}`;
  const answered = me.quiz.includes(key) || pending[key] !== undefined;
  const picked = pending[key];
  const pct = clock.status === "answer" && clock.answerMs ? (clock.msLeft / clock.answerMs) * 100 : 0;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs text-white/50">
        <span>Question {clock.idx + 1} of {QUIZ.length} · {q.section}</span>
        <span>{clock.status === "answer" ? `${Math.ceil(clock.msLeft / 1000)}s` : "Next…"}</span>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full bg-orange-500 transition-[width] duration-200" style={{ width: `${pct}%` }} />
      </div>
      <div className="mb-4 text-2xl font-bold leading-snug">{q.q}</div>
      <div className="space-y-2">
        {q.options.map((o, i) => (
          <button
            key={i}
            disabled={answered || clock.status !== "answer"}
            onClick={async () => {
              pending[key] = i;
              setMsg("");
              try {
                await post({ action: "quiz", idx: clock.idx, choice: i });
              } catch (e) {
                delete pending[key];
                setMsg(e instanceof Error ? e.message : "Missed it");
              }
            }}
            className={`${btn} ${picked === i ? "bg-orange-600" : answered || clock.status !== "answer" ? "bg-white/5 text-white/40" : "bg-white/10"}`}
          >
            <span className="mr-3 font-bold text-orange-400">{"ABCD"[i]}</span>
            {o}
          </button>
        ))}
      </div>
      <div className="mt-3 h-5 text-center text-sm text-white/60">{answered ? "Locked in ✓" : msg || (clock.status === "reveal" ? "Time's up" : "")}</div>
    </div>
  );
}

function Assessment({ me, post, reload }: { me: Me; post: PostFn; reload: () => void }) {
  const done = Object.keys(me.assess).length;
  const firstOpen = ASSESSMENT.findIndex((_, i) => me.assess[`a${i}`] === undefined);
  const [idx, setIdx] = useState(firstOpen === -1 ? ASSESSMENT.length : firstOpen);
  const [local, setLocal] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const answers = { ...me.assess, ...local };
  const count = Object.keys(answers).length;

  if (idx >= ASSESSMENT.length || (count >= ASSESSMENT.length && idx >= ASSESSMENT.length))
    return (
      <Card title="Done. Thank you">
        <p className="text-white/60">Your AI level is revealed at the finale, privately, on this phone. Nobody else sees your answers.</p>
        <button onClick={() => setIdx(0)} className="mt-4 text-sm text-orange-400 underline">Review my answers</button>
      </Card>
    );
  const q = ASSESSMENT[idx];
  const cur = answers[`a${idx}`];
  return (
    <div>
      <div className="mb-2 flex justify-between text-xs text-white/50">
        <span>{idx + 1} of {ASSESSMENT.length} · {q.area}</span>
        <span>{Math.max(done, count)} answered</span>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full bg-orange-500" style={{ width: `${(count / ASSESSMENT.length) * 100}%` }} />
      </div>
      <div className="text-2xl font-bold">{q.q}</div>
      <div className="mb-4 mt-1 text-sm text-white/50">Pick the highest statement that&apos;s true for you today. Tried it once doesn&apos;t count.</div>
      <div className="space-y-2">
        {q.options.map((o, i) => (
          <button
            key={i}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setLocal((l) => ({ ...l, [`a${idx}`]: i + 1 }));
              try {
                await post({ action: "assess", idx, score: i + 1 });
                setIdx(idx + 1);
                reload();
              } catch {
              } finally {
                setBusy(false);
              }
            }}
            className={`${btn} ${cur === i + 1 ? "bg-orange-600" : "bg-white/10"}`}
          >
            {o}
          </button>
        ))}
      </div>
      {idx > 0 && <button onClick={() => setIdx(idx - 1)} className="mt-4 text-sm text-white/50">◀ Back</button>}
    </div>
  );
}

function PollCard({ pollKey, reveal, me, post, reload }: { pollKey: string | null; reveal: number | null; me: Me; post: PostFn; reload: () => void }) {
  const poll = pollByKey(pollKey);
  const [picked, setPicked] = useState<number | undefined>(undefined);
  if (!poll) return <Card title="Poll"><p className="text-white/60">Opening…</p></Card>;
  const cur = picked ?? me.polls[poll.key];
  return (
    <Card title={poll.q}>
      <div className="space-y-2">
        {poll.options.map((o, i) => (
          <button
            key={i}
            onClick={async () => {
              setPicked(i);
              try {
                await post({ action: "poll", key: poll.key, choice: i });
                reload();
              } catch {}
            }}
            disabled={reveal !== null}
            className={`${btn} ${reveal === i ? "bg-emerald-600" : cur === i ? "bg-orange-600" : "bg-white/10"} ${reveal !== null && reveal !== i ? "opacity-40" : ""}`}
          >
            {reveal === i && "✓ "}
            {o}
          </button>
        ))}
      </div>
      {reveal !== null ? (
        <div className="mt-3 rounded-xl bg-emerald-600/20 p-3 text-sm text-emerald-100">
          {poll.liveResult ? `What actually happened: ${poll.options[reveal]}` : poll.explain}
          {!poll.liveResult && cur !== undefined && <div className="mt-1 font-semibold">{cur === reveal ? "You got it ✓" : "Not this time. Now you know!"}</div>}
        </div>
      ) : (
        <div className="mt-3 h-5 text-center text-sm text-white/60">{cur !== undefined ? "Vote in ✓ (you can change it)" : ""}</div>
      )}
    </Card>
  );
}

function Commit({ me, post, reload }: { me: Me; post: PostFn; reload: () => void }) {
  const [text, setText] = useState(me.commit || "");
  const [saved, setSaved] = useState(!!me.commit);
  const [err, setErr] = useState("");
  return (
    <Card title="Our commitment">
      <p className="text-white/80 leading-relaxed">
        I will learn AI responsibly.<br />I will check the facts.<br />I will use AI only where it makes me more productive and gives real ROI.
      </p>
      <label className="mt-4 block text-sm text-white/70">In the next 30 days, my one task I&apos;ll never do manually again:</label>
      <textarea value={text} onChange={(e) => { setText(e.target.value); setSaved(false); }} maxLength={200} rows={3} className="mt-1 w-full rounded-xl bg-white/10 p-3 outline-none focus:ring-2 focus:ring-orange-500" />
      {err && <div className="text-sm text-red-400">{err}</div>}
      <button
        onClick={async () => {
          setErr("");
          try {
            await post({ action: "commit", text });
            setSaved(true);
            reload();
          } catch (e) {
            setErr(e instanceof Error ? e.message : "Could not save");
          }
        }}
        className="mt-3 w-full rounded-2xl bg-orange-600 py-4 text-lg font-semibold"
      >
        {saved ? "Committed ✓" : "Commit"}
      </button>
    </Card>
  );
}

function Badge({ st }: { st: State }) {
  const b = st.badge!;
  return (
    <Passport
      name={st.me?.name || ""}
      level={b.level}
      quiz={b.quiz}
      quizOf={b.quizOf}
      commit={st.me?.commit || null}
      showKit={st.hub.phase === "closed"}
      deckUrl={st.deckUrl}
      title={st.session.title}
    />
  );
}

function Takeaways() {
  return (
    <Card title="Take this home">
      <ul className="space-y-2 text-white/80">
        {PHONE_TAKEAWAYS.map((t) => (
          <li key={t}>• {t}</li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-white/50">Thank you for your time, your questions and your curiosity.</p>
    </Card>
  );
}

/* ------------------------------ Ask ------------------------------ */
function Ask({ st, post, reload }: { st: State; post: PostFn; reload: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <div className="space-y-4">
      <Card title="Ask Shree">
        <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={400} rows={3} placeholder="Anything about AI, tools, or today's session" className="w-full rounded-xl bg-white/10 p-3 outline-none focus:ring-2 focus:ring-orange-500" />
        {err && <div className="text-sm text-red-400">{err}</div>}
        <button
          disabled={busy || text.trim().length < 5}
          onClick={async () => {
            setBusy(true);
            setErr("");
            try {
              await post({ action: "ask", text });
              setText("");
              reload();
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Could not send");
            } finally {
              setBusy(false);
            }
          }}
          className="mt-3 w-full rounded-2xl bg-orange-600 py-3 text-lg font-semibold disabled:opacity-40"
        >
          {busy ? "Shree is thinking…" : "Ask"}
        </button>
        <p className="mt-2 text-xs text-white/40">You get an instant answer here. Questions also go to the Q&A list for the room.</p>
      </Card>
      {st.myQuestions.map((q) => (
        <div key={q.id} className="rounded-2xl bg-white/[0.04] p-4">
          <div className="font-medium">{q.text}</div>
          <div className="mt-2 text-sm leading-relaxed text-white/70">{q.answer || "Thinking…"}</div>
        </div>
      ))}
    </div>
  );
}
