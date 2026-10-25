"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { REMI_LANGUAGES } from "@/lib/remi/languages";
import { api, areaCls, Btn, Card, Field, fmtDate, inputCls, canAdmin, type Role } from "./ui";

type WS = Record<string, unknown> & { id: string; slug: string; name: string; active: boolean };
type Member = { user_id: string; email: string | null; role: string; created_at: string };
type Invite = { id: string; email: string; role: string; created_at: string };

const VOICES = ["sage", "coral", "alloy", "ash", "ballad", "echo", "fable", "nova", "onyx", "shimmer", "verse"];

function TeamCard({ wsId, role, meId }: { wsId: string; role: Role; meId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState("rep");
  const [msg, setMsg] = useState<string | null>(null);
  const admin = canAdmin(role);
  const load = useCallback(() => {
    api<{ members: Member[]; invites: Invite[] }>(`/api/remi/w/${wsId}/members`).then((d) => {
      setMembers(d.members);
      setInvites(d.invites);
    });
  }, [wsId]);
  useEffect(load, [load]);

  async function invite() {
    setMsg(null);
    try {
      const r = await api<{ added?: boolean; invited?: boolean }>(`/api/remi/w/${wsId}/members`, { method: "POST", json: { email, role: newRole } });
      setMsg(r.added ? "Added — they can open Dr.Remi now." : "Invited — they'll get access when they sign in to SimpleNow with this email.");
      setEmail("");
      load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }
  return (
    <Card title="Team & roles" icon="users">
      <p className="text-[11.5px] text-ink-muted mb-3">
        <b>Owner/Admin</b>: everything incl. Brains and settings · <b>Rep</b>: their own + unassigned leads, coaching · <b>Viewer</b>: read-only dashboard. Each workspace is fully isolated from other companies.
      </p>
      <ul className="divide-y divide-border mb-3">
        {members.map((m) => (
          <li key={m.user_id} className="py-2 flex items-center justify-between text-[12px] gap-2">
            <span className="truncate">{m.email || m.user_id}{m.user_id === meId ? " (you)" : ""}</span>
            <span className="flex items-center gap-1.5">
              {admin && m.role !== "owner" ? (
                <select value={m.role} onChange={async (e) => { await api(`/api/remi/w/${wsId}/members`, { method: "PATCH", json: { user_id: m.user_id, role: e.target.value } }); load(); }} className="h-7 rounded-lg border border-border bg-page px-1.5 text-[11.5px]">
                  <option value="admin">Admin</option><option value="rep">Rep</option><option value="viewer">Viewer</option>
                </select>
              ) : (
                <span className="text-ink-muted capitalize">{m.role}</span>
              )}
              {admin && m.role !== "owner" && (
                <button onClick={async () => { if (confirm("Remove this member?")) { await api(`/api/remi/w/${wsId}/members?user_id=${m.user_id}`, { method: "DELETE" }); load(); } }} className="text-critical" aria-label="Remove"><Icon name="trash" className="w-3.5 h-3.5" /></button>
              )}
            </span>
          </li>
        ))}
        {invites.map((i) => (
          <li key={i.id} className="py-2 flex items-center justify-between text-[12px] text-ink-muted">
            <span>{i.email} · invited {fmtDate(i.created_at, false)}</span>
            <span className="flex items-center gap-2"><span className="capitalize">{i.role}</span>
              {admin && <button onClick={async () => { await api(`/api/remi/w/${wsId}/members?invite_id=${i.id}`, { method: "DELETE" }); load(); }} className="text-critical"><Icon name="x" className="w-3.5 h-3.5" /></button>}
            </span>
          </li>
        ))}
      </ul>
      {admin && (
        <div className="flex gap-2 flex-wrap">
          <input className={`${inputCls} flex-1 min-w-[180px]`} placeholder="colleague@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <select className="h-9 rounded-xl border border-border bg-page px-3 text-[12.5px] text-ink outline-none focus:border-brand" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
            <option value="rep">Sales rep</option><option value="admin">Admin</option><option value="viewer">Viewer</option>
          </select>
          <Btn variant="primary" disabled={!email.includes("@")} onClick={invite}>Invite</Btn>
        </div>
      )}
      {msg && <div className="text-[11.5px] mt-2 text-brand">{msg}</div>}
    </Card>
  );
}

export default function SettingsTab({ ws, role, meId, onSaved, onDeleted }: { ws: WS; role: Role; meId: string; onSaved: (w: WS) => void; onDeleted: () => void }) {
  const [v, setV] = useState<Record<string, unknown>>({ ...ws, notify_emails: ((ws.notify_emails as string[]) || []).join(", "), suggested_questions: ((ws.suggested_questions as string[]) || []).join("\n") });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const admin = canAdmin(role);
  const s = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((x) => ({ ...x, [k]: e.target.value }));

  async function save(extra: Record<string, unknown> = {}) {
    setBusy(true);
    setMsg(null);
    try {
      const body = {
        name: v.name, assistant_name: v.assistant_name, tagline: v.tagline, industry: v.industry, about: v.about, greeting: v.greeting,
        default_language: v.default_language, pricing_mode: v.pricing_mode, voice: v.voice, handoff_message: v.handoff_message,
        consent_text: v.consent_text, kiosk_idle_seconds: Number(v.kiosk_idle_seconds), active: v.active, slug: v.slug,
        notify_emails: String(v.notify_emails || ""), suggested_questions: String(v.suggested_questions || "").split("\n"),
        ...extra,
      };
      const r = await api<{ workspace: WS }>(`/api/remi/w/${ws.id}`, { method: "PATCH", json: body });
      onSaved(r.workspace);
      setV((x) => ({ ...x, webhook_secret: r.workspace.webhook_secret, webhook_url: r.workspace.webhook_url }));
      setMsg("Saved ✓");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!admin) {
    return (
      <div className="space-y-4">
        <Card title="Settings" icon="gear"><div className="text-[12px] text-ink-muted">Only owners and admins can change settings.</div></Card>
        <TeamCard wsId={ws.id} role={role} meId={meId} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Assistant & company" icon="sparkle">
          <div className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Company / brand"><input className={inputCls} value={String(v.name || "")} onChange={s("name")} /></Field>
              <Field label="Assistant name"><input className={inputCls} value={String(v.assistant_name || "")} onChange={s("assistant_name")} /></Field>
              <Field label="Tagline"><input className={inputCls} value={String(v.tagline || "")} onChange={s("tagline")} /></Field>
              <Field label="Industry"><input className={inputCls} placeholder="Animal health & nutrition" value={String(v.industry || "")} onChange={s("industry")} /></Field>
            </div>
            <Field label="About the company" hint="Positioning, strengths, certifications, markets — used in every answer"><textarea rows={4} className={areaCls} value={String(v.about || "")} onChange={s("about")} /></Field>
            <Field label="Welcome message (optional)"><textarea rows={2} className={areaCls} value={String(v.greeting || "")} onChange={s("greeting")} /></Field>
            <Field label="Suggested questions (one per line)"><textarea rows={4} className={areaCls} value={String(v.suggested_questions || "")} onChange={s("suggested_questions")} /></Field>
          </div>
        </Card>
        <Card title="Voice, language & behaviour" icon="waveform">
          <div className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Default language" hint="Auto = reply in whatever language the customer uses">
                <select className={inputCls} value={String(v.default_language || "auto")} onChange={s("default_language")}>
                  <option value="auto">Auto-detect (recommended)</option>
                  {REMI_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
                </select>
              </Field>
              <Field label="Voice">
                <select className={inputCls} value={String(v.voice || "sage")} onChange={s("voice")}>
                  {VOICES.map((x) => <option key={x} value={x}>{x[0].toUpperCase() + x.slice(1)}</option>)}
                </select>
              </Field>
              <Field label="Pricing" hint="How prices are discussed">
                <select className={inputCls} value={String(v.pricing_mode || "range")} onChange={s("pricing_mode")}>
                  <option value="range">Indicative range + connect for exact quote</option>
                  <option value="exact">Quote catalog prices</option>
                  <option value="hidden">Never mention prices</option>
                </select>
              </Field>
              <Field label="Kiosk reset after (seconds idle)"><input type="number" min={30} max={900} className={inputCls} value={String(v.kiosk_idle_seconds ?? 90)} onChange={s("kiosk_idle_seconds")} /></Field>
            </div>
            <Field label="Hand-off message" hint="When a customer wants a quote, human or call-back"><textarea rows={2} className={areaCls} value={String(v.handoff_message || "")} onChange={s("handoff_message")} /></Field>
            <Field label="Consent wording" hint="Asked before saving name/phone/email (translated automatically)"><textarea rows={2} className={areaCls} value={String(v.consent_text || "")} onChange={s("consent_text")} /></Field>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Public link name" hint={`simplenow.ai/remi/${String(v.slug || "")}`}><input className={inputCls} value={String(v.slug || "")} onChange={s("slug")} /></Field>
              <Field label="Status">
                <label className="h-9 flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={!!v.active} onChange={(e) => setV((x) => ({ ...x, active: e.target.checked }))} /> Assistant is live</label>
              </Field>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Email notifications" icon="mail">
          <Field label="Send lead alerts & conversation summaries to" hint="Comma separated, up to 10. Qualified leads (with consent) are emailed instantly; possible adverse events are always escalated.">
            <input className={inputCls} value={String(v.notify_emails || "")} onChange={s("notify_emails")} />
          </Field>
        </Card>
        <Card title="CRM integration (webhook)" icon="link">
          <div className="space-y-2">
            <Field label="HTTPS webhook URL" hint="Works with Salesforce, HubSpot, Zoho via Zapier / Make / n8n or your own endpoint. Events: lead.qualified, lead.status_changed, session.ended, safety.reported. Signed with HMAC-SHA256 in X-Remi-Signature.">
              <input className={inputCls} placeholder="https://hooks.zapier.com/…" value={String(v.webhook_url || "")} onChange={s("webhook_url")} />
            </Field>
            {!!v.webhook_secret && (
              <div className="text-[11px] text-ink-muted">Signing secret: <code className="bg-page px-1 rounded select-all">{String(v.webhook_secret)}</code></div>
            )}
            <div className="text-[11px] text-ink-muted">Prefer a file? Export leads as CSV from the Leads tab.</div>
          </div>
        </Card>
      </div>

      <div className="flex items-center justify-end gap-3 sticky bottom-0 bg-page/90 backdrop-blur py-2">
        {msg && <span className={`text-[12px] ${msg.startsWith("Saved") ? "text-good-text" : "text-critical"}`}>{msg}</span>}
        <Btn variant="primary" disabled={busy} onClick={() => save({ webhook_url: v.webhook_url || null, keep_secret: v.webhook_url === ws.webhook_url })}>{busy ? "Saving…" : "Save settings"}</Btn>
      </div>

      <TeamCard wsId={ws.id} role={role} meId={meId} />

      {role === "owner" && (
        <Card title="Danger zone" icon="alert">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[12px] text-ink-muted">Delete this workspace, its Brains, products, conversations and leads permanently.</div>
            <Btn variant="danger" onClick={async () => { if (prompt(`Type ${ws.slug} to delete`) === ws.slug) { await api(`/api/remi/w/${ws.id}`, { method: "DELETE" }); onDeleted(); } }}>Delete workspace</Btn>
          </div>
        </Card>
      )}
    </div>
  );
}
