"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { api, Bars, Btn, Card, Empty, Stat, TierBadge, canAdmin, fmtDate, type Role } from "./ui";

type Analytics = {
  days: number;
  funnel: { conversations: number; leads: number; qualified: number; meetings: number; quotations: number; orders: number; revenue: number };
  tiers: Record<string, number>;
  avgTurns: number;
  topProducts: { label: string; count: number }[];
  topObjections: { label: string; count: number }[];
  topRegions: { label: string; count: number }[];
  topLanguages: { label: string; count: number }[];
  topTopics: { label: string; count: number }[];
  channels: { label: string; count: number }[];
  daily: { date: string; conversations: number; leads: number }[];
  hotLeads: { id: string; name: string | null; company: string | null; score: number; tier: string; country: string | null; status: string; product_interests: string[] }[];
  followUps: { id: string; name: string | null; company: string | null; tier: string; score: number; follow_up_at: string | null; callback_requested: boolean; callback_time: string | null }[];
  gaps: { id: string; question: string; language: string | null; created_at: string }[];
  safety: { id: string; description: string; product: string | null; language: string | null; status: string; created_at: string }[];
};

type Insights = {
  headline?: string;
  conversion?: string;
  messaging?: string[];
  positioning?: string[];
  content_gaps?: string[];
  objection_playbook?: { objection: string; best_response: string }[];
  market_focus?: string[];
  unmet_needs?: string[];
};

function pct(a: number, b: number) {
  return b ? `${Math.round((a / b) * 100)}%` : "—";
}

function Spark({ data }: { data: { conversations: number; leads: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.conversations));
  return (
    <div className="flex gap-[2px] h-16">
      {data.map((d, i) => (
        <div key={i} className="flex-1 h-full flex flex-col justify-end gap-[1px]" title={`${d.conversations} conversations, ${d.leads} leads`}>
          <div className="rounded-t-sm bg-brand/25" style={{ height: `${(d.conversations / max) * 100}%` }} />
          <div className="rounded-sm bg-brand" style={{ height: `${(d.leads / max) * 100}%` }} />
        </div>
      ))}
    </div>
  );
}

export default function DashboardTab({ wsId, role, openLead, goTab }: { wsId: string; role: Role; openLead: (id: string) => void; goTab: (t: string) => void }) {
  const [days, setDays] = useState(30);
  const [a, setA] = useState<Analytics | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ins, setIns] = useState<Insights | null>(null);
  const [insBusy, setInsBusy] = useState(false);
  const [insErr, setInsErr] = useState<string | null>(null);

  const load = useCallback(() => {
    setErr(null);
    api<Analytics>(`/api/remi/w/${wsId}/analytics?days=${days}`).then(setA).catch((e) => setErr(e.message));
  }, [wsId, days]);
  useEffect(load, [load]);

  async function runInsights() {
    setInsBusy(true);
    setInsErr(null);
    try {
      const r = await api<{ insights: Insights }>(`/api/remi/w/${wsId}/insights`, { method: "POST" });
      setIns(r.insights);
    } catch (e) {
      setInsErr((e as Error).message);
    } finally {
      setInsBusy(false);
    }
  }

  async function resolve(kind: "gap" | "safety", id: string, status: string) {
    await api(`/api/remi/w/${wsId}/gaps`, { method: "PATCH", json: kind === "gap" ? { gap_id: id, status } : { safety_id: id, status } });
    load();
  }

  if (err) return <Card><div className="text-critical text-sm">{err}</div></Card>;
  if (!a) return <div className="text-sm text-ink-muted p-6">Loading dashboard…</div>;
  const f = a.funnel;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-[12px] text-ink-muted">Sales intelligence · excludes test-console chats</div>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => setDays(d)} className={`h-7 px-3 rounded-full text-[11px] font-semibold border ${days === d ? "bg-brand text-white border-brand" : "bg-surface border-border text-ink-muted"}`}>
              {d} days
            </button>
          ))}
        </div>
      </div>

      {!!a.safety.length && (
        <Card title={`Possible adverse events / complaints (${a.safety.length})`} icon="alert" className="border-critical/40">
          <ul className="space-y-2">
            {a.safety.map((s) => (
              <li key={s.id} className="text-[12px] flex items-start justify-between gap-3 bg-critical-wash/50 rounded-xl p-2.5">
                <div>
                  <div className="font-semibold">{s.product || "Product not stated"} · {fmtDate(s.created_at)}</div>
                  <div className="text-ink-2">{s.description}</div>
                </div>
                {canAdmin(role) && (
                  <div className="flex gap-1 flex-shrink-0">
                    {s.status === "open" && <Btn onClick={() => resolve("safety", s.id, "reviewing")}>Reviewing</Btn>}
                    <Btn onClick={() => resolve("safety", s.id, "closed")}>Close</Btn>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2.5">
        <Stat label="Conversations" value={f.conversations} hint={`avg ${a.avgTurns} turns`} />
        <Stat label="Leads" value={f.leads} hint={`${pct(f.leads, f.conversations)} of chats`} />
        <Stat label="Qualified (contact + consent)" value={f.qualified} hint={pct(f.qualified, f.leads)} tone="good" />
        <Stat label="Meetings" value={f.meetings} hint={pct(f.meetings, f.qualified)} />
        <Stat label="Quotations" value={f.quotations} hint={pct(f.quotations, f.meetings)} />
        <Stat label="Orders won" value={f.orders} hint={pct(f.orders, f.quotations)} tone="good" />
        <Stat label="Revenue (won)" value={f.revenue ? f.revenue.toLocaleString("en-IN") : "—"} hint="from deal values" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Activity" icon="chart" className="lg:col-span-2">
          <Spark data={a.daily} />
          <div className="flex gap-4 text-[10.5px] text-ink-muted mt-2">
            <span><span className="inline-block w-2 h-2 rounded-sm bg-brand/25 mr-1" />Conversations</span>
            <span><span className="inline-block w-2 h-2 rounded-sm bg-brand mr-1" />Leads</span>
            <span className="ml-auto">
              <TierBadge tier="hot" /> {a.tiers.hot || 0} <span className="mx-1" /> <TierBadge tier="warm" /> {a.tiers.warm || 0} <span className="mx-1" /> <TierBadge tier="cold" /> {a.tiers.cold || 0}
            </span>
          </div>
        </Card>
        <Card title="Follow-ups & call-backs" icon="calendar">
          {a.followUps.length ? (
            <ul className="space-y-1.5">
              {a.followUps.slice(0, 7).map((l) => {
                const overdue = l.follow_up_at && new Date(l.follow_up_at).getTime() < Date.now();
                return (
                  <li key={l.id}>
                    <button onClick={() => openLead(l.id)} className="w-full text-left text-[12px] flex items-center justify-between gap-2 hover:text-brand">
                      <span className="truncate">{l.name || l.company || "Visitor"}</span>
                      <span className={`text-[10.5px] whitespace-nowrap ${overdue ? "text-critical font-semibold" : "text-ink-muted"}`}>
                        {l.follow_up_at ? fmtDate(l.follow_up_at) : l.callback_requested ? `Call-back${l.callback_time ? `: ${l.callback_time}` : ""}` : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="text-[11.5px] text-ink-muted">Nothing pending.</div>
          )}
        </Card>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card title="Product demand" icon="box"><Bars items={a.topProducts} /></Card>
        <Card title="Regional demand" icon="globe"><Bars items={a.topRegions} /></Card>
        <Card title="Languages" icon="chat"><Bars items={a.topLanguages} /></Card>
        <Card title="Top objections" icon="alert"><Bars items={a.topObjections} /></Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Hottest open leads" icon="target" className="lg:col-span-2" action={<Btn onClick={() => goTab("leads")}>All leads</Btn>}>
          {a.hotLeads.length ? (
            <ul className="divide-y divide-border">
              {a.hotLeads.map((l) => (
                <li key={l.id}>
                  <button onClick={() => openLead(l.id)} className="w-full py-2 flex items-center justify-between gap-3 text-left hover:text-brand">
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-semibold truncate">{l.name || "Unnamed visitor"}{l.company ? ` · ${l.company}` : ""}</div>
                      <div className="text-[11px] text-ink-muted truncate">{[l.country, (l.product_interests || []).join(", ")].filter(Boolean).join(" · ")}</div>
                    </div>
                    <TierBadge tier={l.tier} score={l.score} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon="target" title="No leads yet">Share your Dr.Remi link or run the exhibition kiosk — leads appear here in real time.</Empty>
          )}
        </Card>
        <Card title="Frequently asked" icon="search"><Bars items={a.topTopics} /></Card>
      </div>

      <Card
        title={`Unanswered questions (${a.gaps.length})`}
        icon="brain"
        action={canAdmin(role) ? <Btn variant="soft" onClick={() => goTab("brains")}><Icon name="upload" className="w-3.5 h-3.5" /> Add to Brains</Btn> : null}
      >
        {a.gaps.length ? (
          <ul className="space-y-1.5">
            {a.gaps.slice(0, 12).map((g) => (
              <li key={g.id} className="text-[12px] flex items-start justify-between gap-3">
                <span>“{g.question}” <span className="text-ink-muted text-[10.5px]">· {g.language} · {fmtDate(g.created_at, false)}</span></span>
                {canAdmin(role) && (
                  <span className="flex gap-1 flex-shrink-0">
                    <Btn onClick={() => resolve("gap", g.id, "resolved")}>Resolved</Btn>
                    <Btn onClick={() => resolve("gap", g.id, "ignored")}>Ignore</Btn>
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-[11.5px] text-ink-muted">None — every question was answered from your Brains.</div>
        )}
      </Card>

      {canAdmin(role) && (
        <Card
          title="AI improvement recommendations"
          icon="sparkle"
          action={<Btn variant="primary" onClick={runInsights} disabled={insBusy}>{insBusy ? "Analysing…" : ins ? "Refresh" : "Analyse last 90 days"}</Btn>}
        >
          {insErr && <div className="text-[12px] text-critical">{insErr}</div>}
          {!ins && !insErr && <div className="text-[11.5px] text-ink-muted">Turns objections, unanswered questions and demand into concrete changes to messaging, positioning, content and market focus.</div>}
          {ins && (
            <div className="space-y-3 text-[12px]">
              {ins.headline && <div className="font-bold text-ink text-[13px]">{ins.headline}</div>}
              {ins.conversion && <p className="text-ink-2">{ins.conversion}</p>}
              <div className="grid md:grid-cols-2 gap-3">
                {([["Messaging", ins.messaging], ["Positioning", ins.positioning], ["Content to add to Brains", ins.content_gaps], ["Market focus", ins.market_focus], ["Unmet needs", ins.unmet_needs]] as [string, string[] | undefined][])
                  .filter(([, v]) => v?.length)
                  .map(([t, v]) => (
                    <div key={t} className="bg-page rounded-xl p-3 border border-border">
                      <div className="font-semibold mb-1">{t}</div>
                      <ul className="list-disc pl-4 space-y-0.5 text-ink-2">{v!.map((x, i) => <li key={i}>{x}</li>)}</ul>
                    </div>
                  ))}
              </div>
              {!!ins.objection_playbook?.length && (
                <div className="bg-page rounded-xl p-3 border border-border">
                  <div className="font-semibold mb-1">Objection playbook</div>
                  <ul className="space-y-1.5">{ins.objection_playbook.map((o, i) => <li key={i}><b>“{o.objection}”</b> → <span className="text-ink-2">{o.best_response}</span></li>)}</ul>
                </div>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
