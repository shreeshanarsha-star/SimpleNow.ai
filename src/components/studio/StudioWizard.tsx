"use client";
// Presenter Studio — the 4-step wizard. Autosaves the plan as you go.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, drawPage, extractPages, jsonInit, openPdfData, uid } from "@/lib/studio/client";
import { buildRunOfShow, closingText, pollResultLine, quizRanking, scriptCheck, totalMinutes, winnersLine, type Issue } from "@/lib/studio/engine";
import { INTENTS, PRESETS, normalizePlan, type Intent, type Plan, type Poll, type Preset, type QuizQ } from "@/lib/studio/types";

type Show = { id: string; title: string; code: string | null; status: string; event_date: string | null; plan: Plan };
type Tab = 1 | 2 | 3 | 4;

const input = "w-full rounded-lg border border-border bg-page px-3 py-2 text-sm";
const label = "mb-1 block text-xs font-medium text-ink-muted";
const card = "rounded-2xl border border-border bg-surface p-5";
const btn = "rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-50";
const primary = "rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";

function Thumb({ doc, n, w = 150 }: { doc: any; n: number; w?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (doc && ref.current) drawPage(doc, n, ref.current, w, w * 0.75).catch(() => {});
  }, [doc, n, w]);
  return <canvas ref={ref} className="rounded border border-border bg-white" />;
}

export default function StudioWizard({ id }: { id: string }) {
  const [show, setShow] = useState<Show | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [title, setTitle] = useState("");
  const [tab, setTab] = useState<Tab>(1);
  const [doc, setDoc] = useState<any>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [saved, setSaved] = useState<"saved" | "saving" | "error">("saved");
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    (async () => {
      try {
        const d = await api<{ show: Show }>(`/api/studio/shows/${id}`);
        setShow(d.show);
        setPlan(normalizePlan(d.show.plan));
        setTitle(d.show.title);
        if (d.show.plan?.deck) {
          const { url } = await api<{ url: string | null }>(`/api/studio/shows/${id}/deck`);
          if (url) setDoc(await openPdfData(url));
        }
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Could not load");
      }
    })();
  }, [id]);

  const save = useCallback(
    async (p: Plan, t: string) => {
      setSaved("saving");
      try {
        await api(`/api/studio/shows/${id}`, jsonInit("PATCH", { plan: p, title: t, event_date: p.purpose.eventDate || null }));
        setSaved("saved");
      } catch {
        setSaved("error");
      }
    },
    [id]
  );
  // Debounced autosave.
  useEffect(() => {
    if (!plan || !dirty.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => save(plan, title), 1000);
    return () => clearTimeout(timer.current);
  }, [plan, title, save]);

  const update = (fn: (p: Plan) => void) => {
    dirty.current = true;
    setPlan((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  };

  const steps = useMemo(() => (plan ? buildRunOfShow(plan) : []), [plan]);
  const issues = useMemo(() => (plan ? scriptCheck(plan) : []), [plan]);

  if (!plan || !show) return <div className="p-6 text-sm text-ink-muted">{msg || "Loading…"}</div>;

  /* ------------------------------ actions ------------------------------ */
  const ai = <T,>(body: Record<string, unknown>) => api<T>("/api/studio/ai", jsonInit("POST", { showId: id, plan, ...body }));

  const uploadDeck = async (file: File) => {
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
      setMsg("Please upload a PDF. In PowerPoint: File → Export → PDF.");
      return;
    }
    setBusy("Reading your slides…");
    setMsg("");
    try {
      const buf = await file.arrayBuffer();
      const d = await openPdfData(buf.slice(0));
      const texts = await extractPages(d);
      setBusy("Uploading…");
      const { signedUrl } = await api<{ signedUrl: string }>(`/api/studio/shows/${id}/deck`, { method: "POST" });
      const r = await fetch(signedUrl, { method: "PUT", headers: { "Content-Type": "application/pdf", "x-upsert": "true" }, body: file });
      if (!r.ok) throw new Error(`Upload failed (${r.status})`);
      setDoc(d);
      update((p) => {
        const oldNotes = new Map(p.slides.map((s) => [s.n, s.notes]));
        p.slides = texts.map((t, i) => ({ n: i + 1, text: t, notes: oldNotes.get(i + 1) || "" }));
        p.deck = { name: file.name, pages: texts.length, uploadedAt: new Date().toISOString() };
        p.polls.items = p.polls.items.filter((x) => x.afterSlide <= texts.length);
        if (!title || title === "Untitled presentation") setTitle(file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " "));
      });
      setMsg(`${texts.length} slides loaded.${texts.filter((t) => t.length < 20).length > texts.length / 2 ? " Most slides have little text (images only?), so add notes for them so the script is accurate." : ""}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy("");
    }
  };

  const suggestPurpose = async () => {
    setBusy("Reading the deck…");
    try {
      const { purpose } = await ai<{ purpose: Partial<Plan["purpose"]> }>({ task: "purpose" });
      update((p) => {
        for (const k of ["purpose", "audience", "message", "closingLine", "outcome"] as const) if (!p.purpose[k] && typeof purpose[k] === "string") p.purpose[k] = purpose[k] as string;
        if (purpose.intent && purpose.intent in INTENTS) p.purpose.intent = purpose.intent as Intent;
        if (typeof purpose.minutes === "number" && purpose.minutes > 0) p.purpose.minutes = Math.round(purpose.minutes);
      });
      setMsg("Suggested. Edit anything that isn't right; empty fields were filled, your own text was kept.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy("");
    }
  };

  const suggestPolls = async () => {
    setBusy("Suggesting polls…");
    try {
      const { polls } = await ai<{ polls: Array<Omit<Poll, "key">> }>({ task: "polls", count: 2 });
      update((p) => {
        for (const x of polls) {
          if (!p.slides.some((s) => s.n === x.afterSlide)) continue;
          p.polls.items.push({ key: uid(), afterSlide: x.afterSlide, question: String(x.question || ""), options: (x.options || []).map(String).slice(0, 5), answer: typeof x.answer === "number" ? x.answer : null });
        }
        p.polls.items.sort((a, b) => a.afterSlide - b.afterSlide);
      });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy("");
    }
  };

  const genQuiz = async (count: number) => {
    setBusy("Writing the quiz from your deck…");
    try {
      const { quiz } = await ai<{ quiz: QuizQ[] }>({ task: "quiz", count });
      update((p) => {
        p.quiz.items = quiz.filter((q) => q.q && Array.isArray(q.options)).map((q) => ({ q: String(q.q), options: q.options.map(String).slice(0, 4), answer: Number(q.answer) || 0 }));
      });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy("");
    }
  };

  const genScript = async (cur: Plan = plan) => {
    const n = cur.slides.length;
    if (!n) return setMsg("Upload your slides first.");
    try {
      const out: Plan["script"] = { opening: cur.script.opening, slides: { ...cur.script.slides }, closing: cur.script.closing, generatedAt: new Date().toISOString() };
      const BATCH = 5;
      for (let from = 1; from <= n; from += BATCH) {
        const to = Math.min(n, from + BATCH - 1);
        setBusy(`Writing the script: slides ${from}–${to} of ${n}…`);
        const parts = [from === 1 ? "opening" : null, to === n ? "closing" : null].filter(Boolean);
        const r = await api<{ slides?: Record<string, string>; opening?: string; closing?: string }>("/api/studio/ai", jsonInit("POST", { showId: id, plan: cur, task: "script", from, to, parts }));
        Object.assign(out.slides, r.slides || {});
        if (r.opening) out.opening = r.opening;
        if (r.closing) out.closing = r.closing;
      }
      update((p) => {
        p.script = out;
      });
      setMsg("Script written. Read it, edit anything, and fix whatever the check flags.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy("");
    }
  };

  const rewrite = async (target: string, instruction: string) => {
    setBusy("Rewriting…");
    try {
      const { text } = await ai<{ text: string }>({ task: "line", target, instruction });
      update((p) => {
        if (target === "opening") p.script.opening = text;
        else if (target === "closing") p.script.closing = text;
        else p.script.slides[target] = text;
      });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy("");
    }
  };

  /** "Do it all for me": purpose → polls → quiz → script, then show the check. */
  const quickStart = async () => {
    if (!plan.slides.length) return setMsg("Upload your slides first.");
    let cur = plan;
    const step = async (label: string, fn: () => Promise<void>) => {
      setBusy(label);
      await fn();
    };
    try {
      if (!cur.purpose.message) {
        await step("1/4 Understanding your deck…", async () => {
          const { purpose } = await ai<{ purpose: Partial<Plan["purpose"]> }>({ task: "purpose" });
          cur = structuredClone(cur);
          for (const k of ["purpose", "audience", "message", "closingLine", "outcome"] as const) if (!cur.purpose[k] && typeof purpose[k] === "string") cur.purpose[k] = purpose[k] as string;
          if (purpose.intent && purpose.intent in INTENTS) cur.purpose.intent = purpose.intent as Intent;
        });
      }
      if (cur.polls.enabled && !cur.polls.items.length) {
        await step("2/4 Suggesting polls…", async () => {
          const { polls } = await api<{ polls: Array<Omit<Poll, "key">> }>("/api/studio/ai", jsonInit("POST", { showId: id, plan: cur, task: "polls", count: 2 }));
          cur = structuredClone(cur);
          cur.polls.items = polls.filter((x) => cur.slides.some((s) => s.n === x.afterSlide)).map((x) => ({ key: uid(), afterSlide: x.afterSlide, question: String(x.question), options: x.options.map(String), answer: typeof x.answer === "number" ? x.answer : null }));
        });
      }
      if (cur.quiz.enabled && !cur.quiz.items.length) {
        await step("3/4 Writing the quiz…", async () => {
          const { quiz } = await api<{ quiz: QuizQ[] }>("/api/studio/ai", jsonInit("POST", { showId: id, plan: cur, task: "quiz", count: 8 }));
          cur = structuredClone(cur);
          cur.quiz.items = quiz.map((q) => ({ q: String(q.q), options: q.options.map(String).slice(0, 4), answer: Number(q.answer) || 0 }));
        });
      }
      dirty.current = true;
      setPlan(cur);
      await genScript(cur);
      setTab(3);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
      setBusy("");
    }
  };

  const errors = issues.filter((i) => i.level === "error");
  const mins = totalMinutes(steps);

  /* -------------------------------- UI --------------------------------- */
  const P = plan.purpose;
  return (
    <div className="space-y-4 p-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Link href="/tools/presenter/studio" className="text-ink-muted hover:underline">
            ← All presentations
          </Link>
        </div>
        <div className="text-xs text-ink-muted">{saved === "saving" ? "Saving…" : saved === "error" ? "Not saved (retrying on next change)" : "All changes saved"}</div>
      </div>

      <div className={card}>
        <input className="w-full bg-transparent text-xl font-semibold outline-none" value={title} onChange={(e) => (dirty.current = true, setTitle(e.target.value))} placeholder="Presentation title" />
        <div className="mt-3 flex flex-wrap gap-2">
          {(["Deck & purpose", "Interactions & audience", "Presenter & script", "Rehearse & go"] as const).map((t, i) => (
            <button key={t} onClick={() => setTab((i + 1) as Tab)} className={`rounded-full px-3 py-1.5 text-sm ${tab === i + 1 ? "bg-brand text-white" : "border border-border"}`}>
              {i + 1}. {t}
            </button>
          ))}
        </div>
      </div>

      {(busy || msg) && (
        <div className={`rounded-lg px-3 py-2 text-sm ${busy ? "bg-brand-wash" : "bg-page border border-border"}`}>
          {busy || msg}
          {!busy && msg && (
            <button className="ml-2 text-ink-muted" onClick={() => setMsg("")}>
              ✕
            </button>
          )}
        </div>
      )}

      {/* ------------------------------ Step 1 ------------------------------ */}
      {tab === 1 && (
        <div className="space-y-4">
          <div className={card}>
            <div className="mb-3 font-semibold">Slides</div>
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed border-border p-4 text-sm">
              <span>{plan.deck ? `${plan.deck.name} · ${plan.deck.pages} slides. Drop a new PDF to replace.` : "Upload your deck as a PDF (PowerPoint: File → Export → PDF)."}</span>
              <span className={btn}>Choose PDF</span>
              <input type="file" accept="application/pdf,.pdf" className="hidden" disabled={!!busy} onChange={(e) => e.target.files?.[0] && uploadDeck(e.target.files[0])} />
            </label>
            {plan.slides.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-ink-muted">Slides and notes ({plan.slides.length}): add notes or directions for any slide</summary>
                <div className="mt-3 space-y-3">
                  {plan.slides.map((s, i) => (
                    <div key={s.n} className="flex gap-3">
                      <div className="shrink-0">
                        <Thumb doc={doc} n={s.n} />
                        <div className="text-center text-xs text-ink-muted">Slide {s.n}</div>
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="max-h-16 overflow-auto text-xs text-ink-muted">{s.text || "(no text found on this slide)"}</div>
                        <textarea className={input} rows={2} placeholder="Notes / direction for the presenter (optional)" value={s.notes} onChange={(e) => update((p) => void (p.slides[i].notes = e.target.value))} />
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>

          <div className={card}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold">Purpose and message</div>
              <button className={btn} disabled={!!busy || !plan.slides.length} onClick={suggestPurpose}>
                ✨ Suggest from my deck
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <span className={label}>Intent (type of session)</span>
                <select className={input} value={P.intent} onChange={(e) => update((p) => void (p.purpose.intent = e.target.value as Intent))}>
                  {Object.entries(INTENTS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className={label}>Date</span>
                  <input type="date" className={input} value={P.eventDate} onChange={(e) => update((p) => void (p.purpose.eventDate = e.target.value))} />
                </div>
                <div>
                  <span className={label}>Time of day</span>
                  <select className={input} value={P.timeOfDay} onChange={(e) => update((p) => void (p.purpose.timeOfDay = e.target.value as Plan["purpose"]["timeOfDay"]))}>
                    <option value="morning">Morning</option>
                    <option value="afternoon">Afternoon</option>
                    <option value="evening">Evening</option>
                  </select>
                </div>
                <div>
                  <span className={label}>Minutes</span>
                  <input type="number" min={5} max={240} className={input} value={P.minutes} onChange={(e) => update((p) => void (p.purpose.minutes = Number(e.target.value) || 45))} />
                </div>
              </div>
              <Field l="Purpose: why this session exists" v={P.purpose} on={(v) => update((p) => void (p.purpose.purpose = v))} />
              <Field l="Audience: who it's for" v={P.audience} on={(v) => update((p) => void (p.purpose.audience = v))} />
              <Field l="Ultimate message: the one thing they must remember" v={P.message} on={(v) => update((p) => void (p.purpose.message = v))} area />
              <Field l="Closing line: said word for word at the very end" v={P.closingLine} on={(v) => update((p) => void (p.purpose.closingLine = v))} area />
              <Field l="Desired outcome: what people do afterwards" v={P.outcome} on={(v) => update((p) => void (p.purpose.outcome = v))} />
              <Field l="Success measure (optional)" v={P.success} on={(v) => update((p) => void (p.purpose.success = v))} />
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button className={btn} disabled={!!busy || !plan.slides.length} onClick={quickStart} title="Fills purpose, polls, quiz and the whole script with AI; you then review everything">
              ⚡ Do it all for me
            </button>
            <button className={primary} onClick={() => setTab(2)}>
              Next: interactions →
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------ Step 2 ------------------------------ */}
      {tab === 2 && (
        <div className="space-y-4">
          <div className={card}>
            <Toggle label="Polls on phones" on={plan.polls.enabled} set={(v) => update((p) => void (p.polls.enabled = v))} />
            {plan.polls.enabled && (
              <div className="mt-3 space-y-3">
                {plan.polls.items.map((x, i) => (
                  <div key={x.key} className="rounded-xl border border-border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-ink-muted">After slide</span>
                      <select className="rounded border border-border bg-page px-2 py-1 text-sm" value={x.afterSlide} onChange={(e) => update((p) => void (p.polls.items[i].afterSlide = Number(e.target.value)))}>
                        {plan.slides.map((s) => (
                          <option key={s.n} value={s.n}>
                            {s.n}
                          </option>
                        ))}
                      </select>
                      <button className="ml-auto text-xs text-critical" onClick={() => update((p) => void p.polls.items.splice(i, 1))}>
                        Remove
                      </button>
                    </div>
                    <input className={`${input} mt-2`} placeholder="Question" value={x.question} onChange={(e) => update((p) => void (p.polls.items[i].question = e.target.value))} />
                    <OptionsEditor options={x.options} answer={x.answer} allowNoAnswer onChange={(o, a) => update((p) => void ((p.polls.items[i].options = o), (p.polls.items[i].answer = a)))} />
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  <button className={btn} onClick={() => update((p) => void p.polls.items.push({ key: uid(), afterSlide: p.slides[0]?.n || 1, question: "", options: ["", ""], answer: null }))}>
                    + Add a poll
                  </button>
                  <button className={btn} disabled={!!busy || !plan.slides.length} onClick={suggestPolls}>
                    ✨ Suggest polls from my deck
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className={card}>
            <Toggle label="Quiz on phones" on={plan.quiz.enabled} set={(v) => update((p) => void (p.quiz.enabled = v))} />
            {plan.quiz.enabled && (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span>Placement</span>
                  <select className="rounded border border-border bg-page px-2 py-1" value={plan.quiz.placement} onChange={(e) => update((p) => void (p.quiz.placement = e.target.value as "before" | "after"))}>
                    <option value="before">Before the slides</option>
                    <option value="after">After the slides</option>
                  </select>
                  <span>Seconds per question</span>
                  <input type="number" min={8} max={60} className="w-20 rounded border border-border bg-page px-2 py-1" value={plan.quiz.seconds} onChange={(e) => update((p) => void (p.quiz.seconds = Math.min(60, Math.max(8, Number(e.target.value) || 20))))} />
                </div>
                {plan.quiz.items.map((q, i) => (
                  <div key={i} className="rounded-xl border border-border p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-ink-muted">Q{i + 1}</span>
                      <input className={input} value={q.q} onChange={(e) => update((p) => void (p.quiz.items[i].q = e.target.value))} />
                      <button className="text-xs text-critical" onClick={() => update((p) => void p.quiz.items.splice(i, 1))}>
                        ✕
                      </button>
                    </div>
                    <OptionsEditor options={q.options} answer={q.answer} onChange={(o, a) => update((p) => void ((p.quiz.items[i].options = o), (p.quiz.items[i].answer = a ?? 0)))} />
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  <button className={btn} onClick={() => update((p) => void p.quiz.items.push({ q: "", options: ["", "", "", ""], answer: 0 }))}>
                    + Add a question
                  </button>
                  <button className={btn} disabled={!!busy || !plan.slides.length} onClick={() => genQuiz(8)}>
                    ✨ Generate 8 from my deck
                  </button>
                  <PasteQuiz onAdd={(qs) => update((p) => void p.quiz.items.push(...qs))} />
                </div>
              </div>
            )}
          </div>

          <div className={card}>
            <Toggle label="Q&A: people ask on their phones; you approve each answer before it's spoken" on={plan.qa.enabled} set={(v) => update((p) => void (p.qa.enabled = v))} />
          </div>

          <div className={card}>
            <div className="mb-2 font-semibold">Audience</div>
            <div className="flex gap-2 text-sm">
              {(["anonymous", "list"] as const).map((m) => (
                <button key={m} className={`rounded-full px-3 py-1 ${plan.audience.mode === m ? "bg-brand text-white" : "border border-border"}`} onClick={() => update((p) => void (p.audience.mode = m))}>
                  {m === "anonymous" ? "Anyone (they type their name)" : "Known list"}
                </button>
              ))}
            </div>
            {plan.audience.mode === "list" && (
              <div className="mt-3">
                <span className={label}>One person per line: Name, Role, Note (role and note optional). Names are never spoken during the slides.</span>
                <textarea
                  className={input}
                  rows={5}
                  defaultValue={plan.audience.people.map((p) => [p.name, p.role, p.note].filter(Boolean).join(", ")).join("\n")}
                  onBlur={(e) =>
                    update((p) => {
                      p.audience.people = e.target.value
                        .split("\n")
                        .map((l) => l.split(",").map((x) => x.trim()))
                        .filter((x) => x[0])
                        .map(([name, role = "", ...note]) => ({ name, role, note: note.join(", ") }));
                    })
                  }
                />
                <div className="text-xs text-ink-muted">{plan.audience.people.length} people</div>
              </div>
            )}
          </div>
          <div className="flex justify-between">
            <button className={btn} onClick={() => setTab(1)}>
              ← Back
            </button>
            <button className={primary} onClick={() => setTab(3)}>
              Next: presenter & script →
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------ Step 3 ------------------------------ */}
      {tab === 3 && (
        <div className="space-y-4">
          <div className={card}>
            <div className="mb-3 font-semibold">Presenter</div>
            <div className="flex flex-wrap gap-2 text-sm">
              {(
                [
                  ["shree", "Shree (my AI twin)"],
                  ["anam", "Another Anam avatar"],
                  ["voice", "Voice only (no face)"],
                ] as const
              ).map(([k, l]) => (
                <button key={k} className={`rounded-full px-3 py-1 ${plan.presenter.kind === k ? "bg-brand text-white" : "border border-border"}`} onClick={() => update((p) => void ((p.presenter.kind = k), k === "shree" && (p.presenter.name = "Shree")))}>
                  {l}
                </button>
              ))}
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Field l="Presenter's name (how they introduce themselves)" v={plan.presenter.name} on={(v) => update((p) => void (p.presenter.name = v))} />
              {plan.presenter.kind === "anam" && <Field l="Anam persona ID (from Anam Lab)" v={plan.presenter.personaId} on={(v) => update((p) => void (p.presenter.personaId = v.trim()))} />}
            </div>
          </div>

          <PronunciationCard showId={id} plan={plan} hasSlides={plan.slides.length > 0} />

          <div className={card}>
            <div className="mb-3 font-semibold">Personality and rules</div>
            <div className="flex flex-wrap gap-2 text-sm">
              {(Object.keys(PRESETS) as Preset[]).map((k) => (
                <button key={k} title={PRESETS[k].style} className={`rounded-full px-3 py-1 ${plan.personality.preset === k ? "bg-brand text-white" : "border border-border"}`} onClick={() => update((p) => void (p.personality.preset = k))}>
                  {PRESETS[k].label}
                </button>
              ))}
            </div>
            <div className="mt-1 text-xs text-ink-muted">{PRESETS[plan.personality.preset].style}</div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <Field l="Rules (one per line)" v={plan.personality.rules} on={(v) => update((p) => void (p.personality.rules = v))} area />
              <Field l="Must say (points to cover)" v={plan.personality.mustSay} on={(v) => update((p) => void (p.personality.mustSay = v))} area />
              <Field l="Never say (words/topics, comma separated)" v={plan.personality.avoid} on={(v) => update((p) => void (p.personality.avoid = v))} area />
            </div>
          </div>

          <div className={card}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold">Script</div>
                <div className="text-xs text-ink-muted">This is exactly what the presenter will say. Edit freely. Only Q&A answers are made up live, and you approve each one.</div>
              </div>
              <button className={primary} disabled={!!busy || !plan.slides.length} onClick={() => genScript()}>
                {plan.script.generatedAt ? "↻ Rewrite whole script" : "✨ Write the script"}
              </button>
            </div>
            <ScriptLine label="Opening" text={plan.script.opening} issues={issues.filter((i) => i.where === "Opening")} onChange={(v) => update((p) => void (p.script.opening = v))} onRewrite={(ins) => rewrite("opening", ins)} busy={!!busy} />
            {plan.slides.map((s) => {
              const poll = plan.polls.enabled ? plan.polls.items.filter((x) => x.afterSlide === s.n) : [];
              return (
                <div key={s.n}>
                  <ScriptLine
                    label={`Slide ${s.n}`}
                    thumb={<Thumb doc={doc} n={s.n} w={120} />}
                    text={plan.script.slides[String(s.n)] || ""}
                    issues={issues.filter((i) => i.where === `Slide ${s.n}`)}
                    onChange={(v) => update((p) => void (p.script.slides[String(s.n)] = v))}
                    onRewrite={(ins) => rewrite(String(s.n), ins)}
                    busy={!!busy}
                  />
                  {poll.map((x) => (
                    <div key={x.key} className="mb-3 ml-4 rounded-lg bg-brand-wash px-3 py-2 text-xs">
                      📊 Poll: “{x.question}”: opens on phones here; the result line is read out automatically.
                    </div>
                  ))}
                </div>
              );
            })}
            <ScriptLine label="Closing" text={plan.script.closing} issues={issues.filter((i) => i.where === "Closing")} onChange={(v) => update((p) => void (p.script.closing = v))} onRewrite={(ins) => rewrite("closing", ins)} busy={!!busy} />
            {plan.purpose.closingLine && <div className="text-xs text-ink-muted">The closing always ends with your closing line, word for word.</div>}
          </div>
          <div className="flex justify-between">
            <button className={btn} onClick={() => setTab(2)}>
              ← Back
            </button>
            <button className={primary} onClick={() => setTab(4)}>
              Next: rehearse & go →
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------ Step 4 ------------------------------ */}
      {tab === 4 && <GoStep show={show} plan={plan} title={title} steps={steps} issues={issues} errors={errors} mins={mins} update={update} setShow={setShow} saveNow={() => save(plan, title)} />}
    </div>
  );
}

/* ------------------------------ Step 4 ------------------------------ */
function GoStep({
  show,
  plan,
  title,
  steps,
  issues,
  errors,
  mins,
  update,
  setShow,
  saveNow,
}: {
  show: Show;
  plan: Plan;
  title: string;
  steps: ReturnType<typeof buildRunOfShow>;
  issues: Issue[];
  errors: Issue[];
  mins: number;
  update: (fn: (p: Plan) => void) => void;
  setShow: (s: Show) => void;
  saveNow: () => Promise<void>;
}) {
  const [report, setReport] = useState<Array<{ ok: boolean; label: string; say: string; note: string }> | null>(null);
  const [msg, setMsg] = useState("");
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const rehearse = () => {
    // Text-only rehearsal: plays every step with 3 simulated phones. No avatar minutes used.
    const phones = ["Asha", "Bala", "Chitra"];
    const quizAns: Parameters<typeof quizRanking>[0] = [];
    const out: Array<{ ok: boolean; label: string; say: string; note: string }> = [];
    steps.forEach((s, i) => {
      let say = s.say;
      let note = "";
      let ok = true;
      if (s.kind === "poll_result" && s.pollKey) {
        const poll = plan.polls.items.find((p) => p.key === s.pollKey)!;
        const counts = poll.options.map(() => 0);
        phones.forEach((_, k) => counts[(k + i) % counts.length]++);
        say = pollResultLine(poll, counts);
        note = `3 simulated votes: ${counts.join(" / ")}`;
      } else if (s.kind === "quiz_q" && s.quizIdx !== undefined) {
        const q = plan.quiz.items[s.quizIdx];
        phones.forEach((p, k) => quizAns.push({ person: p, name: p, idx: s.quizIdx!, choice: k === 2 ? (q.answer + 1) % q.options.length : q.answer, ms: 2000 + k * 900 + s.quizIdx! * 50 }));
        note = `Q: ${q.q} → answer: ${q.options[q.answer] || "MISSING"}`;
        ok = !!q.q && !!q.options[q.answer];
      } else if (s.kind === "results") {
        say = winnersLine(quizRanking(quizAns, plan.quiz.items.map((q) => q.answer)), plan.quiz.items.length) || "(poll results shown on screen)";
      } else if (s.kind === "qa") {
        note = "You approve each answer on the remote before it's spoken.";
      }
      const needsSay = ["opening", "slide", "poll", "quiz_intro", "quiz_end", "qa", "close"].includes(s.kind);
      if (needsSay && !say.trim()) {
        ok = false;
        note = note || "Nothing to say: write this line in step 3.";
      }
      const errs = issues.filter((x) => x.level === "error" && (x.where === s.label || (s.kind === "opening" && x.where === "Opening") || (s.kind === "close" && x.where === "Closing")));
      if (errs.length) {
        ok = false;
        note = [note, ...errs.map((e) => e.msg)].filter(Boolean).join(" ");
      }
      out.push({ ok, label: `${i + 1}. ${s.label}`, say, note });
    });
    setReport(out);
  };

  const setStatus = async (status: string) => {
    await saveNow();
    await api(`/api/studio/shows/${show.id}`, jsonInit("PATCH", { status }));
    setShow({ ...show, status });
    setMsg(status === "ready" ? "Marked ready. Open the TV screen and the remote." : "Back to draft.");
  };
  const fresh = async () => {
    if (!confirm("Start fresh? This clears the live position and everyone who joined or answered (use after a rehearsal).")) return;
    await api(`/api/studio/shows/${show.id}`, jsonInit("PATCH", { resetLive: true }));
    setMsg("Cleared. The show will start from the beginning.");
  };

  const passed = report && report.every((r) => r.ok);
  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="font-semibold">Run of show · {steps.length} steps · about {mins} min</div>
          <div className={`text-sm ${Math.abs(mins - plan.purpose.minutes) > plan.purpose.minutes * 0.25 ? "text-critical" : "text-ink-muted"}`}>Planned: {plan.purpose.minutes} min (Q&A counted as 5 min)</div>
        </div>
        <ol className="grid gap-1 text-sm md:grid-cols-2">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className="w-6 text-right text-ink-muted">{i + 1}</span>
              <span>{s.label}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className={card}>
        <div className="mb-2 font-semibold">How the show moves</div>
        <div className="flex flex-wrap gap-2 text-sm">
          {(
            [
              ["manual", "Manual: you press Next for every step (safest)"],
              ["assisted", "Assisted: slides move on by themselves; polls, quiz and Q&A wait for you"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} className={`rounded-xl px-3 py-2 text-left ${plan.mode === k ? "bg-brand text-white" : "border border-border"}`} onClick={() => update((p) => void (p.mode = k))}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className={card}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-semibold">Script check and rehearsal</div>
            <div className="text-xs text-ink-muted">
              {errors.length} must-fix · {issues.length - errors.length} warnings. Rehearsal plays every step as text with 3 simulated phones. No avatar minutes used.
            </div>
          </div>
          <button className={primary} onClick={rehearse}>
            ▶ Run rehearsal
          </button>
        </div>
        {issues.length > 0 && (
          <ul className="mb-3 space-y-1 text-sm">
            {issues.map((x, i) => (
              <li key={i} className={x.level === "error" ? "text-critical" : "text-ink-2"}>
                {x.level === "error" ? "✖" : "⚠"} <b>{x.where}:</b> {x.msg}
              </li>
            ))}
          </ul>
        )}
        {report && (
          <div className="space-y-1">
            <div className={`rounded-lg px-3 py-2 text-sm font-semibold ${passed ? "bg-good-wash text-good-text" : "bg-critical-wash"}`}>{passed ? "✔ Rehearsal passed: every step has what it needs." : `✖ ${report.filter((r) => !r.ok).length} step(s) need attention.`}</div>
            <div className="max-h-[420px] space-y-1 overflow-auto">
              {report.map((r, i) => (
                <div key={i} className={`rounded-lg border px-3 py-2 text-sm ${r.ok ? "border-border" : "border-critical"}`}>
                  <div className="font-medium">
                    {r.ok ? "✔" : "✖"} {r.label}
                  </div>
                  {r.say && <div className="text-ink-2">“{r.say}”</div>}
                  {r.note && <div className="text-xs text-ink-muted">{r.note}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className={card}>
        <div className="mb-2 font-semibold">Go live</div>
        <div className="grid gap-3 md:grid-cols-3">
          <a href={`/presenter/show/${show.id}`} target="_blank" className="rounded-xl border border-border p-3 hover:border-border-strong">
            <div className="text-sm font-semibold">1 · TV screen</div>
            <div className="text-xs text-ink-muted">On the laptop connected to the TV. Click once to start sound.</div>
          </a>
          <a href={`/presenter/show/${show.id}/remote`} target="_blank" className="rounded-xl border border-border p-3 hover:border-border-strong">
            <div className="text-sm font-semibold">2 · Remote</div>
            <div className="text-xs text-ink-muted">On your phone (signed in). Best run by a second person.</div>
          </a>
          <a href={`/join/${show.code}`} target="_blank" className="rounded-xl border border-border p-3 hover:border-border-strong">
            <div className="text-sm font-semibold">3 · Audience: code {show.code}</div>
            <div className="break-all text-xs text-ink-muted">
              {origin}/join/{show.code}
            </div>
          </a>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {show.status !== "ready" ? (
            <button className={primary} disabled={errors.length > 0} onClick={() => setStatus("ready")} title={errors.length ? "Fix the must-fix items first" : ""}>
              Mark as ready
            </button>
          ) : (
            <button className={btn} onClick={() => setStatus("draft")}>
              Back to draft
            </button>
          )}
          <button className={btn} onClick={fresh}>
            Start fresh (clear rehearsal data)
          </button>
          <span className="text-xs text-ink-muted">{title}</span>
          {msg && <span className="text-sm">{msg}</span>}
        </div>
        <div className="mt-2 text-xs text-ink-muted">Closing will end with: “{closingText(plan).slice(-140)}”</div>
      </div>
    </div>
  );
}

/* ------------------------------ small parts ------------------------------ */
function Field({ l, v, on, area }: { l: string; v: string; on: (v: string) => void; area?: boolean }) {
  return (
    <div>
      <span className={label}>{l}</span>
      {area ? <textarea className={input} rows={3} value={v} onChange={(e) => on(e.target.value)} /> : <input className={input} value={v} onChange={(e) => on(e.target.value)} />}
    </div>
  );
}

function Toggle({ label: l, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span className="font-semibold">{l}</span>
      <button type="button" onClick={() => set(!on)} className={`h-6 w-11 rounded-full transition ${on ? "bg-brand" : "bg-border"}`}>
        <span className={`block h-5 w-5 rounded-full bg-white shadow transition ${on ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
    </label>
  );
}

function OptionsEditor({ options, answer, onChange, allowNoAnswer }: { options: string[]; answer: number | null; onChange: (o: string[], a: number | null) => void; allowNoAnswer?: boolean }) {
  return (
    <div className="mt-2 space-y-1">
      {options.map((o, k) => (
        <div key={k} className="flex items-center gap-2">
          <input type="radio" checked={answer === k} onChange={() => onChange(options, k)} title="Correct answer" />
          <input
            className="flex-1 rounded border border-border bg-page px-2 py-1 text-sm"
            placeholder={`Option ${k + 1}`}
            value={o}
            onChange={(e) => {
              const n = [...options];
              n[k] = e.target.value;
              onChange(n, answer);
            }}
          />
          {options.length > 2 && (
            <button className="text-xs text-ink-muted" onClick={() => onChange(options.filter((_, j) => j !== k), answer === null ? null : answer === k ? (allowNoAnswer ? null : 0) : answer > k ? answer - 1 : answer)}>
              ✕
            </button>
          )}
        </div>
      ))}
      <div className="flex gap-3 text-xs">
        {options.length < 5 && (
          <button className="text-brand" onClick={() => onChange([...options, ""], answer)}>
            + option
          </button>
        )}
        {allowNoAnswer && (
          <button className="text-ink-muted" onClick={() => onChange(options, null)}>
            {answer === null ? "No correct answer (opinion poll)" : "Clear correct answer"}
          </button>
        )}
      </div>
    </div>
  );
}

function PasteQuiz({ onAdd }: { onAdd: (q: QuizQ[]) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  if (!open)
    return (
      <button className={btn} onClick={() => setOpen(true)}>
        Paste questions
      </button>
    );
  return (
    <div className="w-full space-y-2">
      <div className="text-xs text-ink-muted">One per line: Question | option A | option B | option C | option D | correct letter (A–D). Works from Excel: use | between columns.</div>
      <textarea className={input} rows={5} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex gap-2">
        <button
          className={btn}
          onClick={() => {
            const qs = text
              .split("\n")
              .map((l) => l.split(/\t|\|/).map((x) => x.trim()))
              .filter((c) => c.length >= 4 && c[0])
              .map((c) => {
                const last = c[c.length - 1].toUpperCase();
                const hasKey = /^[A-E]$/.test(last);
                const options = (hasKey ? c.slice(1, -1) : c.slice(1)).filter(Boolean).slice(0, 5);
                return { q: c[0], options, answer: hasKey ? Math.min(options.length - 1, last.charCodeAt(0) - 65) : 0 };
              });
            onAdd(qs);
            setText("");
            setOpen(false);
          }}
        >
          Add
        </button>
        <button className={btn} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function ScriptLine({ label: l, text, issues, onChange, onRewrite, busy, thumb }: { label: string; text: string; issues: Issue[]; onChange: (v: string) => void; onRewrite: (ins: string) => void; busy: boolean; thumb?: React.ReactNode }) {
  const [ins, setIns] = useState("");
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return (
    <div className="mb-4 flex gap-3">
      {thumb && <div className="hidden shrink-0 md:block">{thumb}</div>}
      <div className="flex-1">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="font-semibold">{l}</span>
          <span className="text-ink-muted">
            {words} words · ~{Math.round(words / 2.4)} s
          </span>
        </div>
        <textarea className={input} rows={Math.min(8, Math.max(3, Math.ceil(text.length / 110)))} value={text} onChange={(e) => onChange(e.target.value)} />
        {issues.map((x, i) => (
          <div key={i} className={`text-xs ${x.level === "error" ? "text-critical" : "text-ink-muted"}`}>
            {x.level === "error" ? "✖" : "⚠"} {x.msg}
          </div>
        ))}
        <div className="mt-1 flex gap-2">
          <input className="flex-1 rounded border border-border bg-page px-2 py-1 text-xs" placeholder="Ask for a change, e.g. shorter, add an example, more energy" value={ins} onChange={(e) => setIns(e.target.value)} />
          <button
            className="rounded border border-border px-2 py-1 text-xs disabled:opacity-50"
            disabled={busy}
            onClick={() => {
              onRewrite(ins || "Rewrite it to be clearer and more natural.");
              setIns("");
            }}
          >
            ↻ Rewrite
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Pronunciation ------------------------------ */
type Entry = { text: string; pronunciation: string };
function PronunciationCard({ showId, plan, hasSlides }: { showId: string; plan: Plan; hasSlides: boolean }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [sugg, setSugg] = useState<Array<Entry & { why?: string; on: boolean }>>([]);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const load = useCallback(async () => {
    try {
      const d = await api<{ entries: Entry[] }>("/api/studio/dictionary");
      setEntries(d.entries);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not load");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const suggest = async () => {
    setBusy("Reading the deck for tricky words…");
    try {
      const { terms } = await api<{ terms: Array<Entry & { why?: string }> }>("/api/studio/ai", jsonInit("POST", { task: "pronounce", showId, plan }));
      const have = new Set((entries || []).map((e) => e.text.toLowerCase()));
      setSugg(terms.filter((t) => t.text && t.pronunciation && !have.has(t.text.toLowerCase())).map((t) => ({ ...t, on: true })));
      setMsg(terms.length ? "" : "No tricky words found.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy("");
    }
  };
  const add = async () => {
    const pick = sugg.filter((x) => x.on).map(({ text, pronunciation }) => ({ text, pronunciation }));
    if (!pick.length) return;
    setBusy("Saving…");
    try {
      await api("/api/studio/dictionary", jsonInit("POST", { add: pick }));
      setSugg([]);
      setMsg(`${pick.length} added. They apply from the next time the TV screen starts.`);
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy("");
    }
  };
  return (
    <div className={card}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-semibold">Pronunciation</div>
          <div className="text-xs text-ink-muted">How the presenter says names and terms. Captions keep the normal spelling.</div>
        </div>
        <button className={btn} disabled={!!busy || !hasSlides} onClick={suggest}>
          ✨ Suggest from my deck
        </button>
      </div>
      {entries && (
        <div className="flex flex-wrap gap-2 text-xs">
          {entries.map((e) => (
            <span key={e.text} className="rounded-full border border-border px-2 py-1">
              {e.text} → <i>{e.pronunciation}</i>
            </span>
          ))}
        </div>
      )}
      {sugg.length > 0 && (
        <div className="mt-3 space-y-1">
          <div className="text-xs text-ink-muted">Tick the ones to add, and fix the respelling if needed:</div>
          {sugg.map((x, i) => (
            <div key={x.text} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={x.on} onChange={() => setSugg((s) => s.map((y, j) => (j === i ? { ...y, on: !y.on } : y)))} />
              <span className="w-40 shrink-0 truncate font-medium">{x.text}</span>
              <input className="flex-1 rounded border border-border bg-page px-2 py-1" value={x.pronunciation} onChange={(e) => setSugg((s) => s.map((y, j) => (j === i ? { ...y, pronunciation: e.target.value } : y)))} />
              {x.why && <span className="hidden text-xs text-ink-muted md:inline">{x.why}</span>}
            </div>
          ))}
          <button className={primary} disabled={!!busy} onClick={add}>
            Add selected
          </button>
        </div>
      )}
      {(busy || msg) && <div className="mt-2 text-xs text-ink-muted">{busy || msg}</div>}
    </div>
  );
}
