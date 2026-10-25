"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { api, areaCls, Btn, Card, Empty, Field, fmtDate, inputCls, STATUS_LABEL, TierBadge, canAdmin, type Role } from "./ui";

type Lead = Record<string, unknown> & {
  id: string;
  name: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  location: string | null;
  score: number;
  tier: string;
  status: string;
  product_interests: string[];
  objections: string[];
  next_best_action: string | null;
  summary: string | null;
  consent: boolean;
  assigned_to: string | null;
  follow_up_at: string | null;
  deal_value: number | null;
  notes: string | null;
  created_at: string;
  channel: string | null;
  preferred_language: string | null;
  intent_signals?: { need?: number; budget?: number; authority?: number; timeline?: number; urgency?: string; buying_signals?: string[] };
};
type Member = { user_id: string; email: string | null; role: string };
type Msg = { id: number; role: string; content: string; language: string | null; meta: { justification?: string } | null; created_at: string };
type Coach = {
  situation?: string;
  deal_stage?: string;
  next_best_questions?: string[];
  value_points?: string[];
  objection_handling?: { objection: string; response: string }[];
  proposal?: string;
  risks?: string[];
  follow_up_message?: string;
};

function toLocalInput(iso: string) {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

const STATUSES = ["new", "contacted", "meeting", "quoted", "won", "lost"];

function Meter({ label, v }: { label: string; v?: number }) {
  const n = Math.max(0, Math.min(3, v || 0));
  return (
    <div className="text-[11px]">
      <div className="text-ink-muted">{label}</div>
      <div className="flex gap-0.5 mt-0.5">{[1, 2, 3].map((i) => <span key={i} className={`h-1.5 w-5 rounded-full ${i <= n ? "bg-brand" : "bg-page border border-border"}`} />)}</div>
    </div>
  );
}

function LeadDrawer({ wsId, leadId, role, members, meId, onClose, onChanged }: { wsId: string; leadId: string; role: Role; members: Member[]; meId: string; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<{ lead: Lead; messages: Msg[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [coach, setCoach] = useState<Coach | null>(null);
  const [coachBusy, setCoachBusy] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api<{ lead: Lead; messages: Msg[] }>(`/api/remi/w/${wsId}/leads/${leadId}`)
      .then((d) => {
        setData(d);
        setNotes(d.lead.notes || "");
      })
      .catch((e) => setErr(e.message));
  }, [wsId, leadId]);
  useEffect(load, [load]);

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    try {
      const r = await api<{ lead: Lead }>(`/api/remi/w/${wsId}/leads/${leadId}`, { method: "PATCH", json: body });
      setData((d) => (d ? { ...d, lead: { ...d.lead, ...r.lead } } : d));
      onChanged();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function runCoach() {
    setCoachBusy(true);
    try {
      const r = await api<{ coach: Coach }>(`/api/remi/w/${wsId}/leads/${leadId}/coach`, { method: "POST" });
      setCoach(r.coach);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setCoachBusy(false);
    }
  }

  async function erase() {
    if (!confirm("Permanently delete this lead and its conversation? (Use for data-deletion requests.)")) return;
    await api(`/api/remi/w/${wsId}/leads/${leadId}`, { method: "DELETE" });
    onChanged();
    onClose();
  }

  const l = data?.lead;
  const sig = l?.intent_signals || {};
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="w-full max-w-[720px] h-full bg-page overflow-y-auto shadow-soft" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-surface border-b border-border px-5 py-3 flex items-center justify-between">
          <div className="min-w-0">
            <div className="font-bold text-[15px] truncate">{l ? l.name || l.company || "Unnamed visitor" : "Lead"}</div>
            {l && <div className="text-[11px] text-ink-muted">{fmtDate(l.created_at)} · {l.channel} · {l.preferred_language || "—"}</div>}
          </div>
          <div className="flex items-center gap-2">
            {l && <TierBadge tier={l.tier} score={l.score} />}
            <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-xl border border-border flex items-center justify-center"><Icon name="x" className="w-4 h-4" /></button>
          </div>
        </div>
        {err && <div className="p-5 text-critical text-sm">{err}</div>}
        {l && (
          <div className="p-5 space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((s) => (
                <button key={s} disabled={saving || role === "viewer"} onClick={() => patch({ status: s })} className={`h-7 px-3 rounded-full text-[11px] font-semibold border ${l.status === s ? "bg-brand text-white border-brand" : "bg-surface border-border text-ink-muted hover:text-brand"}`}>
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>

            <Card title="Customer" icon="users">
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[12px]">
                {([
                  ["Name", l.name], ["Company", l.company], ["Designation", l.designation], ["Type", l.customer_type],
                  ["Email", l.email], ["Phone", l.phone], ["Location", [l.location, l.country].filter(Boolean).join(", ")],
                  ["Interests", (l.product_interests || []).join(", ")], ["Requirement", l.requirements], ["Challenges", l.challenges],
                  ["Current solution", l.current_solution], ["Budget", l.budget], ["Timeline", l.timeline], ["Decision role", l.purchase_authority],
                  ["Call-back", l.callback_requested ? `Yes ${l.callback_time ? `— ${l.callback_time}` : ""}` : null],
                  ["Consent", l.consent ? `Yes · ${fmtDate(l.consent_at as string)}` : "Not given (contact details not stored)"],
                ] as [string, unknown][]).map(([k, v]) => (
                  <div key={k} className="flex gap-2"><span className="text-ink-muted w-28 flex-shrink-0">{k}</span><span className="text-ink break-words">{(v as string) || "—"}</span></div>
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                {l.phone && <a href={`tel:${l.phone}`} className="text-[11.5px] font-semibold text-brand inline-flex items-center gap-1"><Icon name="phone" className="w-3.5 h-3.5" /> Call</a>}
                {l.phone && <a href={`https://wa.me/${String(l.phone).replace(/[^\d]/g, "")}`} target="_blank" rel="noreferrer" className="text-[11.5px] font-semibold text-brand inline-flex items-center gap-1"><Icon name="whatsapp" className="w-3.5 h-3.5" /> WhatsApp</a>}
                {l.email && <a href={`mailto:${l.email}`} className="text-[11.5px] font-semibold text-brand inline-flex items-center gap-1"><Icon name="mail" className="w-3.5 h-3.5" /> Email</a>}
              </div>
            </Card>

            <Card title="Buying intent" icon="target">
              <div className="grid grid-cols-4 gap-3">
                <Meter label="Need" v={sig.need} /><Meter label="Budget" v={sig.budget} /><Meter label="Authority" v={sig.authority} /><Meter label="Timeline" v={sig.timeline} />
              </div>
              {!!sig.buying_signals?.length && <div className="mt-2 text-[11.5px]"><span className="text-ink-muted">Signals: </span>{sig.buying_signals.join(" · ")}</div>}
              {!!l.objections?.length && <div className="mt-1 text-[11.5px]"><span className="text-ink-muted">Objections: </span>{l.objections.join(" · ")}</div>}
              {l.summary && <p className="mt-2 text-[12px] text-ink-2">{l.summary}</p>}
              {l.next_best_action && (
                <div className="mt-2 text-[12px] bg-brand-wash/60 border border-brand/20 rounded-xl p-2.5"><b className="text-brand">Next best action: </b>{l.next_best_action}</div>
              )}
            </Card>

            <Card title="Sales guidance" icon="sparkle" action={role !== "viewer" ? <Btn variant="primary" onClick={runCoach} disabled={coachBusy}>{coachBusy ? "Thinking…" : coach ? "Refresh" : "Coach me"}</Btn> : null}>
              {!coach ? (
                <div className="text-[11.5px] text-ink-muted">Next best questions, value points, objection handling and a ready-to-send follow-up in the customer&apos;s language.</div>
              ) : (
                <div className="space-y-2.5 text-[12px]">
                  {coach.situation && <p><b>{coach.deal_stage?.replace(/_/g, " ")}</b> — {coach.situation}</p>}
                  {!!coach.next_best_questions?.length && <div><div className="font-semibold">Ask next</div><ul className="list-disc pl-4 text-ink-2">{coach.next_best_questions.map((q, i) => <li key={i}>{q}</li>)}</ul></div>}
                  {!!coach.value_points?.length && <div><div className="font-semibold">Emphasise</div><ul className="list-disc pl-4 text-ink-2">{coach.value_points.map((q, i) => <li key={i}>{q}</li>)}</ul></div>}
                  {!!coach.objection_handling?.length && <div><div className="font-semibold">Objections</div><ul className="space-y-1 text-ink-2">{coach.objection_handling.map((o, i) => <li key={i}><b>“{o.objection}”</b> → {o.response}</li>)}</ul></div>}
                  {coach.proposal && <p><b>Propose: </b>{coach.proposal}</p>}
                  {!!coach.risks?.length && <p className="text-critical"><b>Risks: </b>{coach.risks.join(" · ")}</p>}
                  {coach.follow_up_message && (
                    <div className="bg-page border border-border rounded-xl p-2.5">
                      <div className="flex items-center justify-between"><b>Follow-up message</b><Btn onClick={() => navigator.clipboard?.writeText(coach.follow_up_message!)}><Icon name="copy" className="w-3.5 h-3.5" /> Copy</Btn></div>
                      <p dir="auto" className="whitespace-pre-wrap mt-1 text-ink-2">{coach.follow_up_message}</p>
                    </div>
                  )}
                </div>
              )}
            </Card>

            {role !== "viewer" && (
              <Card title="Follow-up" icon="calendar">
                <div className="grid sm:grid-cols-3 gap-3">
                  <Field label="Owner">
                    <select className={inputCls} value={l.assigned_to || ""} onChange={(e) => patch({ assigned_to: e.target.value || null })}>
                      <option value="">Unassigned</option>
                      {members.filter((m) => canAdmin(role) || m.user_id === meId).map((m) => <option key={m.user_id} value={m.user_id}>{m.email || m.user_id.slice(0, 8)}</option>)}
                    </select>
                  </Field>
                  <Field label="Follow-up on">
                    <input type="datetime-local" className={inputCls} defaultValue={l.follow_up_at ? toLocalInput(l.follow_up_at) : ""} onBlur={(e) => patch({ follow_up_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                  </Field>
                  <Field label="Deal value">
                    <input type="number" min={0} className={inputCls} defaultValue={l.deal_value ?? ""} onBlur={(e) => patch({ deal_value: e.target.value === "" ? null : Number(e.target.value) })} />
                  </Field>
                </div>
                <div className="mt-3">
                  <Field label="Notes">
                    <textarea rows={3} className={areaCls} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (l.notes || "") && patch({ notes })} />
                  </Field>
                </div>
              </Card>
            )}

            <Card title="Conversation" icon="chat">
              {data!.messages.length ? (
                <div className="space-y-2 text-[12px] max-h-[420px] overflow-y-auto">
                  {data!.messages.map((m) => (
                    <div key={m.id} className={m.role === "user" ? "text-right" : ""}>
                      <div dir="auto" className={`inline-block max-w-[88%] rounded-xl px-3 py-2 text-left ${m.role === "user" ? "bg-brand text-white" : "bg-surface border border-border"}`}>{m.content}</div>
                      {m.meta?.justification && <div className="text-[10.5px] text-good-text mt-0.5">✓ {m.meta.justification}</div>}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[11.5px] text-ink-muted">No transcript.</div>
              )}
            </Card>

            {canAdmin(role) && (
              <div className="flex justify-end"><Btn variant="danger" onClick={erase}><Icon name="trash" className="w-3.5 h-3.5" /> Delete lead & conversation</Btn></div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function LeadsTab({ wsId, role, meId, openLeadId, setOpenLeadId }: { wsId: string; role: Role; meId: string; openLeadId: string | null; setOpenLeadId: (id: string | null) => void }) {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [tier, setTier] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [mine, setMine] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const qs = new URLSearchParams({ ...(tier ? { tier } : {}), ...(status ? { status } : {}), ...(q ? { q } : {}), ...(mine ? { mine: "1" } : {}) }).toString();
  const load = useCallback(() => {
    api<{ leads: Lead[] }>(`/api/remi/w/${wsId}/leads?${qs}`).then((d) => setLeads(d.leads)).catch((e) => setErr(e.message));
  }, [wsId, qs]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => {
    api<{ members: Member[] }>(`/api/remi/w/${wsId}/members`).then((d) => setMembers(d.members)).catch(() => {});
  }, [wsId]);

  const email = (id: string | null) => members.find((m) => m.user_id === id)?.email || (id ? "member" : "—");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Icon name="search" className="w-3.5 h-3.5 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, company, country, requirement…" className={`${inputCls} pl-8`} />
        </div>
        <select value={tier} onChange={(e) => setTier(e.target.value)} className="h-9 rounded-xl border border-border bg-page px-3 text-[12.5px] text-ink outline-none focus:border-brand">
          <option value="">All tiers</option><option value="hot">Hot</option><option value="warm">Warm</option><option value="cold">Cold</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-xl border border-border bg-page px-3 text-[12.5px] text-ink outline-none focus:border-brand">
          <option value="">All stages</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <label className="text-[12px] flex items-center gap-1.5"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> My leads</label>
        <a href={`/api/remi/w/${wsId}/leads?${qs}&format=csv`} className="h-8 px-3 rounded-xl border border-border bg-surface text-[12px] font-semibold inline-flex items-center gap-1.5 hover:text-brand"><Icon name="download" className="w-3.5 h-3.5" /> CSV</a>
      </div>
      {err && <div className="text-critical text-sm">{err}</div>}
      <Card>
        {!leads ? (
          <div className="text-sm text-ink-muted py-4">Loading…</div>
        ) : !leads.length ? (
          <Empty icon="target" title="No leads match">Leads are created automatically as Dr.Remi talks to customers.</Empty>
        ) : (
          <div className="overflow-x-auto -mx-4">
            <table className="w-full text-[12px]">
              <thead className="text-ink-muted text-[11px]">
                <tr className="border-b border-border">
                  <th className="text-left font-semibold px-4 py-2">Lead</th>
                  <th className="text-left font-semibold px-2">Interest</th>
                  <th className="text-left font-semibold px-2">Score</th>
                  <th className="text-left font-semibold px-2">Stage</th>
                  <th className="text-left font-semibold px-2">Owner</th>
                  <th className="text-left font-semibold px-2">Follow-up</th>
                  <th className="text-left font-semibold px-4">Created</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id} onClick={() => setOpenLeadId(l.id)} className="border-b border-border/60 hover:bg-brand-wash/40 cursor-pointer">
                    <td className="px-4 py-2">
                      <div className="font-semibold">{l.name || "Unnamed visitor"}{l.consent && (l.email || l.phone) ? " ✓" : ""}</div>
                      <div className="text-ink-muted text-[11px]">{[l.company, l.country || l.location].filter(Boolean).join(" · ") || "—"}</div>
                    </td>
                    <td className="px-2 max-w-[200px] truncate">{(l.product_interests || []).join(", ") || "—"}</td>
                    <td className="px-2"><TierBadge tier={l.tier} score={l.score} /></td>
                    <td className="px-2">{STATUS_LABEL[l.status]}</td>
                    <td className="px-2 truncate max-w-[140px]">{email(l.assigned_to)}</td>
                    <td className={`px-2 ${l.follow_up_at && new Date(l.follow_up_at).getTime() < Date.now() ? "text-critical font-semibold" : ""}`}>{l.follow_up_at ? fmtDate(l.follow_up_at) : "—"}</td>
                    <td className="px-4 text-ink-muted whitespace-nowrap">{fmtDate(l.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {openLeadId && (
        <LeadDrawer wsId={wsId} leadId={openLeadId} role={role} members={members} meId={meId} onClose={() => setOpenLeadId(null)} onChanged={load} />
      )}
    </div>
  );
}
