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

  // Create-a-new-login flow (bulk onboarding path -- no self-signup needed).
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "org_admin">("member");
  const [inviting, setInviting] = useState(false);
  const [inviteNotice, setInviteNotice] = useState<{ ok: boolean; text: string; link?: string } | null>(null);

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

  async function createLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteName.trim()) return;
    setInviting(true);
    setInviteNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/org/members/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), fullName: inviteName.trim(), orgRole: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create the account.");
      if (data.emailSent) {
        setInviteNotice({ ok: true, text: `Account created -- an email with a "set your password" link was sent to ${inviteEmail.trim()}.` });
      } else {
        setInviteNotice({
          ok: true,
          text: `Account created, but no email could be sent (${data.emailError || "email not configured"}). Share this one-time setup link with them directly:`,
          link: data.setupLink,
        });
      }
      setInviteEmail("");
      setInviteName("");
      setInviteRole("member");
      loadMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the account.");
    } finally {
      setInviting(false);
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
        <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Create a login for an employee</div>
        <p className="m-0 text-[11px] text-ink-muted">
          For teams onboarding in bulk — this creates their account directly, no self-signup needed. They&apos;ll get
          an email with a one-time link to set their own password.
        </p>
        <form onSubmit={createLogin} className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
            placeholder="Full name"
            className="input flex-1 min-w-[160px]"
          />
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="employee@company.com"
            className="input flex-1 min-w-[200px]"
          />
          <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as "member" | "org_admin")} className="input w-auto">
            <option value="member">Member</option>
            <option value="org_admin">Org admin</option>
          </select>
          <button
            type="submit"
            disabled={inviting || !inviteEmail.trim() || !inviteName.trim()}
            className="bg-brand text-white text-[12.5px] font-bold px-3.5 py-2 rounded-sm disabled:opacity-50"
          >
            {inviting ? "Creating…" : "+ Create login"}
          </button>
        </form>
        {inviteNotice && (
          <div className="bg-good-wash text-good-text text-[12px] rounded-sm px-3 py-2 flex flex-col gap-1">
            <span>{inviteNotice.text}</span>
            {inviteNotice.link && (
              <a href={inviteNotice.link} target="_blank" rel="noreferrer" className="underline break-all">
                {inviteNotice.link}
              </a>
            )}
          </div>
        )}
      </div>

      <div className="border border-border rounded-md p-4 bg-surface flex flex-col gap-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Members</div>

        <details className="text-[12px]">
          <summary className="cursor-pointer text-ink-muted select-none">Or add someone who already has an Askshree account</summary>
          <form onSubmit={addMember} className="flex items-center gap-2 flex-wrap mt-2">
            <input
              type="email"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              placeholder="colleague@company.com"
              className="input flex-1 min-w-[200px]"
            />
            <button type="submit" disabled={adding || !addEmail.trim()} className="border border-border text-[12.5px] font-bold px-3.5 py-2 rounded-sm bg-page disabled:opacity-50">
              {adding ? "Adding…" : "Add existing account"}
            </button>
          </form>
          <p className="m-0 mt-1.5 text-[11px] text-ink-muted">Only works if they&apos;ve already signed up and aren&apos;t in an organization yet.</p>
        </details>

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
