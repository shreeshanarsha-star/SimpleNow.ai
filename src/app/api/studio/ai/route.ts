import { briefing, db, getShow, json, ownerGuard, parseJSON, studioAI } from "@/lib/studio/server";
import type { Plan } from "@/lib/studio/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Body = {
  task: "purpose" | "polls" | "quiz" | "script" | "line" | "answer";
  showId: string;
  plan?: Plan; // the wizard's unsaved plan (preferred over the stored one)
  from?: number;
  to?: number;
  parts?: Array<"opening" | "closing">;
  count?: number;
  target?: string; // "opening" | "closing" | slide number
  instruction?: string;
  question?: string;
  questionId?: number;
};

const deckText = (plan: Plan, max = 14000) =>
  plan.slides
    .map((s) => `--- Slide ${s.n} ---\n${s.text}${s.notes ? `\nNOTES: ${s.notes}` : ""}`)
    .join("\n")
    .slice(0, max);

export async function POST(req: Request) {
  const g = await ownerGuard();
  if (g instanceof Response) return g;
  const b = (await req.json().catch(() => null)) as Body | null;
  if (!b?.task || !b.showId) return json({ error: "Missing task" }, 400);
  const show = await getShow(b.showId);
  if (!show) return json({ error: "Not found" }, 404);
  const plan = b.plan || show.plan;
  try {
    switch (b.task) {
      case "purpose": {
        const out = await studioAI(
          `Read this presentation deck and suggest how to frame the live session. Use only what the deck says.\n\n${deckText(plan)}\n\nReturn ONLY JSON: {"intent": one of "awareness","training","induction","townhall","sales","workshop","other", "purpose": "one sentence: why this session exists", "audience": "who it is for, short", "message": "the single ultimate message people must remember, one sentence", "closingLine": "a memorable closing line, one or two sentences", "outcome": "what people should do after, one sentence", "minutes": number}`,
          800
        );
        return json({ purpose: parseJSON(out) });
      }
      case "polls": {
        const n = Math.min(5, Math.max(1, b.count || 2));
        const out = await studioAI(
          `${briefing(plan)}\n\nDECK:\n${deckText(plan)}\n\nSuggest ${n} live audience poll(s) that make people think about the content, each placed right after the slide it relates to. Prefer scenario or opinion questions; give a correct answer only when there truly is one in the deck. 2-4 short options each.\nReturn ONLY JSON: [{"afterSlide": number, "question": "...", "options": ["..",".."], "answer": index or null}]`,
          1200
        );
        return json({ polls: parseJSON(out) });
      }
      case "quiz": {
        const n = Math.min(30, Math.max(3, b.count || 8));
        const out = await studioAI(
          `${briefing(plan)}\n\nDECK:\n${deckText(plan)}\n\nWrite a ${n}-question multiple-choice quiz based ONLY on facts in this deck. Short questions, 4 short options, exactly one correct. Vary the position of the correct answer.\nReturn ONLY JSON: [{"q": "...", "options": ["a","b","c","d"], "answer": 0-3}]`,
          Math.min(4000, 250 * n + 300)
        );
        return json({ quiz: parseJSON(out) });
      }
      case "script": {
        const from = Math.max(1, b.from || 1);
        const to = Math.min(plan.slides.length, b.to || plan.slides.length);
        const range = plan.slides.filter((s) => s.n >= from && s.n <= to);
        const pollOn = new Set(plan.polls.enabled ? plan.polls.items.map((p) => p.afterSlide) : []);
        const parts = b.parts || [];
        const slidesTxt = range
          .map((s) => `--- Slide ${s.n} of ${plan.slides.length}${pollOn.has(s.n) ? " [A POLL FOLLOWS THIS SLIDE: you may end with one short line that a quick poll is coming on their phones]" : " [no poll here: do not mention polls or voting]"} ---\n${s.text}${s.notes ? `\nPRESENTER NOTES (follow any DIRECTION, never read brackets out): ${s.notes}` : ""}`)
          .join("\n");
        const extra = [
          parts.includes("opening") ? `"opening": a 25-45 second opening: greet the room once (right greeting for the time of day), introduce yourself as ${plan.presenter.name || "the presenter"} in one or two warm sentences, say what the session is for and that their phones are part of it${plan.quiz.enabled ? " (there is a quiz)" : ""}${plan.polls.enabled && plan.polls.items.length ? " (there are polls)" : ""}${plan.qa.enabled ? " (they can ask questions on their phones)" : ""}.` : "",
          parts.includes("closing") ? `"closing": a 30-45 second closing that sums up the ultimate message and the desired outcome, thanks the audience, and ENDS with this exact closing line word for word: "${plan.purpose.closingLine || "Thank you."}"` : "",
        ].filter(Boolean);
        const out = await studioAI(
          `${briefing(plan)}\n\nWrite what the presenter says for each slide below: explain the slide simply and naturally (about 40-110 words each, longer only if the slide is dense), connect to the previous slide where natural, never repeat a greeting after the opening. The opening has ALREADY greeted the room and introduced you, so on every slide (including slide 1) do NOT say hello, welcome, good morning, or "I'm ${plan.presenter.name || "the presenter"}"; just start explaining. Only the final slide may sound like wrapping up.\n\n${slidesTxt}\n\n${extra.length ? `Also write:\n${extra.join("\n")}\n\n` : ""}Return ONLY JSON: {"slides": {"<slide number>": "spoken text", ...}${parts.includes("opening") ? ', "opening": "..."' : ""}${parts.includes("closing") ? ', "closing": "..."' : ""}}`,
          Math.min(4000, 220 * range.length + 600)
        );
        return json(parseJSON(out));
      }
      case "line": {
        const t = b.target || "";
        const slide = plan.slides.find((s) => String(s.n) === t);
        const current = t === "opening" ? plan.script.opening : t === "closing" ? plan.script.closing : plan.script.slides[t] || "";
        const pollHere = slide && plan.polls.enabled && plan.polls.items.some((p) => p.afterSlide === slide.n);
        const out = await studioAI(
          `${briefing(plan)}\n\n${slide ? `SLIDE ${slide.n}:\n${slide.text}${slide.notes ? `\nNOTES: ${slide.notes}` : ""}\n${pollHere ? "(A poll follows this slide.)" : "(No poll here: do not mention polls.)"}` : t === "closing" ? `This is the CLOSING. It must end with this exact line: "${plan.purpose.closingLine}"` : "This is the OPENING."}\n\nCURRENT TEXT: ${current || "(none)"}\nCHANGE REQUEST: ${b.instruction || "Rewrite it to be clearer and more natural."}\n\nReturn ONLY the new spoken text.`,
          700
        );
        return json({ text: out.replace(/^["']|["']$/g, "").trim() });
      }
      case "answer": {
        const q = (b.question || "").trim().slice(0, 500);
        if (!q) return json({ error: "Empty question" }, 400);
        const out = await studioAI(
          `${briefing(plan)}\n\nDECK (your only source of facts):\n${deckText(plan, 16000)}\n\nAn audience member asks: "${q}"\nAnswer out loud in 2-4 short sentences (about 20-30 seconds). Use ONLY facts in the deck. If the deck doesn't cover it, say honestly that you don't have verified details on that today and offer the closest related point from the session, or suggest following up with the presenter. Never guess numbers or company facts. Return ONLY the spoken answer.`,
          400,
          25_000
        );
        const text = out.replace(/^["']|["']$/g, "").trim();
        if (b.questionId) await db().from("presenter_show_answers").update({ draft: text, status: "drafted" }).eq("id", b.questionId).eq("show_id", b.showId);
        return json({ text });
      }
    }
    return json({ error: "Unknown task" }, 400);
  } catch (err) {
    console.error("[studio ai]", b.task, err);
    return json({ error: err instanceof Error ? `AI failed: ${err.message}` : "AI failed" }, 502);
  }
}
