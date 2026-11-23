import { briefing, canUse, db, getShow, json, parseJSON, studioAI, studioGuard } from "@/lib/studio/server";
import type { Plan } from "@/lib/studio/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Body = {
  task: "purpose" | "polls" | "quiz" | "script" | "line" | "answer" | "pronounce" | "setup";
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
  recent?: Array<{ q: string; a: string }>; // earlier Q&A in this session, for follow-ups
  said?: string; // a bridge line the presenter has just said while this answer was prepared
};

const deckText = (plan: Plan, max = 14000) =>
  plan.slides
    .map((s) => `--- Slide ${s.n} ---\n${s.text}${s.notes ? `\nNOTES: ${s.notes}` : ""}`)
    .join("\n")
    .slice(0, max);

export async function POST(req: Request) {
  const g = await studioGuard(req);
  if (g instanceof Response) return g;
  const b = (await req.json().catch(() => null)) as Body | null;
  if (!b?.task || !b.showId) return json({ error: "Missing task" }, 400);
  const show = await getShow(b.showId);
  if (!show || !canUse(show, g)) return json({ error: "Not found" }, 404);
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
        const recent = (b.recent || []).slice(-4).map((x) => `Q: ${x.q}\nA: ${x.a}`).join("\n");
        const out = await studioAI(
          `${briefing(plan)}

DECK (your only source of facts):
${deckText(plan, 16000)}
${recent ? `\nEARLIER QUESTIONS IN THIS Q&A (for follow-ups like "what about that"):\n${recent}\n` : ""}
A person in the room just asked you (typed on a phone, or heard by a microphone, so silently fix obvious typos or mishearing and answer what they meant): "${q}"

${b.said ? `You have JUST said "${b.said.slice(0, 120)}" to buy a moment, so do NOT thank them or say "good question" again; go straight on. ` : ""}Answer the way a warm, confident human expert answers live on stage: talk to them, not about them. Start with a brief natural acknowledgement or a short restatement so the room knows the question (for example "Good one: how do we start safely?" or "So, the question is whether this replaces jobs."), then answer in 2 or 3 short spoken sentences: about 45 to 60 words in total, 15 to 20 seconds. Do not repeat the ultimate message or closing line unless it truly answers the question. Sound like conversation, not a report: contractions, one clear point, a concrete example from the deck if there is one.
Use ONLY facts in the deck and the instructions. If they don't cover it, don't guess: say kindly that you don't have verified details on that today, give the closest helpful point from the session if there is one, and say the team will follow up. Never invent numbers, names or company facts. If it's not a question (a comment or thanks), respond briefly and warmly. If it's rude or off-topic, steer back politely in one sentence.
You may start one sentence with a cue tag such as [warm], [curious] or [happy].
Return ONLY JSON: {"say": "what you say out loud", "covered": true if the deck or instructions answered it, false otherwise}`,
          450,
          25_000
        );
        let say = "";
        let covered = true;
        try {
          const j = parseJSON<{ say?: string; covered?: boolean }>(out);
          say = String(j.say || "").trim();
          covered = j.covered !== false;
        } catch {
          say = out.replace(/^["']|["']$/g, "").trim();
        }
        if (!say) throw new Error("Empty answer");
        // A bridge line was already spoken: drop a second "good question" at the start.
        if (b.said) say = say.replace(/^((?:\[[a-z]+\]\s*)?)(?:(?:good|great|nice|interesting|excellent)\s+(?:one|question)|thanks? (?:you )?for (?:asking|that)[^.!:]*)[.!:,]?\s*/i, "$1").trim().replace(/^((?:\[[a-z]+\]\s*)?)([a-z])/, (_m, cue: string, c: string) => cue + c.toUpperCase());
        if (b.questionId) await db().from("presenter_show_answers").update({ draft: say }).eq("id", b.questionId).eq("show_id", b.showId);
        return json({ text: say, covered });
      }
      case "setup": {
        // The simple Create page: turn the presenter's free-text instructions into settings.
        const out = await studioAI(
          `A presenter uploaded this slide deck and wrote these instructions for their AI co-presenter.

INSTRUCTIONS: ${(plan.instructions || "(none: use sensible defaults)").slice(0, 3000)}

DECK:
${deckText(plan, 12000)}

Work out the session settings. Follow the instructions exactly where they say something; otherwise choose sensible defaults from the deck (polls on with 2 polls, quiz off, Q&A on). Use only what the deck and instructions say for facts.
Return ONLY JSON: {"title": "short title", "intent": one of "awareness","training","induction","townhall","sales","workshop","other", "purpose": "one sentence", "audience": "short", "message": "the single ultimate message, one sentence", "closingLine": "a memorable closing line (use the instructions' own words if they give one)", "outcome": "what people should do after, one sentence", "minutes": number, "timeOfDay": "morning"|"afternoon"|"evening", "eventDate": "YYYY-MM-DD" or "", "preset": "warm"|"formal"|"energetic"|"calm", "presenterName": "the presenter's name if the instructions give one, else empty", "rules": "the presenter's rules in short sentences", "mustSay": "anything they must say", "avoid": "words or topics to avoid", "polls": number 0-5, "quiz": number 0 or 3-15, "qa": true|false, "voiceQuestions": true|false (false only if they say questions should be typed only), "mode": "assisted" (moves through slides by itself) or "manual" (only if they say they will click through)}`,
          1200
        );
        return json({ setup: parseJSON(out) });
      }
      case "pronounce": {
        const out = await studioAI(
          `List words in this deck that a text-to-speech voice is likely to mispronounce: brand and product names, company names, people's names, acronyms that should be spelled out letter by letter, and Indian or other non-English terms. Skip ordinary English words and well-known brands (Google, Microsoft, OpenAI). For each, give a simple English "sounds like" respelling using hyphens between syllables (no IPA, no brackets), or for an acronym the letters separated by dots and spaces (for example "N. R. P. L."). Only include words actually in the deck. At most 25.\n\nDECK:\n${deckText(plan, 12000)}\n\nReturn ONLY JSON: [{"text": "word as written", "pronunciation": "sounds-like respelling", "why": "short reason"}]`,
          1200
        );
        return json({ terms: parseJSON(out) });
      }
    }
    return json({ error: "Unknown task" }, 400);
  } catch (err) {
    console.error("[studio ai]", b.task, err);
    return json({ error: err instanceof Error ? `AI failed: ${err.message}` : "AI failed" }, 502);
  }
}
