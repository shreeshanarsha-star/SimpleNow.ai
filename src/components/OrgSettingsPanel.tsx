"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Org = { id: string; name: string; status: string; plan: string; features: string[] };
type Member = { id: string; email: string | null; full_name: string | null; org_role: string; created_at: string };

export default function OrgSettingsPanel({ org, meId }: { org: Org; meId: string }) {
  const router = useRouter();
  const [name, setName] = useState(org.name);
  const [savingName, setSavingName] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [addEmail, setAddEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function loadMembers() {
    setLoadingMembers(true);
    fetch("/api/org/members")
      .then((r) => r.json())
      .then((d) => setMembers(d.members || []))
      .finally(() => setLoadingMembers(false));
  }
  useEffect(loadMembers, []);

  async function saveName() {
    if (!name.trim() || name.trim() === org.name) return;
    setSavingName(true);
    setError(null);
    try {
      const res = await fetch("/api/org/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSavingName(false);
    }
  }

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    if (!addEmail.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/org/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not add member.");
      setAddEmail("");
      loadMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add member.");
    } finally {
      setAdding(false);
    }
  }

  async function removeMember(userId: string) {
    setError(null);
    try {
      const res = await fetch(`/api/org/members?userId=${userId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not remove member.");
      loadMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove member.");
    }
  }

  const statusStyle =
    org.status === "approved" ? "bg-good-wash text-good-text" : org.status === "pending" ? "bg-brand-wash text-brand" : "bg-critical-wash text-critical";

  return (
    <div className="flex flex-col gap-6">
      {error && <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2">{error}</div>}

      <div className="border border-border rounded-md p-4 bg-surface flex flex-col gap-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Organization</div>
        <div className="flex items-center gap-2 flex-wrap">
          <input value={name} onChange={(e) => setName(e.target.value)} className="input flex-1 min-w-[200px]" />
          <button
            onClick={saveName}
            disabled={savingName || !name.trim() || name.trim() === org.name}
            className="bg-brand text-white text-[12.5px] font-bold px-3.5 py-2 rounded-sm disabled:opacity-50"
          >
            {savingName ? "Saving…" : "Save name"}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full capitalize ${statusStyle}`}>{org.status}</span>
          <span className="text-[11.5px] text-ink-muted capitalize">{org.plan} plan</span>
        </div>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1.5">Tools purchased</div>
          {org.plan === "bulk" ? (
            <p className="m-0 text-[12.5px] text-ink-2">Every live tool is included.</p>
          ) : org.features.length === 0 ? (
            <p className="m-0 text-[12.5px] text-ink-muted">Nothing yet — ask the platform owner to grant your first tool.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {org.features.map((f) => (
                <span key={f} className="text-[11px] font-bold bg-good-wash text-good-text px-2 py-0.5 rounded-full">
                  {f}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="border border-border rounded-md p-4 bg-surface flex flex-col gap-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Members</div>
        <form onSubmit={addMember} className="flex items-center gap-2 flex-wrap">
          <input
            type="email"
            value={addEmail}
            onChange={(e) => setAddEmail(e.target.value)}
            placeholder="colleague@company.com"
            className="input flex-1 min-w-[200px]"
          />
          <button type="submit" disabled={adding || !addEmail.trim()} className="border border-border text-[12.5px] font-bold px-3.5 py-2 rounded-sm bg-page disabled:opacity-50">
            {adding ? "Adding…" : "+ Add existing account"}
          </button>
        </form>
        <p className="m-0 text-[11px] text-ink-muted">
          They must already have an Askshree account (signed up, not yet in an organization). There&apos;s no
          email-invite yet — ask them to sign up first.
        </p>

        {loadingMembers ? (
          <p className="text-[12.5px] text-ink-muted">Loading…</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 border border-border rounded-sm px-3 py-2">
                <div className="min-w-0">
                  <div className="text-[12.5px] font-medium truncate">{m.full_name || m.email}</div>
                  <div className="text-[10.5px] text-ink-muted capitalize">{m.org_role.replace("_", " ")}</div>
                </div>
                {m.id !== meId && (
                  <button onClick={() => removeMember(m.id)} className="text-critical text-[11.5px] font-bold flex-shrink-0">
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="m-0 text-[12px] text-ink-muted">
        Managing Talent.ai roles (recruiter, TA head, hiring manager, HR approver) for your team? Open Talent.ai
        and use its Admin tab.
      </p>
    </div>
  );
}
