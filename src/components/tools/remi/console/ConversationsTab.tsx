"use client";

import { useEffect, useState } from "react";
import { findLanguage } from "@/lib/remi/languages";
import { api, Card, Empty, fmtDate } from "./ui";

type S = { id: string; channel: string; language: string | null; turn_count: number; consent: boolean; lead_id: string | null; summary: string | null; started_at: string; ended_at: string | null };
type M = { id: number; role: string; content: string; language: string | null; topic: string | null; meta: { justification?: string; sources?: { title: string }[] } | null; created_at: string };

export default function ConversationsTab({ wsId, openLead }: { wsId: string; openLead: (id: string) => void }) {
  const [sessions, setSessions] = useState<S[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<M[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<{ sessions: S[] }>(`/api/remi/w/${wsId}/conversations`).then((d) => setSessions(d.sessions)).catch((e) => setErr(e.message));
  }, [wsId]);
  useEffect(() => {
    if (!sel) return;
    api<{ messages: M[] }>(`/api/remi/w/${wsId}/conversations?session=${sel}`).then((d) => setMsgs(d.messages)).catch(() => setMsgs([]));
  }, [wsId, sel]);

  if (err) return <Card><div className="text-sm text-critical">{err}</div></Card>;
  if (!sessions) return <div className="text-sm text-ink-muted p-6">Loading…</div>;
  if (!sessions.length) return <Card><Empty icon="chat" title="No conversations yet">Open the Test & Share tab to try Dr.Remi, then share the link or run the kiosk.</Empty></Card>;
  const current = sessions.find((s) => s.id === sel);

  return (
    <div className="grid lg:grid-cols-[320px_1fr] gap-4">
      <Card className="max-h-[70vh] overflow-y-auto">
        <ul className="divide-y divide-border -mx-1">
          {sessions.map((s) => (
            <li key={s.id}>
              <button onClick={() => setSel(s.id)} className={`w-full text-left px-2 py-2.5 rounded-lg ${sel === s.id ? "bg-brand-wash" : "hover:bg-page"}`}>
                <div className="flex justify-between text-[12px]">
                  <span className="font-semibold">{findLanguage(s.language)?.name || s.language || "—"} · {s.channel}</span>
                  <span className="text-ink-muted text-[11px]">{fmtDate(s.started_at)}</span>
                </div>
                <div className="text-[11px] text-ink-muted mt-0.5 line-clamp-2">{s.summary || `${s.turn_count} turns${s.lead_id ? " · lead" : ""}${s.consent ? " · consent" : ""}`}</div>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <Card title={current ? `Conversation · ${fmtDate(current.started_at)}` : "Select a conversation"} icon="chat" action={current?.lead_id ? <button onClick={() => openLead(current.lead_id!)} className="text-[12px] font-semibold text-brand">Open lead →</button> : null}>
        {current ? (
          <div className="space-y-2 text-[12.5px] max-h-[62vh] overflow-y-auto">
            {current.summary && <div className="bg-brand-wash/60 border border-brand/20 rounded-xl p-2.5 text-[12px]"><b>Summary: </b>{current.summary}</div>}
            {msgs.map((m) => (
              <div key={m.id} className={m.role === "user" ? "text-right" : ""}>
                <div dir="auto" className={`inline-block max-w-[85%] rounded-xl px-3 py-2 text-left ${m.role === "user" ? "bg-brand text-white" : "bg-page border border-border"}`}>{m.content}</div>
                <div className="text-[10px] text-ink-muted mt-0.5">
                  {m.language}{m.topic ? ` · ${m.topic}` : ""}
                  {m.meta?.sources?.length ? ` · sources: ${m.meta.sources.map((s) => s.title).join(", ")}` : ""}
                </div>
                {m.meta?.justification && <div className="text-[10.5px] text-good-text">✓ {m.meta.justification}</div>}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[12px] text-ink-muted">Pick a conversation on the left to read the full transcript.</div>
        )}
      </Card>
    </div>
  );
}
