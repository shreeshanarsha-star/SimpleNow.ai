// Presenter.ai — Act 2 (Meet the cast): turn a spoken introduction into memory.
// Extracts the speaker's name and "one task I wish I never had to do again",
// matches it to someone signed in on a phone, and saves it to their profile.
import { callTextModel } from "@/lib/aiClient";
import { db, json, ownerGuard } from "@/lib/presenter/server";
import { bestMatch } from "@/lib/presenter/people";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  const g = await ownerGuard();
  if (g instanceof Response) return g;
  const body = (await req.json().catch(() => ({}))) as { sessionId?: string; heard?: string };
  const sessionId = String(body.sessionId || "");
  const heard = String(body.heard || "").slice(0, 600).trim();
  if (!sessionId || heard.length < 4) return json({ matched: null });
  const sb = db();
  const { data: att } = await sb.from("presenter_attendees").select("id, display_name, person_id, data").eq("session_id", sessionId);
  const attendees = (att || []) as Array<{ id: string; display_name: string; person_id: string | null; data: Record<string, unknown> | null }>;

  let parsed: { name?: string | null; task?: string | null } = {};
  try {
    const out = await callTextModel(
      `A person in a meeting room just introduced themselves (speech-to-text, may contain errors). Names of people signed in today: ${attendees.map((a) => a.display_name).join(", ") || "(none)"}.
Transcript: "${heard}"
Return ONLY JSON: {"name": the speaker's own name as they said it (correct obvious speech-to-text errors using the list), or null if they did not clearly say their name; "task": the task they wish they never had to do again, in under 12 words, or null}.
If this is not a self-introduction, return {"name": null, "task": null}.`,
      120,
      12_000,
      process.env.PRESENTER_FALLBACK_MODEL || "gpt-4o"
    );
    parsed = JSON.parse(out.replace(/^[^{]*/, "").replace(/[^}]*$/, ""));
  } catch {
    return json({ matched: null });
  }
  if (!parsed.name) return json({ matched: null });

  // Only an unambiguous match counts: Shree never guesses a name.
  const who = bestMatch(parsed.name, attendees, (a) => a.display_name, 75);
  if (!who) return json({ matched: null, heardName: parsed.name });
  const task = parsed.task ? String(parsed.task).slice(0, 160) : null;
  await sb
    .from("presenter_attendees")
    .update({ data: { ...(who.data || {}), spokenIntro: task || heard.slice(0, 160), introAt: Date.now() } })
    .eq("id", who.id);
  const remember = (who.data as { remember?: boolean } | null)?.remember !== false;
  if (remember && who.person_id && task) {
    const { data: p } = await sb.from("presenter_people").select("profile").eq("id", who.person_id).maybeSingle();
    await sb
      .from("presenter_people")
      .update({ profile: { ...((p?.profile as object) || {}), lastIntro: task }, updated_at: new Date().toISOString() })
      .eq("id", who.person_id);
  }
  return json({ matched: who.display_name, task });
}
