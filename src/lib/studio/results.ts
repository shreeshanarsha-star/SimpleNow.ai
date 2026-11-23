// Presenter Studio — read the audience's answers for one show (server-only).
import { db } from "@/lib/presenter/server";
import { pollTally, quizRanking, type QuizAnswer } from "./engine";
import type { Plan } from "./types";

export async function showResults(showId: string, plan: Plan) {
  const sb = db();
  const [{ data: people }, { data: answers }] = await Promise.all([
    sb.from("presenter_show_people").select("id,name,team,created_at").eq("show_id", showId).order("created_at"),
    sb.from("presenter_show_answers").select("id,person_id,kind,item,choice,text,ms,status,draft,created_at").eq("show_id", showId).order("id"),
  ]);
  const names = new Map((people || []).map((p) => [p.id as string, p.name as string]));
  const rows = answers || [];
  const polls: Record<string, number[]> = {};
  for (const p of plan.polls.items) polls[p.key] = pollTally(p, rows.filter((a) => a.kind === "poll" && a.item === p.key).map((a) => a.choice as number));
  const qa: QuizAnswer[] = rows
    .filter((a) => a.kind === "quiz")
    .map((a) => ({ person: a.person_id as string, name: names.get(a.person_id as string) || "Someone", idx: Number(a.item), choice: a.choice as number, ms: (a.ms as number) || 0 }));
  const ranking = quizRanking(qa, plan.quiz.items.map((q) => q.answer));
  const quizCounts: Record<string, number> = {};
  for (const a of qa) quizCounts[a.idx] = (quizCounts[a.idx] || 0) + 1;
  const questions = rows
    .filter((a) => a.kind === "ask")
    .map((a) => ({ id: a.id as number, text: (a.text as string) || "", name: a.item === "voice" ? "Room (voice)" : a.item === "remote" ? "Typed on remote" : names.get(a.person_id as string) || "Someone", status: a.status as string, draft: (a.draft as string) || "", at: a.created_at as string }));
  return { people: people || [], polls, ranking, quizCounts, questions };
}
