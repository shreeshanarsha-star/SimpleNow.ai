"use client";

import { useEffect, useState, Fragment } from "react";

import TalentAiBoard from "@/components/tools/TalentAiBoard";

type Me = { roles: string[]; isAdmin: boolean; isOrgAdmin?: boolean; profile: { full_name: string | null; email: string | null; manager_id: string | null } | null };
type ActionItem = { id: string; kind: string; title: string; detail: string; link: string; daysWaiting: number };
type Tab = "home" | "funnel" | "approvals" | "assign" | "recruiter" | "projects" | "jobs" | "admin";

export default function TalentWorkspace() {
  const [me, setMe] = useState<Me | null>(null);
  const [tab, setTab] = useState<Tab>("home");

  useEffect(() => {
    fetch("/api/talent-ai/me").then((r) => r.json()).then((d) => setMe(d));
  }, [tab]);

  const roles = me?.roles || [];
  const isAdmin = !!me?.isAdmin;
  const isOrgAdmin = !!me?.isOrgAdmin;
  const canManageRoles = isAdmin || isOrgAdmin;
  const canApprove = isAdmin || roles.includes("reporting_manager") || roles.includes("hr_approver");
  const canAssign = isAdmin || roles.includes("ta_head");
  const canRecruit = isAdmin || roles.includes("recruiter") || roles.includes("ta_head");
  const isRecruiterOnly = roles.includes("recruiter") && !isAdmin && !isOrgAdmin;

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: "home", label: "My requisitions", show: true },
    { id: "recruiter", label: "Search candidates", show: canRecruit },
    { id: "funnel", label: "My analytics", show: canRecruit || canAssign || isAdmin },
    { id: "projects", label: "My Projects", show: canRecruit },
    { id: "approvals", label: "Approvals", show: canApprove },
    { id: "assign", label: "TA Assignment", show: canAssign },
    { id: "jobs", label: "My Jobs & Referrals", show: !isRecruiterOnly },
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

      {tab === "home" && <MyRequisitionsPanel me={me} roleFlags={{ canApprove, canAssign, canRecruit, isAdmin, isOrgAdmin }} onNavigate={setTab} />}
      {tab === "funnel" && <FunnelPanel />}
      {tab === "approvals" && <ApprovalsPanel />}
      {tab === "assign" && <AssignPanel />}
      {tab === "recruiter" && <RecruiterToolsPanel />}
      {tab === "projects" && <ProjectsPanel />}
      {tab === "jobs" && <EmployeeJobsPanel />}
      {tab === "admin" && (
        <div className="flex flex-col gap-6">
          <AdminDashboard onNavigate={setTab} />
          <UserManagementPanel />
        </div>
      )}
    </div>
  );
}

// ---------------- Home (role-based dashboard) ----------------

function MyRequisitionsPanel({
  me,
  roleFlags,
  onNavigate,
}: {
  me: Me | null;
  roleFlags: { canApprove: boolean; canAssign: boolean; canRecruit: boolean; isAdmin: boolean; isOrgAdmin: boolean };
  onNavigate: (t: Tab) => void;
}) {
  const [focusRequisitionId, setFocusRequisitionId] = useState<string | null>(null);
  const name = me?.profile?.full_name || me?.profile?.email?.split("@")[0] || "there";
  const roleLabels: string[] = [];
  if (roleFlags.isAdmin) roleLabels.push("Platform admin");
  else if (roleFlags.isOrgAdmin) roleLabels.push("Org admin");
  for (const r of me?.roles || []) {
    if (!roleLabels.includes(r)) roleLabels.push(r.replace(/_/g, " "));
  }
  if (roleLabels.length === 0) roleLabels.push("Team member");

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="text-[18px] font-bold text-ink">
          {greeting}, {name}
        </div>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {roleLabels.map((r) => (
            <span key={r} className="text-[10.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-wash text-brand capitalize">
              {r}
            </span>
          ))}
        </div>
      </div>

      {roleFlags.canAssign && <TAHeadSnapshot onNavigate={onNavigate} />}
      <ManagerSnapshot onNavigate={onNavigate} />
      {roleFlags.canRecruit && <RecruiterSnapshot onNavigate={onNavigate} onOpenRequisition={setFocusRequisitionId} />}

      <TalentAiBoard focusRequisitionId={focusRequisitionId} onFocusHandled={() => setFocusRequisitionId(null)} />
    </div>
  );
}

// ---------------- Funnel & Sources ----------------

type FunnelCandidate = { id: string; stage: string; source: string | null; requisition_id: string };
type FunnelReq = { id: string; title: string };

const FUNNEL_STAGES = [
  { id: "applied", label: "Applied" },
  { id: "screening", label: "Screening" },
  { id: "hm_review", label: "HM Review" },
  { id: "interview_1", label: "Interview 1" },
  { id: "interview_2", label: "Interview 2" },
  { id: "hr_interview", label: "HR Interview" },
  { id: "selected", label: "Offer in process" },
  { id: "offer", label: "Offered" },
  { id: "bgv", label: "BGV" },
  { id: "ready_to_join", label: "Ready to Join" },
  { id: "joined", label: "Joined" },
];

const SOURCE_META: Record<string, { label: string; className: string }> = {
  referral: { label: "Employee referral", className: "bg-brand" },
  sourced: { label: "Sourced", className: "bg-good" },
  inbound: { label: "Inbound", className: "bg-warning" },
  other: { label: "Other", className: "bg-ink-muted" },
};

function FunnelPanel() {
  const [candidates, setCandidates] = useState<FunnelCandidate[]>([]);
  const [reqs, setReqs] = useState<FunnelReq[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/talent-ai/candidates").then((r) => r.json()),
      fetch("/api/talent-ai/requisitions").then((r) => r.json()),
    ])
      .then(([c, r]) => {
        setCandidates(c.candidates || []);
        setReqs((r.requisitions || []).map((x: { id: string; title: string }) => ({ id: x.id, title: x.title })));
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-[13px] text-ink-muted">Loading…</div>;
  if (candidates.length === 0) {
    return <p className="text-[12.5px] text-ink-muted">No candidates yet — the funnel fills in once people start applying.</p>;
  }

  // A candidate currently sitting in a later stage has, by definition,
  // passed through every stage before it -- so each funnel row counts
  // "reached this stage or further", not just "currently sitting here".
  const stageOrderIds = STAGES_ORDER;
  const funnelCounts = FUNNEL_STAGES.map((s) => {
    const minIdx = stageOrderIds.indexOf(s.id);
    return candidates.filter((c) => {
      const idx = stageOrderIds.indexOf(c.stage);
      return idx >= minIdx && c.stage !== "rejected";
    }).length;
  });
  const rejectedCount = candidates.filter((c) => c.stage === "rejected").length;
  // "Hired" means reached Offered or further (Offered/BGV/Ready to Join/Joined) --
  // not just literally sitting in the Offered column right now.
  const offerIdx = STAGES_ORDER.indexOf("offer");
  const hiredCount = candidates.filter((c) => STAGES_ORDER.indexOf(c.stage) >= offerIdx && c.stage !== "rejected").length;
  const topOfFunnel = funnelCounts[0] || candidates.length;

  const sourceCounts: Record<string, number> = {};
  candidates.forEach((c) => {
    const key = c.source && SOURCE_META[c.source] ? c.source : "other";
    sourceCounts[key] = (sourceCounts[key] || 0) + 1;
  });
  const sourceEntries = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]);
  const totalSourced = candidates.length;

  const byReq: Record<string, number> = {};
  candidates.forEach((c) => { byReq[c.requisition_id] = (byReq[c.requisition_id] || 0) + 1; });
  const topReqs = Object.entries(byReq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({ title: reqs.find((r) => r.id === id)?.title || "Untitled requisition", count }));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total candidates" value={candidates.length} />
        <StatCard label="In active pipeline" value={candidates.length - rejectedCount - hiredCount} />
        <StatCard label="At offer stage" value={hiredCount} accent="good" />
        <StatCard label="Rejected" value={rejectedCount} accent="critical" />
      </div>

      <div className="border border-border rounded-md p-4 bg-surface flex flex-col gap-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Hiring funnel</div>
        <div className="flex flex-col gap-2">
          {FUNNEL_STAGES.map((s, i) => {
            const count = funnelCounts[i];
            const pct = topOfFunnel > 0 ? Math.round((count / topOfFunnel) * 100) : 0;
            const widthPct = Math.max(pct, count > 0 ? 6 : 0);
            return (
              <div key={s.id} className="flex items-center gap-3">
                <div className="w-[92px] flex-shrink-0 text-[11.5px] font-bold text-ink-2">{s.label}</div>
                <div className="flex-1 h-7 bg-page rounded-sm overflow-hidden relative">
                  <div
                    className="h-full rounded-sm flex items-center justify-end px-2 transition-all"
                    style={{
                      width: `${widthPct}%`,
                      background: `linear-gradient(90deg, rgb(var(--brand-rgb) / 0.35), rgb(var(--brand-rgb) / 0.9))`,
                    }}
                  >
                    {widthPct > 14 && <span className="text-[11px] font-bold text-white">{count}</span>}
                  </div>
                  {widthPct <= 14 && (
                    <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-ink-2">{count}</span>
                  )}
                </div>
                <div className="w-[38px] flex-shrink-0 text-[11px] text-ink-muted text-right">{pct}%</div>
              </div>
            );
          })}
        </div>
        <p className="m-0 text-[11px] text-ink-muted">
          Each stage counts everyone who reached it or moved further — rejected candidates ({rejectedCount}) are excluded from the funnel above.
        </p>
      </div>

      <div className="border border-border rounded-md p-4 bg-surface flex flex-col gap-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Source mix</div>
        <div className="h-4 rounded-full overflow-hidden flex w-full border border-border">
          {sourceEntries.map(([key, count]) => {
            const meta = SOURCE_META[key] || SOURCE_META.other;
            const pct = (count / totalSourced) * 100;
            return <div key={key} className={meta.className} style={{ width: `${pct}%` }} title={`${meta.label}: ${count}`} />;
          })}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {sourceEntries.map(([key, count]) => {
            const meta = SOURCE_META[key] || SOURCE_META.other;
            const pct = Math.round((count / totalSourced) * 100);
            return (
              <div key={key} className="flex items-center gap-1.5 text-[12px]">
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${meta.className}`} />
                <span className="text-ink-2 font-medium">{meta.label}</span>
                <span className="text-ink-muted">{count} · {pct}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {topReqs.length > 0 && (
        <div className="border border-border rounded-md p-4 bg-surface flex flex-col gap-2.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Busiest requisitions</div>
          {topReqs.map((r) => (
            <div key={r.title} className="flex items-center justify-between text-[12.5px]">
              <span className="text-ink-2 truncate pr-3">{r.title}</span>
              <span className="text-ink-muted font-bold flex-shrink-0">{r.count} candidate{r.count === 1 ? "" : "s"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- TA Head snapshot (embedded in Home) ----------------

type TADeptRow = { department: string; count: number };
type TATrendRow = { month: string; avgDays: number | null; offers: number };
type TARequesterRow = { name: string; requisitions: number };

function TAHeadSnapshot({ onNavigate }: { onNavigate: (t: Tab) => void }) {
  const [counts, setCounts] = useState<{ openRequisitions: number; activeCandidates: number; avgDaysToFirstOffer: number | null } | null>(null);
  const [departmentBreakdown, setDepartmentBreakdown] = useState<TADeptRow[]>([]);
  const [timeToHireTrend, setTimeToHireTrend] = useState<TATrendRow[]>([]);
  const [topRequesters, setTopRequesters] = useState<TARequesterRow[]>([]);

  useEffect(() => {
    fetch("/api/talent-ai/ta-dashboard").then((r) => r.json()).then((d) => {
      if (d.error) return; // not a TA head/admin -- silently skip, HomePanel already gates on canAssign
      setCounts(d.counts || null);
      setDepartmentBreakdown(d.departmentBreakdown || []);
      setTimeToHireTrend(d.timeToHireTrend || []);
      setTopRequesters(d.topRequesters || []);
    });
  }, []);

  if (!counts) return null;

  const maxDept = Math.max(1, ...departmentBreakdown.map((d) => d.count));
  const maxTrendDays = Math.max(1, ...timeToHireTrend.map((t) => t.avgDays || 0));

  return (
    <div className="flex flex-col gap-3 border border-border rounded-lg p-4 bg-surface">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-bold text-ink">TA overview (org-wide)</div>
        <div className="flex items-center gap-2">
          <button onClick={() => onNavigate("funnel")} className="text-[11.5px] font-semibold px-2.5 py-1 border border-border rounded-md hover:border-brand">Funnel &amp; sources</button>
          <button onClick={() => onNavigate("assign")} className="text-[11.5px] font-semibold px-2.5 py-1 border border-border rounded-md hover:border-brand">TA assignment</button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Open requisitions" value={counts.openRequisitions} />
        <StatCard label="Active candidates" value={counts.activeCandidates} />
        <StatCard label="Avg days: req → first offer" value={counts.avgDaysToFirstOffer === null ? "—" : counts.avgDaysToFirstOffer} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="border border-border rounded-md overflow-hidden">
          <div className="px-3 py-2 bg-surface-muted border-b border-border text-[11px] font-bold uppercase tracking-wider text-ink-muted">Requisitions by department</div>
          <div className="p-3 flex flex-col gap-2">
            {departmentBreakdown.length === 0 && <div className="text-[12px] text-ink-muted">No requisitions yet.</div>}
            {departmentBreakdown.map((d) => (
              <div key={d.department} className="flex items-center gap-2">
                <div className="w-[100px] text-[11px] text-ink-muted truncate flex-shrink-0">{d.department}</div>
                <div className="flex-1 h-[7px] rounded-full bg-page overflow-hidden">
                  <div className="h-full bg-brand rounded-full" style={{ width: `${(d.count / maxDept) * 100}%` }} />
                </div>
                <div className="w-[20px] text-[11px] font-semibold text-right flex-shrink-0">{d.count}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="border border-border rounded-md overflow-hidden">
          <div className="px-3 py-2 bg-surface-muted border-b border-border text-[11px] font-bold uppercase tracking-wider text-ink-muted">Time to hire trend (last 6 months)</div>
          <div className="p-3 flex flex-col gap-2">
            {timeToHireTrend.map((t) => (
              <div key={t.month} className="flex items-center gap-2">
                <div className="w-[46px] text-[11px] text-ink-muted flex-shrink-0">{t.month}</div>
                <div className="flex-1 h-[7px] rounded-full bg-page overflow-hidden">
                  {t.avgDays !== null && <div className="h-full bg-good rounded-full" style={{ width: `${(t.avgDays / maxTrendDays) * 100}%` }} />}
                </div>
                <div className="w-[64px] text-[11px] font-semibold text-right flex-shrink-0">{t.avgDays === null ? "no offers" : `${t.avgDays}d (${t.offers})`}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {topRequesters.length > 0 && (
        <div className="border border-border rounded-md overflow-hidden">
          <div className="px-3 py-2 bg-surface-muted border-b border-border text-[11px] font-bold uppercase tracking-wider text-ink-muted">Top requisition requesters</div>
          <div className="divide-y divide-border">
            {topRequesters.map((r) => (
              <div key={r.name} className="flex items-center justify-between gap-2 px-3 py-2 text-[12.5px]">
                <span>{r.name}</span>
                <span className="text-ink-muted">{r.requisitions} requisitions</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- Hiring manager snapshot (embedded in Home) ----------------

type ManagerTeamRow = { id: string; name: string | null; roles: string[] };
type ManagerReqRow = { id: string; title: string; department: string | null; status: string; candidateCount: number; inInterviewCount: number };
type ManagerCandidateRow = { id: string; name: string; stage: string; requisitionTitle: string; requisitionId: string };

function ManagerSnapshot({ onNavigate }: { onNavigate: (t: Tab) => void }) {
  const [counts, setCounts] = useState<{ myTeam: number; myRequisitions: number; candidatesInInterview: number; pendingApprovalsFromMe: number } | null>(null);
  const [myTeam, setMyTeam] = useState<ManagerTeamRow[]>([]);
  const [myRequisitions, setMyRequisitions] = useState<ManagerReqRow[]>([]);
  const [candidatesInInterview, setCandidatesInInterview] = useState<ManagerCandidateRow[]>([]);

  useEffect(() => {
    fetch("/api/talent-ai/manager-snapshot").then((r) => r.json()).then((d) => {
      setCounts(d.counts || null);
      setMyTeam(d.myTeam || []);
      setMyRequisitions(d.myRequisitions || []);
      setCandidatesInInterview(d.candidatesInInterview || []);
    });
  }, []);

  if (!counts) return null;
  if (counts.myTeam === 0 && counts.myRequisitions === 0) return null; // not acting as a manager -- nothing to show

  return (
    <div className="flex flex-col gap-3 border border-border rounded-lg p-4 bg-surface">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-bold text-ink">My team &amp; hiring</div>
        <button onClick={() => onNavigate("home")} className="text-[11.5px] font-semibold px-2.5 py-1 border border-border rounded-md hover:border-brand">My requisitions</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="My team" value={counts.myTeam} />
        <StatCard label="My requisitions" value={counts.myRequisitions} />
        <StatCard label="Candidates in review/interview" value={counts.candidatesInInterview} />
        <StatCard label="Approvals waiting on me" value={counts.pendingApprovalsFromMe} />
      </div>

      {myTeam.length > 0 && (
        <div className="border border-border rounded-md overflow-hidden">
          <div className="px-3 py-2 bg-surface-muted border-b border-border text-[11px] font-bold uppercase tracking-wider text-ink-muted">My team</div>
          <div className="divide-y divide-border">
            {myTeam.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 text-[12.5px]">
                <span>{t.name}</span>
                <span className="text-[10.5px] text-ink-muted capitalize">{t.roles.length ? t.roles.map((r) => r.replace(/_/g, " ")).join(", ") : "Employee"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {myRequisitions.length > 0 && (
        <div className="border border-border rounded-md overflow-hidden">
          <div className="px-3 py-2 bg-surface-muted border-b border-border text-[11px] font-bold uppercase tracking-wider text-ink-muted">My requisitions</div>
          <div className="divide-y divide-border">
            {myRequisitions.map((r) => (
              <a key={r.id} href={`/tools/talent-ai?requisition=${r.id}`} className="flex items-center justify-between gap-2 px-3 py-2 text-[12.5px] hover:bg-brand-wash/40">
                <span><strong>{r.title}</strong> — <span className="text-ink-muted">{r.department || "No department"} · {r.status.replace(/_/g, " ")}</span></span>
                <span className="text-[11px] text-ink-muted flex-shrink-0">{r.inInterviewCount} in review / {r.candidateCount} total</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {candidatesInInterview.length > 0 && (
        <div className="border border-border rounded-md overflow-hidden">
          <div className="px-3 py-2 bg-surface-muted border-b border-border text-[11px] font-bold uppercase tracking-wider text-ink-muted">Candidates in review / interview</div>
          <div className="divide-y divide-border">
            {candidatesInInterview.map((c) => (
              <a key={c.id} href={`/tools/talent-ai?requisition=${c.requisitionId}`} className="flex items-center justify-between gap-2 px-3 py-2 text-[12.5px] hover:bg-brand-wash/40">
                <span><strong>{c.name}</strong> — <span className="text-ink-muted">{c.requisitionTitle}</span></span>
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-brand flex-shrink-0">{c.stage.replace(/_/g, " ")}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- Recruiter snapshot (embedded in Home) ----------------

type RecruiterReqRow = {
  id: string;
  title: string;
  department: string | null;
  status: string;
  headcount: number | null;
  candidateCount: number;
  activeCandidateCount: number;
  stageCounts: Record<string, number>;
};
type FunnelColumn = { id: string; label: string };

function RecruiterSnapshot({ onNavigate, onOpenRequisition }: { onNavigate: (t: Tab) => void; onOpenRequisition: (id: string) => void }) {
  const [funnelColumns, setFunnelColumns] = useState<FunnelColumn[]>([]);
  const [myRequisitions, setMyRequisitions] = useState<RecruiterReqRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/talent-ai/recruiter-snapshot").then((r) => r.json()).then((d) => {
      setFunnelColumns(d.funnelColumns || []);
      setMyRequisitions(d.myRequisitions || []);
      setLoaded(true);
    });
  }, []);

  if (!loaded) return null;
  if (myRequisitions.length === 0) return null; // nothing assigned yet -- don't show an empty recruiting section

  return (
    <div className="flex flex-col gap-3 border border-border rounded-lg p-4 bg-surface">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-bold text-ink">My requisitions</div>
        <button onClick={() => onNavigate("recruiter")} className="text-[11.5px] font-semibold px-2.5 py-1 border border-border rounded-md hover:border-brand">Search candidates</button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr>
              <th className="text-left font-bold text-ink-muted uppercase tracking-wider text-[10px] px-2.5 py-2 border-b border-border sticky left-0 bg-surface">
                Requisition
              </th>
              {funnelColumns.map((col) => (
                <th key={col.id} className="text-right font-bold text-ink-muted uppercase tracking-wider text-[9.5px] px-2 py-2 border-b border-border whitespace-nowrap">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {myRequisitions.map((r) => (
              <tr key={r.id} className="hover:bg-brand-wash/30 cursor-pointer" onClick={() => onOpenRequisition(r.id)}>
                <td className="px-2.5 py-2 border-b border-border sticky left-0 bg-surface">
                  <div className="font-bold text-[12.5px]">{r.title}</div>
                  <div className="text-[10.5px] text-ink-muted">{r.department || "No department"}</div>
                </td>
                {funnelColumns.map((col) => {
                  const n = r.stageCounts?.[col.id] ?? 0;
                  return (
                    <td key={col.id} className={`text-right px-2 py-2 border-b border-border tabular-nums ${n > 0 ? "font-bold text-ink" : "text-ink-muted"}`}>
                      {n}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const STAGES_ORDER = [
  "applied",
  "screening",
  "hm_review",
  "interview_1",
  "interview_2",
  "hr_interview",
  "selected",
  "offer",
  "bgv",
  "ready_to_join",
  "joined",
  "rejected",
];

function StatCard({ label, value, accent }: { label: string; value: number | string; accent?: "good" | "critical" }) {
  const valueClass = accent === "good" ? "text-good-text" : accent === "critical" ? "text-critical" : "text-ink";
  return (
    <div className="border border-border rounded-md p-3.5 bg-surface flex flex-col gap-1">
      <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted">{label}</div>
      <div className={`text-[22px] font-extrabold ${valueClass}`}>{value}</div>
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
    description: string | null; jd_source_text: string | null; work_mode: string | null;
    employment_type: string | null; job_level: string | null; target_hire_date: string | null;
    comments: string | null; replacement_name: string | null; replacement_employee_id: string | null;
  };
};

function ApprovalsPanel() {
  const [steps, setSteps] = useState<ApprovalStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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
            <button
              type="button"
              onClick={() => setExpanded((prev) => ({ ...prev, [s.id]: !prev[s.id] }))}
              className="text-[11.5px] font-bold text-brand self-start"
            >
              {expanded[s.id] ? "Hide details ↑" : "View full details ↓"}
            </button>
            {expanded[s.id] && (
              <div className="border border-border rounded-sm bg-page p-3 flex flex-col gap-2 text-[12.5px]">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-ink-2">
                  {r.work_mode && <div><span className="text-ink-muted">Work mode:</span> {r.work_mode}</div>}
                  {r.employment_type && <div><span className="text-ink-muted">Employment type:</span> {r.employment_type}</div>}
                  {r.job_level && <div><span className="text-ink-muted">Level:</span> {r.job_level}</div>}
                  {r.target_hire_date && <div><span className="text-ink-muted">Target hire date:</span> {r.target_hire_date}</div>}
                  {r.requisition_type === "replacement" && r.replacement_name && (
                    <div className="col-span-2"><span className="text-ink-muted">Replacing:</span> {r.replacement_name} {r.replacement_employee_id ? `(${r.replacement_employee_id})` : ""}</div>
                  )}
                </div>
                {r.description && (
                  <div>
                    <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted mb-1">Role summary</div>
                    <p className="m-0 text-ink-2 whitespace-pre-wrap">{r.description}</p>
                  </div>
                )}
                {r.jd_source_text && (
                  <div>
                    <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted mb-1">Full job description</div>
                    <p className="m-0 text-ink-2 whitespace-pre-wrap max-h-64 overflow-y-auto">{r.jd_source_text}</p>
                  </div>
                )}
                {r.comments && (
                  <div>
                    <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted mb-1">Requester notes</div>
                    <p className="m-0 text-ink-2 whitespace-pre-wrap">{r.comments}</p>
                  </div>
                )}
                {!r.description && !r.jd_source_text && (
                  <p className="m-0 text-ink-muted italic">No job description was attached to this requisition.</p>
                )}
              </div>
            )}
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

  return (
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
            <div key={c.id} className="flex items-center gap-2 border border-border rounded-sm p-2 text-[12.5px]">
              <span className="font-bold">{c.name}</span>
              <span className="text-ink-muted">{c.email}</span>
              <span className="ml-auto text-[10.5px] bg-page px-1.5 py-0.5 rounded-full capitalize">{c.stage}</span>
            </div>
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
  );
}

// ---------------- My Projects (candidate lists, mass email, questionnaires) ----------------

function ProjectsPanel() {
  const [lists, setLists] = useState<CandidateList[]>([]);
  const [newListName, setNewListName] = useState("");
  const [openListId, setOpenListId] = useState<string | null>(null);

  const [addQ, setAddQ] = useState("");
  const [addResults, setAddResults] = useState<SearchCandidate[]>([]);
  const [addSearching, setAddSearching] = useState(false);
  const [addSelectedIds, setAddSelectedIds] = useState<Set<string>>(new Set());

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

  function toggleAddSelect(id: string) {
    setAddSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function runAddSearch() {
    if (!addQ.trim()) return;
    setAddSearching(true);
    try {
      const res = await fetch(`/api/talent-ai/candidates/search?q=${encodeURIComponent(addQ)}`);
      const data = await res.json();
      setAddResults(data.candidates || []);
    } finally {
      setAddSearching(false);
    }
  }

  async function addSelectedToList(listId: string) {
    if (addSelectedIds.size === 0) return;
    await fetch("/api/talent-ai/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_members", listId, candidateIds: Array.from(addSelectedIds) }),
    });
    setAddSelectedIds(new Set());
    setAddResults([]);
    setAddQ("");
    loadLists();
  }

  async function sendMassEmail() {
    setEmailStatus(null);
    if (!emailSubject.trim() || !emailBody.trim()) {
      setEmailStatus("Subject and body are required.");
      return;
    }
    if (!emailListId) {
      setEmailStatus("Pick a project to email.");
      return;
    }
    const res = await fetch("/api/talent-ai/mass-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: emailSubject, html: emailBody, listId: emailListId }),
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
        <h3 className="m-0 text-[15px] font-bold mb-2">My Projects</h3>
        <div className="flex gap-2 mb-2">
          <input value={newListName} onChange={(e) => setNewListName(e.target.value)} className="input" placeholder="New project name (e.g. 'Backend shortlist')" />
          <button onClick={createList} className="border border-border text-[12px] font-bold px-3 py-2 rounded-sm bg-surface flex-shrink-0">Create project</button>
        </div>
        <div className="flex flex-col gap-1.5">
          {lists.map((l) => (
            <div key={l.id} className="border border-border rounded-sm overflow-hidden">
              <button
                onClick={() => setOpenListId(openListId === l.id ? null : l.id)}
                className="w-full flex items-center justify-between p-2 text-[12.5px] text-left"
              >
                <span><strong>{l.name}</strong> — {(l.talent_candidate_list_members || []).length} candidates</span>
                <span className="text-[11px] text-brand font-semibold">{openListId === l.id ? "Close" : "Add candidates"}</span>
              </button>
              {openListId === l.id && (
                <div className="border-t border-border p-2.5 bg-surface-muted flex flex-col gap-2">
                  <div className="flex gap-2">
                    <input value={addQ} onChange={(e) => setAddQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runAddSearch()} className="input flex-1" placeholder="Search candidates to add…" />
                    <button onClick={runAddSearch} disabled={addSearching} className="border border-border text-[12px] font-bold px-3 py-2 rounded-sm bg-surface disabled:opacity-50 flex-shrink-0">
                      {addSearching ? "…" : "Search"}
                    </button>
                  </div>
                  {addResults.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      {addResults.map((c) => (
                        <label key={c.id} className="flex items-center gap-2 border border-border rounded-sm p-2 text-[12px] bg-surface">
                          <input type="checkbox" checked={addSelectedIds.has(c.id)} onChange={() => toggleAddSelect(c.id)} />
                          <span className="font-bold">{c.name}</span>
                          <span className="text-ink-muted">{c.email}</span>
                        </label>
                      ))}
                      <button onClick={() => addSelectedToList(l.id)} disabled={addSelectedIds.size === 0} className="text-[11px] font-bold text-brand disabled:opacity-40 self-start">
                        Add {addSelectedIds.size || ""} selected to this project
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="m-0 text-[15px] font-bold mb-2">Mass email</h3>
        <div className="flex flex-col gap-2">
          <select value={emailListId} onChange={(e) => setEmailListId(e.target.value)} className="input max-w-[280px]">
            <option value="">Pick a project…</option>
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

type MyCandidateRow = {
  id: string;
  name: string;
  stage: string;
  source: string;
  createdAt: string;
  requisitionId: string;
  requisitionTitle: string;
};
type UpcomingInterviewRow = { id: string; requisitionTitle: string; roundName: string | null; scheduledAt: string | null; mode: string | null };

function EmployeeJobsPanel() {
  const [roles, setRoles] = useState<OpenRole[]>([]);
  const [mine, setMine] = useState<MyCandidateRow[]>([]);
  const [upcomingInterviews, setUpcomingInterviews] = useState<UpcomingInterviewRow[]>([]);
  const [referring, setReferring] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);

  function load() {
    fetch("/api/talent-ai/employee-jobs").then((r) => r.json()).then((d) => {
      setRoles(d.requisitions || []);
      setMine(d.mine || []);
      setUpcomingInterviews(d.upcomingInterviews || []);
    });
  }
  useEffect(() => { load(); }, []);

  const myApplications = mine.filter((c) => c.source === "internal_application");
  const myReferrals = mine.filter((c) => c.source !== "internal_application");
  const appliedRequisitionIds = new Set(myApplications.map((c) => c.requisitionId));

  async function applyForSelf(id: string) {
    setStatus(null);
    setApplying(id);
    const res = await fetch("/api/talent-ai/employee-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requisitionId: id, isSelf: true }),
    });
    const data = await res.json();
    setApplying(null);
    if (!res.ok) setStatus(data.error || "Could not apply.");
    else {
      setStatus("Application submitted — good luck!");
      load();
    }
  }

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
      load();
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="My applications" value={myApplications.length} />
        <StatCard label="My referrals" value={myReferrals.length} />
        <StatCard label="Open roles" value={roles.length} />
        <StatCard label="Upcoming interviews" value={upcomingInterviews.length} />
      </div>

      {status && <p className="text-[12px] text-ink-2">{status}</p>}

      {upcomingInterviews.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="px-3.5 py-2.5 bg-surface-muted border-b border-border text-[12px] font-bold">Your upcoming interviews</div>
          <div className="divide-y divide-border">
            {upcomingInterviews.map((iv) => (
              <div key={iv.id} className="flex items-center justify-between gap-2 px-3.5 py-2.5 text-[12.5px]">
                <span><strong>{iv.requisitionTitle}</strong> — <span className="text-ink-muted">{iv.roundName || "Interview"}{iv.mode ? ` · ${iv.mode}` : ""}</span></span>
                <span className="text-[11px] text-ink-muted flex-shrink-0">{iv.scheduledAt ? new Date(iv.scheduledAt).toLocaleString() : "Time TBD"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {mine.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="px-3.5 py-2.5 bg-surface-muted border-b border-border text-[12px] font-bold">My applications &amp; referrals</div>
          <div className="divide-y divide-border">
            {mine.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 px-3.5 py-2.5 text-[12.5px]">
                <span>
                  <strong>{c.requisitionTitle}</strong>{" "}
                  <span className="text-ink-muted">
                    {c.source === "internal_application" ? "— you applied" : `— referred: ${c.name}`}
                  </span>
                </span>
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-brand flex-shrink-0">{c.stage.replace(/_/g, " ")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h3 className="m-0 text-[15px] font-bold">Open roles</h3>
        {roles.length === 0 && <p className="text-[12.5px] text-ink-muted">No published roles right now.</p>}
        {roles.map((r) => (
          <div key={r.id} className="border border-border rounded-md p-3.5 bg-surface">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <div className="text-[13.5px] font-bold">{r.title}</div>
                <div className="text-[12px] text-ink-muted">{[r.department, r.location, r.work_mode, r.job_level].filter(Boolean).join(" · ")}</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => applyForSelf(r.id)}
                  disabled={appliedRequisitionIds.has(r.id) || applying === r.id}
                  className="bg-brand text-white text-[12px] font-bold px-3 py-1.5 rounded-sm shadow-soft-sm disabled:opacity-50"
                >
                  {appliedRequisitionIds.has(r.id) ? "Applied" : applying === r.id ? "Applying..." : "Apply"}
                </button>
                <button onClick={() => setReferring(referring === r.id ? null : r.id)} className="border border-border text-[12px] font-bold px-3 py-1.5 rounded-sm bg-surface">
                  Refer someone
                </button>
              </div>
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
    </div>
  );
}

// ---------------- Admin: roles + manager assignment ----------------

type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  manager_id: string | null;
  is_admin: boolean;
  org_role?: string | null;
  employee_id?: string | null;
  department?: string | null;
  designation?: string | null;
  location?: string | null;
  joining_date?: string | null;
  status?: "active" | "pending" | "suspended";
};
type RoleRow = { id: string; user_id: string; role: string };

// ---------------- Admin Dashboard ----------------

type DashboardCounts = {
  totalRequisitions: number;
  totalCandidates: number;
  openPositions: number;
  offersThisMonth: number;
  avgDaysToFirstOffer: number | null;
};
type DeptRow = { department: string; count: number };
type ActivityRow = { id: string; title: string; fromStatus: string; toStatus: string; actor: string; changedAt: string };
type AdminProfileRow = { id: string; email: string | null; full_name: string | null; is_admin: boolean; org_role: string | null };

function timeAgo(iso: string) {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function AdminDashboard({ onNavigate }: { onNavigate: (t: Tab) => void }) {
  const [counts, setCounts] = useState<DashboardCounts | null>(null);
  const [depts, setDepts] = useState<DeptRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<ActionItem[]>([]);
  const [users, setUsers] = useState<AdminProfileRow[]>([]);

  useEffect(() => {
    fetch("/api/talent-ai/admin/dashboard").then((r) => r.json()).then((d) => {
      setCounts(d.counts || null);
      setDepts(d.departmentBreakdown || []);
      setActivity(d.recentActivity || []);
    });
    fetch("/api/talent-ai/action-queue").then((r) => r.json()).then((d) => {
      setPendingApprovals((d.items || []).filter((it: ActionItem) => it.kind === "approval"));
    });
    fetch("/api/talent-ai/admin").then((r) => r.json()).then((d) => setUsers(d.profiles || []));
  }, []);

  const maxDept = Math.max(1, ...depts.map((d) => d.count));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="m-0 text-[15px] font-bold">Administrator dashboard</h3>
        <div className="flex items-center gap-2">
          <button onClick={() => onNavigate("home")} className="text-[12px] font-semibold px-3 py-1.5 border border-border rounded-md hover:border-brand">My requisitions</button>
          <button onClick={() => onNavigate("funnel")} className="text-[12px] font-semibold px-3 py-1.5 border border-border rounded-md hover:border-brand">My analytics</button>
        </div>
      </div>

      {!counts ? (
        <div className="text-[12.5px] text-ink-muted">Loading...</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatCard label="Total requisitions" value={counts.totalRequisitions} />
          <StatCard label="Total candidates" value={counts.totalCandidates} />
          <StatCard label="Open positions" value={counts.openPositions} />
          <StatCard label="Offers extended (this mo.)" value={counts.offersThisMonth} />
          <StatCard
            label="Avg days: req → first offer"
            value={counts.avgDaysToFirstOffer === null ? "—" : counts.avgDaysToFirstOffer}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="px-3.5 py-2.5 bg-surface-muted border-b border-border text-[12px] font-bold">
            Requisitions by department
          </div>
          <div className="p-3.5 flex flex-col gap-2">
            {depts.length === 0 && <div className="text-[12px] text-ink-muted">No requisitions yet.</div>}
            {depts.map((d) => (
              <div key={d.department} className="flex items-center gap-2">
                <div className="w-[110px] text-[11.5px] text-ink-muted truncate flex-shrink-0">{d.department}</div>
                <div className="flex-1 h-[8px] rounded-full bg-page overflow-hidden">
                  <div className="h-full bg-brand rounded-full" style={{ width: `${(d.count / maxDept) * 100}%` }} />
                </div>
                <div className="w-[24px] text-[11.5px] font-semibold text-right flex-shrink-0">{d.count}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="border border-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-surface-muted border-b border-border">
            <div className="text-[12px] font-bold">Approvals pending ({pendingApprovals.length})</div>
            <button onClick={() => onNavigate("approvals")} className="text-[11px] font-semibold text-brand">View all →</button>
          </div>
          <div className="divide-y divide-border max-h-[220px] overflow-y-auto">
            {pendingApprovals.length === 0 && <div className="p-3.5 text-[12px] text-ink-muted">Nothing waiting on an approver right now.</div>}
            {pendingApprovals.slice(0, 6).map((it) => (
              <a key={it.id} href={it.link} className="flex items-center justify-between gap-2 px-3.5 py-2.5 hover:bg-brand-wash/40 text-[12px]">
                <span><strong>{it.title}</strong> — <span className="text-ink-muted">{it.detail}</span></span>
                <span className="text-[10.5px] text-ink-muted flex-shrink-0">{it.daysWaiting}d</span>
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <div className="px-3.5 py-2.5 bg-surface-muted border-b border-border text-[12px] font-bold">
          Recent requisition activity
        </div>
        <div className="divide-y divide-border">
          {activity.length === 0 && <div className="p-3.5 text-[12px] text-ink-muted">No status changes recorded yet.</div>}
          {activity.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2 px-3.5 py-2.5 text-[12px]">
              <span>
                <strong>{a.actor}</strong> moved <strong>{a.title}</strong>{" "}
                <span className="text-ink-muted">{a.fromStatus.replace(/_/g, " ")} → {a.toStatus.replace(/_/g, " ")}</span>
              </span>
              <span className="text-[10.5px] text-ink-muted flex-shrink-0">{timeAgo(a.changedAt)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-surface-muted border-b border-border">
          <div className="text-[12px] font-bold">People in your org ({users.length})</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-ink-muted border-b border-border">
                <th className="px-3.5 py-2 font-semibold">Name</th>
                <th className="px-3.5 py-2 font-semibold">Email</th>
                <th className="px-3.5 py-2 font-semibold">Org role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-3.5 py-2">{u.full_name || "—"}</td>
                  <td className="px-3.5 py-2 text-ink-muted">{u.email}</td>
                  <td className="px-3.5 py-2">{u.is_admin ? "Platform admin" : u.org_role === "org_admin" ? "Org admin" : "Member"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const ROLE_ACCESS_LABEL: Record<string, string> = {
  admin: "Full org access (matches what org admins already get automatically)",
  ta_head: "All requisitions & candidates org-wide; can assign recruiters",
  lead_recruiter: "Same as Recruiter today (separate 'whole TA team' scope not yet built)",
  recruiter: "Assigned requisitions & their candidates",
  hiring_manager: "Own requisitions & candidates submitted to them",
  reporting_manager: "Approves requisitions from their direct reports",
  hr_approver: "Second-step approver on every requisition (pool-based)",
  hr_head: "Same approval power as HR Approver today (senior HR label)",
  hr_ops: "Holds Talent.ai access; no separate approval/assignment power yet",
};

const USER_TYPE_OPTIONS: { value: string; label: string; kind: "org" | "talent" | "none" }[] = [
  { value: "employee", label: "Employee (no Talent.ai role)", kind: "none" },
  { value: "recruiter", label: "Recruiter", kind: "talent" },
  { value: "lead_recruiter", label: "Lead Recruiter", kind: "talent" },
  { value: "hiring_manager", label: "Hiring Manager", kind: "talent" },
  { value: "reporting_manager", label: "Reporting Manager (Approver)", kind: "talent" },
  { value: "ta_head", label: "TA Head", kind: "talent" },
  { value: "hr_ops", label: "HR", kind: "talent" },
  { value: "hr_head", label: "HR Head (Approver)", kind: "talent" },
  { value: "hr_approver", label: "HR Approver", kind: "talent" },
  { value: "org_admin", label: "Administrator", kind: "org" },
];

const STATUS_META: Record<string, { label: string; dot: string }> = {
  active: { label: "Active", dot: "bg-good" },
  pending: { label: "Pending invite", dot: "bg-warning" },
  suspended: { label: "Suspended", dot: "bg-critical" },
};

function UserManagementPanel() {
  const [subTab, setSubTab] = useState<"users" | "roles">("users");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roleRows, setRoleRows] = useState<RoleRow[]>([]);
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAddUser, setShowAddUser] = useState(false);

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

  async function toggleSuspend(userId: string, suspend: boolean) {
    await fetch("/api/talent-ai/admin", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, suspend }),
    });
    load();
  }

  const departments = Array.from(new Set(profiles.map((p) => p.department).filter(Boolean))) as string[];

  const filtered = profiles.filter((p) => {
    if (search) {
      const q = search.toLowerCase();
      const hay = [p.full_name, p.email, p.employee_id].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (roleFilter && !roleRows.some((r) => r.user_id === p.id && r.role === roleFilter)) return false;
    if (deptFilter && p.department !== deptFilter) return false;
    if (statusFilter && (p.status || "active") !== statusFilter) return false;
    return true;
  });

  const counts = { active: 0, pending: 0, suspended: 0 };
  for (const p of profiles) counts[(p.status || "active") as "active" | "pending" | "suspended"] += 1;

  const roleCounts = availableRoles.map((r) => ({
    role: r,
    count: roleRows.filter((rr) => rr.role === r).length,
    access: ROLE_ACCESS_LABEL[r] || "—",
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="m-0 text-[15px] font-bold">User management</h3>
        <div className="flex items-center gap-1.5 border-b border-border">
          {(["users", "roles"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setSubTab(t)}
              className={`text-[12px] font-bold px-3 py-1.5 border-b-2 capitalize ${subTab === t ? "border-brand text-brand" : "border-transparent text-ink-muted"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2">{error}</div>}

      {subTab === "users" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-4 flex-wrap text-[12.5px]">
            <span><strong>{counts.active}</strong> active</span>
            <span><strong>{counts.pending}</strong> pending invite</span>
            <span><strong>{counts.suspended}</strong> suspended</span>
            <span className="text-ink-muted">· {profiles.length} total</span>
            <button onClick={() => setShowAddUser((v) => !v)} className="ml-auto bg-brand text-white text-[12px] font-bold px-3 py-1.5 rounded-sm shadow-soft-sm">
              {showAddUser ? "Close" : "+ Add user"}
            </button>
          </div>

          {showAddUser && <AddUserForm profiles={profiles} onDone={() => { setShowAddUser(false); load(); }} />}

          <div className="flex items-center gap-2 flex-wrap">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, employee ID..." className="input flex-1 min-w-[200px]" />
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="input max-w-[160px]">
              <option value="">All roles</option>
              {availableRoles.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
            </select>
            {departments.length > 0 && (
              <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="input max-w-[160px]">
                <option value="">All departments</option>
                {departments.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            )}
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input max-w-[150px]">
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="pending">Pending invite</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>

          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-ink-muted border-b border-border bg-surface-muted">
                  <th className="px-3.5 py-2 font-semibold">User</th>
                  <th className="px-3.5 py-2 font-semibold">Employee ID</th>
                  <th className="px-3.5 py-2 font-semibold">Roles</th>
                  <th className="px-3.5 py-2 font-semibold">Department</th>
                  <th className="px-3.5 py-2 font-semibold">Reports to</th>
                  <th className="px-3.5 py-2 font-semibold">Status</th>
                  <th className="px-3.5 py-2 font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((p) => {
                  const myRoles = roleRows.filter((r) => r.user_id === p.id);
                  const manager = profiles.find((m) => m.id === p.manager_id);
                  const status = p.status || "active";
                  const meta = STATUS_META[status];
                  const isOpen = expanded === p.id;
                  return (
                    <Fragment key={p.id}>
                      <tr className="align-top">
                        <td className="px-3.5 py-2.5">
                          <div className="font-bold">{p.full_name || p.email}</div>
                          <div className="text-ink-muted text-[11px]">{p.email}</div>
                        </td>
                        <td className="px-3.5 py-2.5 text-ink-muted">{p.employee_id || "—"}</td>
                        <td className="px-3.5 py-2.5">
                          {p.is_admin ? (
                            <span className="text-[10.5px] bg-page px-2 py-0.5 rounded-full">Platform admin</span>
                          ) : myRoles.length === 0 ? (
                            <span className="text-ink-muted">Employee</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {myRoles.map((r) => (
                                <span key={r.id} className="text-[10.5px] bg-page px-2 py-0.5 rounded-full capitalize">{r.role.replace(/_/g, " ")}</span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5 text-ink-muted">{p.department || "—"}</td>
                        <td className="px-3.5 py-2.5 text-ink-muted">{manager ? manager.full_name || manager.email : "—"}</td>
                        <td className="px-3.5 py-2.5">
                          <span className="inline-flex items-center gap-1.5">
                            <span className={`w-[7px] h-[7px] rounded-full ${meta.dot}`} />
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                          <button onClick={() => setExpanded(isOpen ? null : p.id)} className="text-brand font-semibold text-[11.5px] mr-2">
                            {isOpen ? "Close" : "Manage"}
                          </button>
                          <button onClick={() => toggleSuspend(p.id, status !== "suspended")} className="text-[11.5px] font-semibold text-ink-muted">
                            {status === "suspended" ? "Unsuspend" : "Suspend"}
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={7} className="px-3.5 py-3 bg-surface-muted">
                            <div className="flex flex-col gap-2.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[11px] font-semibold text-ink-muted">Reporting manager:</span>
                                <select value={p.manager_id || ""} onChange={(e) => setManager(p.id, e.target.value)} className="input max-w-[220px]">
                                  <option value="">No manager set</option>
                                  {profiles.filter((m) => m.id !== p.id).map((m) => (
                                    <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[11px] font-semibold text-ink-muted">Talent.ai roles:</span>
                                {myRoles.map((r) => (
                                  <span key={r.id} className="text-[10.5px] bg-surface border border-border px-2 py-0.5 rounded-full flex items-center gap-1 capitalize">
                                    {r.role.replace(/_/g, " ")}
                                    <button onClick={() => removeRole(r.id)} className="text-critical font-bold">×</button>
                                  </span>
                                ))}
                                <select onChange={(e) => { if (e.target.value) { addRole(p.id, e.target.value); e.target.value = ""; } }} className="input max-w-[160px] text-[11px]" defaultValue="">
                                  <option value="">+ Add role</option>
                                  {availableRoles.filter((r) => !myRoles.some((mr) => mr.role === r)).map((r) => (
                                    <option key={r} value={r}>{r.replace(/_/g, " ")}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="px-3.5 py-4 text-center text-ink-muted">No users match those filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === "roles" && (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-ink-muted border-b border-border bg-surface-muted">
                <th className="px-3.5 py-2 font-semibold">Role</th>
                <th className="px-3.5 py-2 font-semibold">Users</th>
                <th className="px-3.5 py-2 font-semibold">Access level</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {roleCounts.map((r) => (
                <tr key={r.role}>
                  <td className="px-3.5 py-2.5 font-bold capitalize">{r.role.replace(/_/g, " ")}</td>
                  <td className="px-3.5 py-2.5">{r.count}</td>
                  <td className="px-3.5 py-2.5 text-ink-muted">{r.access}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AddUserForm({ profiles, onDone }: { profiles: Profile[]; onDone: () => void }) {
  const [fullName, setFullName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [designation, setDesignation] = useState("");
  const [location, setLocation] = useState("");
  const [managerId, setManagerId] = useState("");
  const [joiningDate, setJoiningDate] = useState("");
  const [userType, setUserType] = useState("employee");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; setupLink?: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) return;
    setSaving(true);
    setResult(null);
    const selected = USER_TYPE_OPTIONS.find((o) => o.value === userType);
    const res = await fetch("/api/org/members/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: fullName.trim(),
        email: email.trim(),
        employeeId: employeeId.trim(),
        department: department.trim(),
        designation: designation.trim(),
        location: location.trim(),
        managerId: managerId || null,
        joiningDate: joiningDate || null,
        orgRole: selected?.kind === "org" ? "org_admin" : "member",
        talentRole: selected?.kind === "talent" ? userType : null,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setResult({ ok: false, message: data.error || "Could not create the user." });
      return;
    }
    setResult({
      ok: true,
      message: data.emailSent
        ? `Account created -- a "set your password" email was sent to ${email.trim()}.`
        : `Account created. Email delivery wasn't confirmed -- share this one-time setup link directly:`,
      setupLink: data.setupLink,
    });
    setFullName(""); setEmployeeId(""); setEmail(""); setDepartment(""); setDesignation(""); setLocation(""); setManagerId(""); setJoiningDate(""); setUserType("employee");
  }

  return (
    <form onSubmit={submit} className="border border-border rounded-lg p-3.5 bg-surface flex flex-col gap-2.5">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name *" className="input" required />
        <input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder="Employee ID" className="input" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Official email *" className="input" required />
        <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Department" className="input" />
        <input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="Designation" className="input" />
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location" className="input" />
        <select value={managerId} onChange={(e) => setManagerId(e.target.value)} className="input">
          <option value="">Reporting manager (optional)</option>
          {profiles.map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
        </select>
        <input value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} type="date" className="input" />
        <select value={userType} onChange={(e) => setUserType(e.target.value)} className="input">
          {USER_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={saving || !fullName.trim() || !email.trim()} className="bg-brand text-white text-[12.5px] font-bold px-4 py-2 rounded-sm shadow-soft-sm disabled:opacity-50">
          {saving ? "Creating..." : "Save & invite"}
        </button>
        <span className="text-[11px] text-ink-muted">No password is set here -- they&apos;ll set their own via the emailed link.</span>
      </div>
      {result && (
        <div className={`text-[12px] rounded-sm px-3 py-2 ${result.ok ? "bg-good-wash text-good-text" : "bg-critical-wash text-critical"}`}>
          {result.message}
          {result.setupLink && (
            <div className="mt-1 flex items-center gap-2">
              <code className="text-[10.5px] bg-surface border border-border rounded px-1.5 py-0.5 truncate max-w-[280px]">{result.setupLink}</code>
              <button type="button" onClick={() => navigator.clipboard.writeText(result.setupLink!)} className="text-[11px] font-semibold text-brand">Copy</button>
            </div>
          )}
        </div>
      )}
    </form>
  );
}

