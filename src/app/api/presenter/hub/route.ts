// Presenter.ai — PUBLIC audience API for /p/<code> (no login; identified by a
// random device token kept on the phone). Never returns quiz answers or
// anyone else's scores.
import { db, json } from "@/lib/presenter/server";
import { ASSESSMENT, QUIZ, QUIZ_TIMING, levelFor, pollByKey, quizClock } from "@/lib/presenter/content";
import { bestMatch } from "@/lib/presenter/people";
import { QUIZ_KEY, attendeeByToken, cleanText, hubOf, nameKey, phoneAnswer, sessionByCode } from "@/lib/presenter/hub";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GRACE_MS = 1500;
const MAX_QUESTIONS_PER_PERSON = 8;

export async function GET(req: Request) {
  const u = new URL(req.url);
  const session = await sessionByCode(u.searchParams.get("code") || "");
  if (!session) return json({ error: "Session not found. Check the code." }, 404);
  const hub = hubOf(session);
  const me = await attendeeByToken(session.id, u.searchParams.get("t") || "");
  const sb = db();

  let mine: { quiz: string[]; assess: Record<string, number>; polls: Record<string, number>; commit: string | null; quizCorrect: number } = {
    quiz: [],
    assess: {},
    polls: {},
    commit: null,
    quizCorrect: 0,
  };
  let myQuestions: Array<{ id: string; text: string; answer: string | null }> = [];
  if (me) {
    const [{ data: r }, { data: q }] = await Promise.all([
      sb.from("presenter_responses").select("kind, item_key, value").eq("attendee_id", me.id),
      sb.from("presenter_questions").select("id, text, answer").eq("attendee_id", me.id).order("created_at", { ascending: false }),
    ]);
    for (const x of r || []) {
      const v = (x.value || {}) as Record<string, unknown>;
      if (x.kind === "quiz") {
        mine.quiz.push(x.item_key);
        if (v.correct) mine.quizCorrect++;
      } else if (x.kind === "assess") mine.assess[x.item_key] = Number(v.score) || 0;
      else if (x.kind === "poll") mine.polls[x.item_key] = Number(v.choice);
      else if (x.kind === "commit") mine.commit = String(v.text || "");
    }
    myQuestions = (q || []) as typeof myQuestions;
  }

  // Levels and quiz score are private, and only shown after the finale reveal.
  const revealed = hub.phase === "closed" || (hub.phase === "finale" && (hub.finaleStep || 0) >= 4);
  const assessTotal = Object.values(mine.assess).reduce((a, b) => a + b, 0);
  const assessDone = Object.keys(mine.assess).length >= ASSESSMENT.length;
  const badge = me && revealed ? { level: assessDone ? levelFor(assessTotal).name : null, quiz: mine.quizCorrect, quizOf: QUIZ.length } : null;
  if (!revealed) mine = { ...mine, quizCorrect: 0 };

  return json({
    session: { title: session.title, code: session.code },
    hub: {
      phase: hub.phase,
      quiz: hub.quiz || null,
      poll: hub.poll || null,
      pollReveal: typeof hub.pollReveal === "number" ? hub.pollReveal : null,
      finaleStep: hub.finaleStep || 0,
      flyerUrl: hub.flyerUrl || null,
    },
    me: me ? { name: me.display_name, ...mine } : null,
    badge,
    myQuestions,
    // Slides PDF for the take-home kit, only once the session has closed.
    deckUrl:
      hub.phase === "closed" && me
        ? (await sb.storage.from("presenter").createSignedUrl(`${session.id}/deck.pdf`, 60 * 60 * 24 * 7)).data?.signedUrl || null
        : null,
    serverNow: Date.now(),
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const session = await sessionByCode(String(body.code || ""));
  if (!session) return json({ error: "Session not found" }, 404);
  const token = cleanText(body.t, 80);
  if (token.length < 16) return json({ error: "Missing device token" }, 400);
  const sb = db();
  const action = String(body.action || "");

  if (action === "join") {
    const name = cleanText(body.name, 40);
    if (name.length < 2) return json({ error: "Please enter your name" }, 400);
    const intro = cleanText(body.intro, 160) || null;
    const remember = body.remember !== false;
    // Link to someone Shreesha already described, tolerating small spelling
    // differences ("Priya S" / "Priya Sharma" / "Preeya"). A unique match only.
    const key = nameKey(name);
    const { data: everyone } = await sb.from("presenter_people").select("id, display_name, name_key, profile");
    const people = (everyone || []) as Array<{ id: string; display_name: string; name_key: string; profile: Record<string, unknown> | null }>;
    const existing = people.find((p) => p.name_key === key) || bestMatch(name, people, (p) => p.display_name);
    let personId: string | null = existing?.id || null;
    if (remember) {
      if (existing) {
        const profile = (existing.profile || {}) as Record<string, unknown>;
        const sessions = Array.from(new Set([...((profile.sessions as string[]) || []), session.code]));
        await sb
          .from("presenter_people")
          .update({ remember: true, profile: { ...profile, sessions, ...(intro ? { lastIntro: intro } : {}) }, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
      } else {
        const { data: p } = await sb
          .from("presenter_people")
          .insert({ display_name: name, name_key: key, remember: true, profile: { sessions: [session.code], ...(intro ? { lastIntro: intro } : {}) } })
          .select("id")
          .single();
        personId = p?.id || null;
      }
    }
    const { data, error } = await sb
      .from("presenter_attendees")
      .upsert({ session_id: session.id, device_token: token, display_name: name, intro, person_id: personId, data: { remember } }, { onConflict: "session_id,device_token" })
      .select("id")
      .single();
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, id: data.id });
  }

  const me = await attendeeByToken(session.id, token);
  if (!me) return json({ error: "Please sign in first" }, 401);
  const hub = hubOf(session);

  if (action === "quiz") {
    const now = Date.now();
    const idx = Number(body.idx);
    const choice = Number(body.choice);
    const clock = quizClock(hub.quiz, now - GRACE_MS);
    const clockNow = quizClock(hub.quiz, now);
    // Accept the answer if the question is open now, or was open within the grace window.
    const open = (clockNow.status === "answer" && clockNow.idx === idx) || (clock.status === "answer" && clock.idx === idx);
    if (hub.phase !== "quiz" || !open || !(choice >= 0 && choice < 4) || !(idx >= 0 && idx < QUIZ.length)) return json({ error: "Too late for that one" }, 409);
    const ms = Math.max(0, Math.min(QUIZ_TIMING.answerMs, now - (hub.quiz!.start + idx * (QUIZ_TIMING.answerMs + QUIZ_TIMING.revealMs))));
    const { error } = await sb
      .from("presenter_responses")
      .insert({ session_id: session.id, attendee_id: me.id, kind: "quiz", item_key: `q${idx}`, value: { choice, correct: choice === QUIZ_KEY[idx] }, ms });
    if (error && !String(error.message).includes("duplicate")) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  if (action === "assess") {
    const idx = Number(body.idx);
    const score = Number(body.score);
    if (!(idx >= 0 && idx < ASSESSMENT.length) || !(score >= 1 && score <= 4)) return json({ error: "Invalid answer" }, 400);
    const { error } = await sb
      .from("presenter_responses")
      .upsert({ session_id: session.id, attendee_id: me.id, kind: "assess", item_key: `a${idx}`, value: { score } }, { onConflict: "attendee_id,kind,item_key" });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  if (action === "poll") {
    const key = String(body.key || "");
    const poll = pollByKey(key);
    const choice = Number(body.choice);
    if (!poll || hub.phase !== "poll" || hub.poll !== key || !(choice >= 0 && choice < poll.options.length)) return json({ error: "This poll is closed" }, 409);
    const { error } = await sb
      .from("presenter_responses")
      .upsert({ session_id: session.id, attendee_id: me.id, kind: "poll", item_key: key, value: { choice } }, { onConflict: "attendee_id,kind,item_key" });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  if (action === "commit") {
    const text = cleanText(body.text, 200);
    if (text.length < 3) return json({ error: "Write your one task" }, 400);
    const { error } = await sb
      .from("presenter_responses")
      .upsert({ session_id: session.id, attendee_id: me.id, kind: "commit", item_key: "commit", value: { text } }, { onConflict: "attendee_id,kind,item_key" });
    if (error) return json({ error: error.message }, 500);
    if (me.person_id) {
      const { data: p } = await sb.from("presenter_people").select("profile").eq("id", me.person_id).maybeSingle();
      await sb.from("presenter_people").update({ profile: { ...((p?.profile as object) || {}), lastCommitment: text } }).eq("id", me.person_id);
    }
    return json({ ok: true });
  }

  if (action === "ask") {
    const text = cleanText(body.text, 400);
    if (text.length < 5) return json({ error: "Type a question" }, 400);
    const { count } = await sb.from("presenter_questions").select("id", { count: "exact", head: true }).eq("attendee_id", me.id);
    if ((count || 0) >= MAX_QUESTIONS_PER_PERSON) return json({ error: "That's the limit for tonight. Ask Shreesha in Q&A!" }, 429);
    const { data: row, error } = await sb
      .from("presenter_questions")
      .insert({ session_id: session.id, attendee_id: me.id, source: "phone", text, votes: 1 })
      .select("id")
      .single();
    if (error) return json({ error: error.message }, 500);
    let answer = "";
    try {
      answer = await phoneAnswer(session.id, text);
    } catch {
      answer = "Good question. It's noted for Q&A; Shree and Shreesha will pick it up.";
    }
    await sb.from("presenter_questions").update({ answer }).eq("id", row.id);
    return json({ ok: true, id: row.id, answer });
  }

  return json({ error: "Unknown action" }, 400);
}
