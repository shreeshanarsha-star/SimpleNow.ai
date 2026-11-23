"use client";
// Presenter Studio — the simple way in: drop the deck, write instructions, press Create.
// Everything else (purpose, polls, quiz, script) is worked out from the deck and the
// instructions; the full editor stays one click away ("Edit details").
import Link from "next/link";
import { useRef, useState } from "react";
import { api, extractPages, jsonInit, openPdfData, uid } from "@/lib/studio/client";
import { INTENTS, PRESETS, normalizePlan, type Intent, type Plan, type Poll, type Preset, type QuizQ } from "@/lib/studio/types";

type Setup = {
  title?: string;
  intent?: string;
  purpose?: string;
  audience?: string;
  message?: string;
  closingLine?: string;
  outcome?: string;
  minutes?: number;
  timeOfDay?: string;
  eventDate?: string;
  preset?: string;
  presenterName?: string;
  rules?: string;
  mustSay?: string;
  avoid?: string;
  polls?: number;
  quiz?: number;
  qa?: boolean;
  voiceQuestions?: boolean;
  mode?: string;
};

const EXAMPLE = `e.g. 40-minute awareness session for our sales team on Friday evening. Keep it simple and friendly, no jargon. Two polls, a short quiz at the end, and take questions. Always end with: "Small steps, big wins."`;

export default function QuickCreate({ onCreated }: { onCreated?: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ id: string; code: string; title: string; summary: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const pick = (f: File | null | undefined) => {
    if (!f) return;
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") {
      setErr("Please upload a PDF. In PowerPoint or Google Slides: File → Download / Export → PDF.");
      return;
    }
    setErr("");
    setFile(f);
  };

  const create = async () => {
    if (!file) return setErr("Add your slides first (PDF).");
    setErr("");
    setDone(null);
    let id = "";
    try {
      setBusy("Reading your slides…");
      const buf = await file.arrayBuffer();
      const doc = await openPdfData(buf.slice(0));
      const texts = await extractPages(doc);
      if (!texts.length) throw new Error("No pages found in that PDF.");

      setBusy("Creating the presentation…");
      const made = await api<{ id: string }>("/api/studio/shows", jsonInit("POST", {}));
      id = made.id;
      const { show } = await api<{ show: { plan: Plan; code: string } }>(`/api/studio/shows/${id}`);
      const { signedUrl } = await api<{ signedUrl: string }>(`/api/studio/shows/${id}/deck`, { method: "POST" });
      const up = await fetch(signedUrl, { method: "PUT", headers: { "Content-Type": "application/pdf", "x-upsert": "true" }, body: file });
      if (!up.ok) throw new Error(`Upload failed (${up.status})`);

      let plan = normalizePlan(show.plan);
      plan.instructions = instructions.trim();
      plan.slides = texts.map((t, i) => ({ n: i + 1, text: t, notes: "" }));
      plan.deck = { name: file.name, pages: texts.length, uploadedAt: new Date().toISOString() };
      const ai = <T,>(body: Record<string, unknown>) => api<T>("/api/studio/ai", jsonInit("POST", { showId: id, plan, ...body }));

      setBusy("Understanding your instructions…");
      const { setup } = await ai<{ setup: Setup }>({ task: "setup" });
      plan = structuredClone(plan);
      const P = plan.purpose;
      if (setup.intent && setup.intent in INTENTS) P.intent = setup.intent as Intent;
      for (const k of ["purpose", "audience", "message", "closingLine", "outcome"] as const) if (typeof setup[k] === "string") P[k] = setup[k] as string;
      if (typeof setup.minutes === "number" && setup.minutes > 0) P.minutes = Math.round(setup.minutes);
      if (setup.timeOfDay === "morning" || setup.timeOfDay === "afternoon" || setup.timeOfDay === "evening") P.timeOfDay = setup.timeOfDay;
      if (setup.eventDate && /^\d{4}-\d{2}-\d{2}$/.test(setup.eventDate)) P.eventDate = setup.eventDate;
      if (setup.preset && setup.preset in PRESETS) plan.personality.preset = setup.preset as Preset;
      plan.personality.rules = setup.rules || "";
      plan.personality.mustSay = setup.mustSay || "";
      plan.personality.avoid = setup.avoid || "";
      if (setup.presenterName && setup.presenterName.length < 40) plan.presenter.name = setup.presenterName;
      plan.qa = { enabled: setup.qa !== false, auto: true, voice: setup.voiceQuestions !== false };
      plan.mode = setup.mode === "manual" ? "manual" : "assisted";
      const nPolls = Math.max(0, Math.min(5, Number(setup.polls ?? 2) || 0));
      const nQuiz = Math.max(0, Math.min(15, Number(setup.quiz ?? 0) || 0));
      plan.polls = { enabled: nPolls > 0, items: [] };
      plan.quiz = { ...plan.quiz, enabled: nQuiz > 0, items: [] };

      if (nPolls > 0 && texts.length > 1) {
        setBusy("Adding polls…");
        const { polls } = await ai<{ polls: Array<Omit<Poll, "key">> }>({ task: "polls", count: nPolls });
        plan = structuredClone(plan);
        plan.polls.items = (polls || [])
          .filter((x) => plan.slides.some((s) => s.n === x.afterSlide) && x.question && Array.isArray(x.options))
          .map((x) => ({ key: uid(), afterSlide: x.afterSlide, question: String(x.question), options: x.options.map(String).slice(0, 5), answer: typeof x.answer === "number" ? x.answer : null }))
          .sort((a, b) => a.afterSlide - b.afterSlide);
        plan.polls.enabled = plan.polls.items.length > 0;
      }
      if (nQuiz > 0) {
        setBusy("Writing the quiz…");
        const { quiz } = await ai<{ quiz: QuizQ[] }>({ task: "quiz", count: Math.max(3, nQuiz) });
        plan = structuredClone(plan);
        plan.quiz.items = (quiz || []).filter((q) => q.q && Array.isArray(q.options)).map((q) => ({ q: String(q.q), options: q.options.map(String).slice(0, 4), answer: Number(q.answer) || 0 }));
        plan.quiz.enabled = plan.quiz.items.length > 0;
      }

      const n = plan.slides.length;
      const script: Plan["script"] = { opening: "", slides: {}, closing: "", generatedAt: new Date().toISOString() };
      for (let from = 1; from <= n; from += 5) {
        const to = Math.min(n, from + 4);
        setBusy(`Writing what ${plan.presenter.name || "the presenter"} says: slides ${from}–${to} of ${n}…`);
        const parts = [from === 1 ? "opening" : null, to === n ? "closing" : null].filter(Boolean);
        const r = await api<{ slides?: Record<string, string>; opening?: string; closing?: string }>("/api/studio/ai", jsonInit("POST", { showId: id, plan, task: "script", from, to, parts }));
        Object.assign(script.slides, r.slides || {});
        if (r.opening) script.opening = r.opening;
        if (r.closing) script.closing = r.closing;
      }
      plan.script = script;

      setBusy("Saving…");
      const title = (setup.title || file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ")).slice(0, 120);
      await api(`/api/studio/shows/${id}`, jsonInit("PATCH", { plan, title, event_date: P.eventDate || null, status: "ready" }));
      const bits = [
        `${n} slides`,
        plan.polls.enabled ? `${plan.polls.items.length} poll${plan.polls.items.length === 1 ? "" : "s"}` : "no polls",
        plan.quiz.enabled ? `${plan.quiz.items.length}-question quiz` : "no quiz",
        plan.qa.enabled ? `Q&A${plan.qa.voice ? " (phones and voice)" : " (phones)"}` : "no Q&A",
        plan.mode === "assisted" ? "moves through slides by itself" : "you click through",
      ];
      setDone({ id, code: show.code, title, summary: bits.join(" · ") });
      setFile(null);
      setInstructions("");
      onCreated?.();
    } catch (e) {
      setErr(`${e instanceof Error ? e.message : "Something went wrong"}${id ? " The presentation was saved as a draft; open it to finish." : ""}`);
      if (id) onCreated?.();
    } finally {
      setBusy("");
    }
  };

  if (done) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return (
      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="text-lg font-semibold">Ready: {done.title}</div>
        <div className="mt-1 text-sm text-ink-muted">{done.summary}</div>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <a href={`/presenter/show/${done.id}`} target="_blank" className="rounded-lg bg-brand px-4 py-2 font-semibold text-white">
            ▶ Present (open on the TV)
          </a>
          <a href={`/presenter/show/${done.id}/remote`} target="_blank" className="rounded-lg border border-border px-4 py-2">
            Remote (your phone)
          </a>
          <Link href={`/tools/presenter/studio/${done.id}`} className="rounded-lg border border-border px-4 py-2">
            Edit details
          </Link>
          <button onClick={() => setDone(null)} className="rounded-lg px-4 py-2 text-ink-muted">
            Create another
          </button>
        </div>
        <div className="mt-3 text-xs text-ink-muted">
          Audience joins at {origin.replace(/^https?:\/\//, "")}/join/{done.code} (the QR is on the TV). Read through the script in Edit details if you want; it&apos;s ready as it is.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="text-lg font-semibold">New presentation</div>
      <div className="text-sm text-ink-muted">Add your slides, tell your presenter how you want it, press Create.</div>
      <div
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          pick(e.dataTransfer.files?.[0]);
        }}
        className="mt-4 cursor-pointer rounded-xl border-2 border-dashed border-border p-6 text-center text-sm hover:bg-page"
      >
        {file ? (
          <span>
            📄 <b>{file.name}</b> <span className="text-ink-muted">(click to change)</span>
          </span>
        ) : (
          <span className="text-ink-muted">Drop your slides here (PDF) or click to choose</span>
        )}
        <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      </div>
      <label className="mt-4 block text-sm font-medium">Instructions</label>
      <textarea
        className="mt-1 w-full rounded-xl border border-border bg-page p-3 text-sm"
        rows={5}
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        placeholder={EXAMPLE}
      />
      <div className="mt-1 text-xs text-ink-muted">Audience, length, tone, what to stress or avoid, polls, quiz, questions, the line to end on. Anything you leave out gets a sensible default.</div>
      {err && <div className="mt-3 rounded-lg bg-critical-wash px-3 py-2 text-sm">{err}</div>}
      <div className="mt-4 flex items-center gap-3">
        <button disabled={!!busy || !file} onClick={create} className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Creating…" : "Create"}
        </button>
        {busy && <span className="text-sm text-ink-muted">{busy}</span>}
      </div>
    </div>
  );
}
