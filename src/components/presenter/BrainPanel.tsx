"use client";
// Presenter.ai — Shree's brain: briefing text and the people he remembers.
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/presenter/client";

type Brain = { vocab?: string; rules?: string; knowledge?: string };
type Person = { id?: string; name: string; role: string; notes: string; lastIntro?: string | null; lastCommitment?: string | null; sessions?: string[]; remember?: boolean };

const FIELDS: Array<{ key: keyof Brain; label: string; hint: string; rows: number }> = [
  { key: "vocab", label: "Team vocabulary", hint: "Names, terms and spellings Shree must get right, one per line. e.g. NRPL = Natural Remedies Pvt Ltd; Avicare; Rumicare; P&C = People & Culture", rows: 5 },
  { key: "rules", label: "Do's and don'ts", hint: "e.g. Address senior leaders as 'sir/ma'am' first. Never joke about appraisals. Keep answers under 30 seconds.", rows: 5 },
  { key: "knowledge", label: "Background Shree may use", hint: "Anything extra Shree should know: team context, recent wins, upcoming events. Facts only.", rows: 6 },
];

export default function BrainPanel({ sessionId }: { sessionId: string }) {
  const [brain, setBrain] = useState<Brain>({});
  const [people, setPeople] = useState<Person[]>([]);
  const [draft, setDraft] = useState<Person>({ name: "", role: "", notes: "" });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const d = await api<{ brain: Brain; people: Person[] }>(`/api/presenter/brain?sessionId=${sessionId}`);
    setBrain(d.brain || {});
    setPeople(d.people || []);
  }, [sessionId]);

  useEffect(() => {
    load().catch((e) => setMsg(e.message));
  }, [load]);

  const post = (body: Record<string, unknown>) =>
    api("/api/presenter/brain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const saveBrain = async () => {
    setBusy(true);
    setMsg("");
    try {
      await post({ action: "brain", sessionId, brain });
      setMsg("Briefing saved. Shree uses it from his next line.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const savePerson = async (p: Person) => {
    setMsg("");
    try {
      await post({ action: "person", person: p });
      if (!p.id) setDraft({ name: "", role: "", notes: "" });
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    }
  };

  const input = "w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm";

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 space-y-5">
      <div>
        <div className="text-sm font-semibold">Shree&apos;s brain</div>
        <div className="text-xs text-ink-muted">Carried into every new session. People notes are used only to relate warmly, never read out.</div>
      </div>

      {FIELDS.map((f) => (
        <label key={f.key} className="block">
          <div className="text-sm font-medium">{f.label}</div>
          <textarea
            value={brain[f.key] || ""}
            onChange={(e) => setBrain((b) => ({ ...b, [f.key]: e.target.value }))}
            rows={f.rows}
            placeholder={f.hint}
            className={`${input} mt-1`}
          />
        </label>
      ))}
      <button onClick={saveBrain} disabled={busy} className="rounded-lg bg-ink px-4 py-2 text-sm text-surface disabled:opacity-50">
        {busy ? "Saving…" : "Save briefing"}
      </button>

      <div className="border-t border-border pt-4">
        <div className="text-sm font-medium">People Shree remembers ({people.length})</div>
        <div className="text-xs text-ink-muted">Added automatically when someone signs in on their phone (unless they tick &quot;Don&apos;t remember me&quot;). Add or edit notes here.</div>
        <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_2fr_auto]">
          <input className={input} placeholder="Name (as they'll sign in)" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <input className={input} placeholder="Role, e.g. HRBP, Pharma" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} />
          <input className={input} placeholder="Notes, e.g. loves cricket, new joiner" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          <button onClick={() => savePerson(draft)} className="rounded-lg bg-ink px-3 py-2 text-sm text-surface">Add</button>
        </div>
        <div className="mt-3 space-y-2">
          {people.map((p) => (
            <PersonRow key={p.id} p={p} onSave={savePerson} onDelete={async () => { if (confirm(`Forget ${p.name}? This can't be undone.`)) { await post({ action: "person-delete", id: p.id }); load(); } }} input={input} />
          ))}
        </div>
      </div>
      {msg && <div className="text-xs text-ink-muted">{msg}</div>}
    </div>
  );
}

function PersonRow({ p, onSave, onDelete, input }: { p: Person; onSave: (p: Person) => void; onDelete: () => void; input: string }) {
  const [v, setV] = useState(p);
  const dirty = v.role !== p.role || v.notes !== p.notes || v.name !== p.name;
  return (
    <div className="rounded-lg border border-border p-2">
      <div className="grid gap-2 md:grid-cols-[1fr_1fr_2fr_auto_auto]">
        <input className={input} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        <input className={input} value={v.role} placeholder="Role" onChange={(e) => setV({ ...v, role: e.target.value })} />
        <input className={input} value={v.notes} placeholder="Notes" onChange={(e) => setV({ ...v, notes: e.target.value })} />
        <button disabled={!dirty} onClick={() => onSave(v)} className="rounded-lg bg-ink px-3 py-2 text-xs text-surface disabled:opacity-30">Save</button>
        <button onClick={onDelete} className="rounded-lg border border-border px-3 py-2 text-xs">Forget</button>
      </div>
      {(p.lastIntro || p.lastCommitment || (p.sessions && p.sessions.length > 0)) && (
        <div className="mt-1 px-1 text-[11px] text-ink-muted">
          {p.lastIntro && <>Intro: “{p.lastIntro}” · </>}
          {p.lastCommitment && <>Commitment: “{p.lastCommitment}” · </>}
          {p.sessions?.length ? `${p.sessions.length} session(s)` : ""}
        </div>
      )}
    </div>
  );
}
