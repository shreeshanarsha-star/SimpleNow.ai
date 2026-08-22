"use client";

import { useEffect, useState } from "react";

import TalentAiBoard from "@/components/tools/TalentAiBoard";

type Me = { roles: string[]; isAdmin: boolean; isOrgAdmin?: boolean; profile: { full_name: string | null; email: string | null; manager_id: string | null } | null };
type ActionItem = { id: string; kind: string; title: string; detail: string; link: string; daysWaiting: number };
type Tab = "overview" | "approvals" | "assign" | "recruiter" | "jobs" | "admin";

export default function TalentWorkspace() {
  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<ActionItem[]>([]);
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    fetch("/api/talent-ai/me").then((r) => r.json()).then((d) => setMe(d));
    fetch("/api/talent-ai/action-queue").then((r) => r.json()).then((d) => setItems(d.items || []));
  }, [tab]);

  const roles = me?.roles || [];
  const isAdmin = !!me?.isAdmin;
  const isOrgAdmin = !!me?.isOrgAdmin;
  const canManageRoles = isAdmin || isOrgAdmin;
  const canApprove = isAdmin || roles.includes("reporting_manager") || roles.includes("hr_approver");
  const canAssign = isAdmin || roles.includes("ta_head");
  const canRecruit = isAdmin || roles.includes("recruiter") || roles.includes("ta_head");

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: "overview", label: "Requisitions", show: true },
    { id: "approvals", label: "Approvals", show: canApprove },
    { id: "assign", label: "TA Assignment", show: canAssign },
    { id: "recruiter", label: "Recruiter Tools", show: canRecruit },
    { id: "jobs", label: "Employee Jobs", show: true },
    { id: "admin", label: "Admin", show: canManageRoles },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1.5 border-b border-border overflow-x-auto">
        {tabs.filter((t) => t.show).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`text-[12.5px] font-bold px-3 py-2.5 border-b-2 flex-shrink-0 ${
              tab === t.id ? "border-brand text-brand" : "border-transparent text-ink-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {items.length > 0 && (
        <div className="border border-border rounded-md p-3 bg-brand-wash flex flex-col gap-1.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-brand">Needs your action ({items.length})</div>
          {items.slice(0, 5).map((it) => (
            <div key={it.id} className="text-[12.5px] flex items-center justify-between gap-2">
              <span>
                <strong>{it.title}</strong> — <span className="text-ink-muted">{it.detail}</span>
              </span>
              <span className="text-[10.5px] text-ink-muted flex-shrink-0">{it.daysWaiting}d waiting</span>
            </div>
          ))}
        </div>
      )}

      {tab === "overview" && <TalentAiBoard />}
      {tab === "approvals" && <ApprovalsPanel />}
      {tab === "assign" && <AssignPanel />}
      {tab === "recruiter" && <RecruiterToolsPanel />}
      {tab === "jobs" && <EmployeeJobsPanel />}
      {tab === "admin" && <AdminPanel />}
    </div>
  );
}

// ---------------- Approvals ----------------

type ApprovalStep = {
  id: string;
  step_order: number;
  approver_role: string;
  status: string;
  talent_requisitions: {
    id: string; title: string; department: string | null; location: string | null; headcount: number;
    priority: string; requisition_type: string; cost_center: string | null; comp_min: number | null; comp_max: number | null;
    is_confidential: boolean;
  };
};

function ApprovalsPanel() {
  const [steps, setSteps] = useState<ApprovalStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/talent-ai/approvals");
    const data = await res.json();
    setSteps(data.steps || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function decide(stepId: string, decision: string) {
    setBusy(stepId + decision);
    setError(null);
    try {
      const res = await fetch("/api/talent-ai/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepId, decision, comment: comments[stepId] || "" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "That decision failed.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That decision failed.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="text-[13px] text-ink-muted">Loading…</div>;

  return (
    <div className="flex flex-col gap-3">
      <h3 className="m-0 text-[15px] font-bold">Approval Centre</h3>
      {error && <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2">{error}</div>}
      {steps.length === 0 && <p className="text-[12.5px] text-ink-muted">Nothing waiting on your approval.</p>}
      {steps.map((s) => {
        const r = s.talent_requisitions;
        return (
          <div key={s.id} className="border border-border rounded-md p-3.5 bg-surface flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="text-[13.5px] font-bold">{r.title} {r.is_confidential && <span className="text-[10px] bg-warning-wash px-1.5 py-0.5 rounded-full ml-1">Confidential</span>}</div>
              <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-page text-ink-muted capitalize">{s.approver_role.replace("_", " ")} step</span>
            </div>
            <div className="text-[12px] text-ink-muted">
              {[r.department, r.location, `${r.headcount} headcount`, r.requisition_type].filter(Boolean).join(" · ")}
              {r.comp_min != null && ` · ${r.comp_min}–${r.comp_max ?? r.comp_min}`}
            </div>
            <input
              value={comments[s.id] || ""}
              onChange={(e) => setComments((prev) => ({ ...prev, [s.id]: e.target.value }))}
              className="input"
              placeholder="Comment (optional, required for send-back)"
            />
            <div className="flex gap-2 flex-wrap">
              <button disabled={!!busy} onClick={() => decide(s.id, "approved")} className="bg-good-wash text-good-text text-[12px] font-bold px-3 py-1.5 rounded-sm disabled:opacity-50">Approve</button>
              <button disabled={!!busy} onClick={() => decide(s.id, "hold")} className="bg-warning-wash text-[12px] font-bold px-3 py-1.5 rounded-sm disabled:opacity-50">Hold</button>
              <button disabled={!!busy} onClick={() => decide(s.id, "sent_back")} className="border border-border text-[12px] font-bold px-3 py-1.5 rounded-sm bg-surface disabled:opacity-50">Send back</button>
              <button disabled={!!busy} onClick={() => decide(s.id, "rejected")} className="bg-critical-wash text-critical text-[12px] font-bold px-3 py-1.5 rounded-sm disabled:opacity-50">Reject</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------- TA Assignment ----------------

type Req = { id: string; title: string; department: string | null; status: string; created_at: string };
type Recruiter = { id: string; email: string | null; full_name: string | null };

function AssignPanel() {
  const [reqs, setReqs] = useState<Req[]>([]);
  const [recruiters, setRecruiters] = useState<Recruiter[]>([]);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [reqRes, recRes] = await Promise.all([
      fetch("/api/talent-ai/requisitions"),
      fetch("/api/talent-ai/recruiters"),
    ]);
    const reqData = await reqRes.json();
    const recData = await recRes.json();
    setReqs((reqData.requisitions || []).filter((r: Req) => r.status === "approved"));
    setRecruiters(recData.recruiters || []);
  }
  useEffect(() => { load(); }, []);

  async function assign(id: string) {
    const recruiterId = picks[id];
    if (!recruiterId) return;
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/talent-ai/requisitions/${id}/workflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assign", recruiterId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Assignment failed.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assignment failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="m-0 text-[15px] font-bold">TA Command Center</h3>
      {error && <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2">{error}</div>}
      {recruiters.length === 0 && (
        <p className="text-[12px] text-ink-muted">No one is tagged as a Recruiter yet — assign that role from the Admin tab first.</p>
      )}
      {reqs.length === 0 && <p className="text-[12.5px] text-ink-muted">No approved requisitions waiting for assignment.</p>}
      {reqs.map((r) => (
        <div key={r.id} className="border border-border rounded-md p-3.5 bg-surface flex items-center gap-3">
          <div className="flex-1">
            <div className="text-[13px] font-bold">{r.title}</div>
            <div className="text-[11.5px] text-ink-muted">{r.department || "No department"}</div>
          </div>
          <select
            value={picks[r.id] || ""}
            onChange={(e) => setPicks((prev) => ({ ...prev, [r.id]: e.target.value }))}
            className="input max-w-[220px]"
          >
            <option value="">Choose recruiter…</option>
            {recruiters.map((rc) => (
              <option key={rc.id} value={rc.id}>{rc.full_name || rc.email}</option>
            ))}
          </select>
          <button
            onClick={() => assign(r.id)}
            disabled={busy === r.id || !picks[r.id]}
            className="bg-brand text-white text-[12px] font-bold px-3 py-2 rounded-sm shadow-soft-sm disabled:opacity-50"
          >
            Assign
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------- Recruiter Tools: search, lists, mass email, questionnaires ----------------

type SearchCandidate = { id: string; name: string; email: string | null; stage: string; talent_requisitions?: { title: string } };
type CandidateList = { id: string; name: string; description: string | null; talent_candidate_list_members?: { candidate_id: string }[] };
type QTemplate = { id: string; title: string; questions: { id: string; text: string; type: string }[] };

function RecruiterToolsPanel() {
  const [q, setQ] = useState("");
  const [external, setExternal] = useState(false);
  const [results, setResults] = useState<SearchCandidate[]>([]);
  const [externalResults, setExternalResults] = useState<{ title: string; link: string; snippet: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [lists, setLists] = useState<CandidateList[]>([]);
  const [newListName, setNewListName] = useState("");

  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailListId, setEmailListId] = useState("");
  const [emailStatus, setEmailStatus] = useState<string | null>(null);

  const [templates, setTemplates] = useState<QTemplate[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newQuestions, setNewQuestions] = useState("");

  function loadLists() {
    fetch("/api/talent-ai/lists").then((r) => r.json()).then((d) => setLists(d.lists || []));
  }
  function loadTemplates() {
    fetch("/api/talent-ai/questionnaires").then((r) => r.json()).then((d) => setTemplates(d.templates || []));
  }
  useEffect(() => { loadLists(); loadTemplates(); }, []);

  async function runSearch() {
    if (!q.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/talent-ai/candidates/search?q=${encodeURIComponent(q)}&external=${external}`);
      const data = await res.json();
      setResults(data.candidates || []);
      setExternalResults(data.external || []);
    } finally {
      setSearching(false);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function createList() {
    if (!newListName.trim()) return;
    await fetch("/api/talent-ai/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", name: newListName }),
    });
    setNewListName("");
    loadLists();
  }

  async function addSelectedToList(listId: string) {
    if (selectedIds.size === 0) return;
    await fetch("/api/talent-ai/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_members", listId, candidateIds: Array.from(selectedIds) }),
    });
    loadLists();
  }

  async function sendMassEmail() {
    setEmailStatus(null);
    if (!emailSubject.trim() || !emailBody.trim()) {
      setEmailStatus("Subject and body are required.");
      return;
    }
    const body: Record<string, unknown> = { subject: emailSubject, html: emailBody };
    if (emailListId) body.listId = emailListId; else body.candidateIds = Array.from(selectedIds);
    const res = await fetch("/api/talent-ai/mass-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) setEmailStatus(data.error || "Send failed.");
    else setEmailStatus(`Sent to ${data.sent.length}, failed ${data.failed.length}, skipped (no email) ${data.skippedNoEmail}.`);
  }

  async function createTemplate() {
    if (!newTitle.trim() || !newQuestions.trim()) return;
    const questions = newQuestions.split("\n").filter(Boolean).map((text, i) => ({ id: String(i), text, type: "text" }));
    await fetch("/api/talent-ai/questionnaires", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create_template", title: newTitle, questions }),
    });
    setNewTitle("");
    setNewQuestions("");
    loadTemplates();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="m-0 text-[15px] font-bold mb-2">Search the candidate database</h3>
        <div className="flex gap-2 flex-wrap">
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runSearch()} className="input flex-1 min-w-[180px]" placeholder="Name, skill, email…" />
          <label className="flex items-center gap-1.5 text-[12px] flex-shrink-0">
            <input type="checkbox" checked={external} onChange={(e) => setExternal(e.target.checked)} /> Also search LinkedIn
          </label>
          <button onClick={runSearch} disabled={searching} className="bg-brand text-white text-[12.5px] font-bold px-3 py-2 rounded-sm shadow-soft-sm disabled:opacity-50 flex-shrink-0">
            {searching ? "Searching…" : "Search"}
          </button>
        </div>
        {results.length > 0 && (
          <div className="flex flex-col gap-1.5 mt-3">
            {results.map((c) => (
              <label key={c.id} className="flex items-center gap-2 border border-border rounded-sm p-2 text-[12.5px]">
                <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} />
                <span className="font-bold">{c.name}</span>
                <span className="text-ink-muted">{c.email}</span>
                <span className="ml-auto text-[10.5px] bg-page px-1.5 py-0.5 rounded-full capitalize">{c.stage}</span>
              </label>
            ))}
          </div>
        )}
        {externalResults.length > 0 && (
          <div className="flex flex-col gap-1.5 mt-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">External (LinkedIn)</div>
            {externalResults.map((r, i) => (
              <a key={i} href={r.link} target="_blank" rel="noreferrer" className="border border-border rounded-sm p-2 text-[12px] text-ink-2">
                <div className="font-bold">{r.title}</div>
                <div className="text-ink-muted">{r.snippet}</div>
              </a>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="m-0 text-[15px] font-bold mb-2">Candidate lists</h3>
        <div className="flex gap-2 mb-2">
          <input value={newListName} onChange={(e) => setNewListName(e.target.value)} className="input" placeholder="New list name (e.g. 'Backend shortlist')" />
          <button onClick={createList} className="border border-border text-[12px] font-bold px-3 py-2 rounded-sm bg-surface flex-shrink-0">Create list</button>
        </div>
        <div className="flex flex-col gap-1.5">
          {lists.map((l) => (
            <div key={l.id} className="flex items-center justify-between border border-border rounded-sm p-2 text-[12.5px]">
              <span><strong>{l.name}</strong> — {(l.talent_candidate_list_members || []).length} candidates</span>
              <button onClick={() => addSelectedToList(l.id)} disabled={selectedIds.size === 0} className="text-[11px] font-bold text-brand disabled:opacity-40">
                Add {selectedIds.size || ""} selected
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="m-0 text-[15px] font-bold mb-2">Mass email</h3>
        <div className="flex flex-col gap-2">
          <select value={emailListId} onChange={(e) => setEmailListId(e.target.value)} className="input max-w-[280px]">
            <option value="">Use selected candidates instead ({selectedIds.size})</option>
            {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} className="input" placeholder="Subject" />
          <textarea value={emailBody} onChange={(e) => setEmailBody(e.target.value)} className="input min-h-[90px]" placeholder="Message (HTML or plain text)" />
          <button onClick={sendMassEmail} className="bg-brand text-white text-[12.5px] font-bold px-3 py-2 rounded-sm shadow-soft-sm self-start">Send</button>
          {emailStatus && <p className="text-[12px] text-ink-muted">{emailStatus}</p>}
        </div>
      </div>

      <div>
        <h3 className="m-0 text-[15px] font-bold mb-2">Questionnaire builder</h3>
        <div className="flex flex-col gap-2 mb-3">
          {templates.map((t) => (
            <div key={t.id} className="border border-border rounded-sm p-2 text-[12.5px]">
              <strong>{t.title}</strong> — {t.questions.length} question{t.questions.length === 1 ? "" : "s"}
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="input" placeholder="Template title (e.g. 'Standard Screening v1')" />
          <textarea value={newQuestions} onChange={(e) => setNewQuestions(e.target.value)} className="input min-h-[70px]" placeholder={"One question per line"} />
          <button onClick={createTemplate} className="border border-border text-[12px] font-bold px-3 py-2 rounded-sm bg-surface self-start">Save template</button>
        </div>
      </div>
    </div>
  );
}

// ---------------- Employee Jobs ----------------

type OpenRole = { id: string; title: string; department: string | null; location: string | null; work_mode: string | null; job_level: string | null };

function EmployeeJobsPanel() {
  const [roles, setRoles] = useState<OpenRole[]>([]);
  const [referring, setReferring] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  function load() {
    fetch("/api/talent-ai/employee-jobs").then((r) => r.json()).then((d) => setRoles(d.requisitions || []));
  }
  useEffect(() => { load(); }, []);

  async function submitReferral(id: string) {
    setStatus(null);
    if (!name.trim()) { setStatus("Candidate name is required."); return; }
    const res = await fetch("/api/talent-ai/employee-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requisitionId: id, name, email }),
    });
    const data = await res.json();
    if (!res.ok) setStatus(data.error || "Referral failed.");
    else {
      setStatus("Referral submitted — thank you!");
      setName(""); setEmail(""); setReferring(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="m-0 text-[15px] font-bold">Open roles</h3>
      {status && <p className="text-[12px] text-ink-2">{status}</p>}
      {roles.length === 0 && <p className="text-[12.5px] text-ink-muted">No published roles right now.</p>}
      {roles.map((r) => (
        <div key={r.id} className="border border-border rounded-md p-3.5 bg-surface">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13.5px] font-bold">{r.title}</div>
              <div className="text-[12px] text-ink-muted">{[r.department, r.location, r.work_mode, r.job_level].filter(Boolean).join(" · ")}</div>
            </div>
            <button onClick={() => setReferring(referring === r.id ? null : r.id)} className="border border-border text-[12px] font-bold px-3 py-1.5 rounded-sm bg-surface">
              Refer someone
            </button>
          </div>
          {referring === r.id && (
            <div className="flex gap-2 mt-2.5">
              <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Candidate name" />
              <input value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="Candidate email (optional)" />
              <button onClick={() => submitReferral(r.id)} className="bg-brand text-white text-[12px] font-bold px-3 py-2 rounded-sm shadow-soft-sm flex-shrink-0">Submit</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------- Admin: roles + manager assignment ----------------

type Profile = { id: string; email: string | null; full_name: string | null; manager_id: string | null; is_admin: boolean };
type RoleRow = { id: string; user_id: string; role: string };

function AdminPanel() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roleRows, setRoleRows] = useState<RoleRow[]>([]);
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function load() {
    fetch("/api/talent-ai/admin").then((r) => r.json()).then((d) => {
      setProfiles(d.profiles || []);
      setRoleRows(d.roles || []);
      setAvailableRoles(d.availableRoles || []);
    });
  }
  useEffect(() => { load(); }, []);

  async function addRole(userId: string, role: string) {
    setError(null);
    const res = await fetch("/api/talent-ai/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error || "Could not assign role.");
    load();
  }

  async function removeRole(roleAssignmentId: string) {
    await fetch(`/api/talent-ai/admin?roleAssignmentId=${roleAssignmentId}`, { method: "DELETE" });
    load();
  }

  async function setManager(userId: string, managerId: string) {
    await fetch("/api/talent-ai/admin", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, managerId: managerId || null }),
    });
    load();
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="m-0 text-[15px] font-bold">Talent.ai roles &amp; reporting lines</h3>
      {error && <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2">{error}</div>}
      <div className="flex flex-col gap-2">
        {profiles.map((p) => {
          const myRoles = roleRows.filter((r) => r.user_id === p.id);
          return (
            <div key={p.id} className="border border-border rounded-md p-3 bg-surface flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="text-[13px] font-bold">{p.full_name || p.email}{p.is_admin && <span className="ml-1.5 text-[10px] bg-page px-1.5 py-0.5 rounded-full">admin</span>}</div>
                <select value={p.manager_id || ""} onChange={(e) => setManager(p.id, e.target.value)} className="input max-w-[220px]">
                  <option value="">No manager set</option>
                  {profiles.filter((m) => m.id !== p.id).map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name || m.email} (manager)</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {myRoles.map((r) => (
                  <span key={r.id} className="text-[10.5px] bg-page px-2 py-0.5 rounded-full flex items-center gap-1 capitalize">
                    {r.role.replace("_", " ")}
                    <button onClick={() => removeRole(r.id)} className="text-critical font-bold">×</button>
                  </span>
                ))}
                <select onChange={(e) => { if (e.target.value) { addRole(p.id, e.target.value); e.target.value = ""; } }} className="input max-w-[160px] text-[11px]" defaultValue="">
                  <option value="">+ Add role</option>
                  {availableRoles.filter((r) => !myRoles.some((mr) => mr.role === r)).map((r) => (
                    <option key={r} value={r}>{r.replace("_", " ")}</option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
