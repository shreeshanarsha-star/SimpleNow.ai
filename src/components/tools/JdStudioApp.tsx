"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { useRegisterToolHome } from "@/components/ToolHomeContext";
import { createClient } from "@/lib/supabase/client";
import type { GuestGateResult } from "@/lib/guestAccess";
import type {
  JdStudioRequest,
  JdStudioUpload,
  JdStudioQuestionSet,
  JdTemplate,
  ApproverMode,
  JdDraft,
  BiasFlag,
} from "@/lib/jdstudio/types";

type Target = { name: string | null; email: string; department: string; job_title: string | null; include: boolean };

const STATUS_LABEL: Record<string, string> = {
  queued: "Queued",
  pending_review: "Needs review",
  sent: "Invite sent",
  opened: "Opened",
  responded: "Response received",
  drafting: "Drafting…",
  pending_approval: "Pending approval",
  approved: "Approved",
  published: "Published",
  expired: "Expired",
  failed: "Failed",
};

const STATUS_CLASS: Record<string, string> = {
  queued: "bg-page text-ink-muted",
  pending_review: "bg-warning-wash text-ink",
  sent: "bg-brand-wash text-brand-dark",
  opened: "bg-brand-wash text-brand-dark",
  responded: "bg-warning-wash text-ink",
  drafting: "bg-warning-wash text-ink",
  pending_approval: "bg-warning-wash text-ink",
  approved: "bg-good-wash text-good-text",
  published: "bg-good-wash text-good-text",
  expired: "bg-critical-wash text-critical",
  failed: "bg-critical-wash text-critical",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_CLASS[status] || "bg-page text-ink-muted"}`}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

class ApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  // FormData bodies (file uploads) need the browser to set its own
  // multipart Content-Type with boundary -- forcing application/json
  // here would break request.formData() parsing on the server.
  const isFormData = typeof FormData !== "undefined" && options?.body instanceof FormData;
  const res = await fetch(url, {
    ...options,
    headers: isFormData ? options?.headers : { "Content-Type": "application/json", ...(options?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  // `code` carries structured errors (e.g. guest trial limits) so callers
  // can show a real UI instead of a generic alert -- see handleExecute.
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, data.code);
  return data;
}

export default function JdStudioApp({ guestStatus = null }: { guestStatus?: GuestGateResult | null }) {
  useRegisterToolHome(useCallback(() => setDetailId(null), []));

  const isGuest = guestStatus?.allowed && guestStatus.tier === "guest";
  const isCreditsTier = guestStatus?.allowed && guestStatus.tier === "credits";
  const blockedOnLoad = guestStatus && !guestStatus.allowed ? guestStatus : null;
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [limitReached, setLimitReached] = useState<{ message: string } | null>(null);
  const [upgradeEmail, setUpgradeEmail] = useState("");
  const [upgradePassword, setUpgradePassword] = useState("");
  const [upgradeBusy, setUpgradeBusy] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [upgradeDone, setUpgradeDone] = useState(false);
  const showUpgradeModal = upgradeOpen || !!limitReached;

  async function handleUpgrade(e: React.FormEvent) {
    e.preventDefault();
    setUpgradeBusy(true);
    setUpgradeError(null);
    const supabase = createClient();
    // Upgrades the *current* anonymous session in place (same user id) --
    // NOT a fresh signUp(), which would create an unrelated account and
    // strand this guest's uploads/drafts under the old anonymous id.
    const { error } = await supabase.auth.updateUser({ email: upgradeEmail, password: upgradePassword });
    setUpgradeBusy(false);
    if (error) {
      setUpgradeError(error.message);
      return;
    }
    setUpgradeDone(true);
  }

  const [requests, setRequests] = useState<JdStudioRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [questionSets, setQuestionSets] = useState<JdStudioQuestionSet[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [deptFilter, setDeptFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  // Mode: "instant" for direct generation on the spot; "team" for email dispatch & stakeholder intake
  const [studioMode, setStudioMode] = useState<"instant" | "team">("instant");
  const [instantText, setInstantText] = useState("");
  const [instantGenerating, setInstantGenerating] = useState(false);
  const [instantResult, setInstantResult] = useState<{
    request: JdStudioRequest;
    draft: JdDraft;
    bias_flags: BiasFlag[];
  } | null>(null);
  const [instantTab, setInstantTab] = useState<"internal" | "external">("internal");
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);

  // Upload / review flow for team mode
  const [uploading, setUploading] = useState(false);
  const [upload, setUpload] = useState<JdStudioUpload | null>(null);
  const [uploadMode, setUploadMode] = useState<"auto" | "manual">("auto");
  const [targets, setTargets] = useState<Target[]>([]);
  const [sampleAnswers, setSampleAnswers] = useState<Record<string, string>>({});
  const [questionSetId, setQuestionSetId] = useState<string>("");
  const [template, setTemplate] = useState<JdTemplate>("both");
  const [approverMode, setApproverMode] = useState<ApproverMode>("self");
  const [approverEmail, setApproverEmail] = useState("");
  const [defaultDept, setDefaultDept] = useState("General");
  const [executing, setExecuting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (deptFilter) params.set("department", deptFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (search) params.set("q", search);
      const { requests } = await api<{ requests: JdStudioRequest[] }>(`/api/jdstudio/requests?${params}`);
      setRequests(requests || []);
    } catch {
      // Leave the last known list showing rather than blanking the page.
    } finally {
      setLoading(false);
    }
  }, [deptFilter, statusFilter, search]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  useEffect(() => {
    api<{ questionSets: JdStudioQuestionSet[] }>("/api/jdstudio/question-sets")
      .then(({ questionSets }) => {
        setQuestionSets(questionSets || []);
        const def = questionSets?.find((q) => q.is_system) || questionSets?.[0];
        if (def) setQuestionSetId(def.id);
      })
      .catch(() => null);
    // Fire-and-forget staleness scan (no cron infra -- see reminders/run route).
    api("/api/jdstudio/reminders/run").catch(() => null);
  }, []);

  const departments = Array.from(new Set(requests.map((r) => r.department))).sort();

  async function handleFile(file: File) {
    setUploading(true);
    setUpload(null);
    setTargets([]);
    setSampleAnswers({});
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("mode", uploadMode);
      const { upload: u } = await api<{ upload: JdStudioUpload }>("/api/jdstudio/uploads", { method: "POST", body: form });
      setUpload(u);
      if (u.status === "failed") return;

      if (u.kind === "master_data" || u.kind === "email_list") {
        setStudioMode("team");
        setTargets(
          (u.extracted_rows || []).map((r) => ({
            name: r.name,
            email: r.email || "",
            department: r.department || defaultDept,
            job_title: r.job_title,
            include: true,
          }))
        );
      } else {
        // Sample JD or single doc - if in instant mode, trigger immediate direct drafting
        const sa = (u.classification as unknown as { sample_answers?: Record<string, string> })?.sample_answers || {};
        if (studioMode === "instant") {
          await handleDirectDraft(file.name, {
            role_title: sa.job_title || file.name.replace(/\.[^/.]+$/, ""),
            department: sa.department || defaultDept,
            location: sa.location_mode || "Hybrid / Flexible",
            experience_level: sa.years_experience || "",
            comp_range: sa.comp_range || "",
            kras: sa.top_responsibilities ? [sa.top_responsibilities] : [],
          });
        } else {
          setSampleAnswers({
            job_title: sa.job_title || "",
            department: sa.department || defaultDept,
            location_mode: sa.location_mode || "",
            employment_headcount: sa.employment_headcount || "",
            years_experience: sa.years_experience || "",
            comp_range: sa.comp_range || "",
            top_responsibilities: sa.top_responsibilities || "",
          });
        }
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDirectDraft(overrideTitle?: string, prefillAnswers?: Record<string, unknown>) {
    if (!instantText.trim() && !overrideTitle && !prefillAnswers) return;
    setInstantGenerating(true);
    setInstantResult(null);
    try {
      const body = {
        raw_text: instantText,
        department: defaultDept,
        template,
        answers: prefillAnswers || {
          role_title: overrideTitle || "Role Specification",
          department: defaultDept,
        },
      };
      const res = await api<{ request: JdStudioRequest; draft: JdDraft; bias_flags: BiasFlag[] }>(
        "/api/jdstudio/direct-draft",
        { method: "POST", body: JSON.stringify(body) }
      );
      setInstantResult(res);
      await loadRequests();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      if (code === "guest_cap_reached" || code === "guest_window_expired" || code === "credits_exhausted") {
        setLimitReached({ message: err instanceof Error ? err.message : "You've hit your free limit." });
      } else {
        alert(err instanceof Error ? err.message : "Generation failed.");
      }
    } finally {
      setInstantGenerating(false);
    }
  }

  async function handleExecute() {
    if (!upload) return;
    setExecuting(true);
    try {
      const body: Record<string, unknown> = {
        question_set_id: questionSetId || null,
        template,
        approver_mode: approverMode,
        approver_email: approverMode === "route" ? approverEmail : null,
        department: defaultDept,
      };
      if (upload.kind === "sample_jd") {
        body.answers = { ...sampleAnswers, must_have: [], good_to_have: [] };
      } else {
        body.targets = targets.filter((t) => t.include && t.email);
      }
      await api(`/api/jdstudio/uploads/${upload.id}/execute`, { method: "POST", body: JSON.stringify(body) });
      setUpload(null);
      setTargets([]);
      setSampleAnswers({});
      await loadRequests();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      if (code === "guest_cap_reached" || code === "guest_window_expired" || code === "credits_exhausted") {
        setLimitReached({ message: err instanceof Error ? err.message : "You've hit your free limit." });
      } else {
        alert(err instanceof Error ? err.message : "Couldn't start this run.");
      }
    } finally {
      setExecuting(false);
    }
  }

  async function act(id: string, path: string, refresh = true) {
    try {
      await api(`/api/jdstudio/requests/${id}/${path}`, { method: "POST" });
      if (refresh) await loadRequests();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Action failed.");
    }
  }

  async function handleDownloadZip() {
    if (!selectedIds.size) return;
    const url = `/api/jdstudio/download-zip?ids=${Array.from(selectedIds).join(",")}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = "jd-studio-export.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function copyToClipboard(text: string, formatKey: string) {
    navigator.clipboard.writeText(text);
    setCopiedFormat(formatKey);
    setTimeout(() => setCopiedFormat(null), 2000);
  }

  const detail = requests.find((r) => r.id === detailId) || null;

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <div>
        <h1 className="m-0 text-[20px] font-bold flex items-center gap-2">
          <Icon name="book" className="w-5 h-5 text-brand" />
          JD Studio.ai
        </h1>
        <p className="m-0 mt-1 text-[13px] text-ink-muted">
          Build your organization&apos;s people architecture. Create clear, standardized, AI-assisted job descriptions.
        </p>
      </div>

      {(isGuest || isCreditsTier || blockedOnLoad) && (
        <div className="flex items-center justify-between gap-3 border border-brand/30 bg-brand-wash rounded-md px-4 py-3">
          <p className="m-0 text-[12.5px] text-ink">
            {blockedOnLoad
              ? blockedOnLoad.reason === "credits_exhausted"
                ? "You're out of free credits."
                : blockedOnLoad.reason === "guest_cap_reached"
                  ? "You've used your free tries for this tool."
                  : "Your free trial has ended."
              : isGuest && guestStatus?.allowed && guestStatus.tier === "guest"
                ? `Trying it out -- ${guestStatus.actionsRemaining} free draft${guestStatus.actionsRemaining === 1 ? "" : "s"} left, ${guestStatus.daysRemaining} day${guestStatus.daysRemaining === 1 ? "" : "s"} remaining.`
                : guestStatus?.allowed && guestStatus.tier === "credits"
                  ? `${guestStatus.creditsRemaining} credit${guestStatus.creditsRemaining === 1 ? "" : "s"} remaining.`
                  : null}
          </p>
          {(isGuest || blockedOnLoad) && (
            <button
              className="text-[12px] font-bold px-3 py-1.5 rounded-full bg-brand text-white whitespace-nowrap"
              onClick={() => setUpgradeOpen(true)}
            >
              Sign up free -- keep my work
            </button>
          )}
        </div>
      )}

      {/* --- Mode Selector Tabs --- */}
      <div className="flex border-b border-border gap-6 text-[13.5px] font-bold">
        <button
          onClick={() => setStudioMode("instant")}
          className={`pb-2.5 flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            studioMode === "instant" ? "border-brand text-brand" : "border-transparent text-ink-muted hover:text-ink"
          }`}
        >
          <span>⚡</span>
          <span>Instant Studio (Direct Generation)</span>
        </button>
        <button
          onClick={() => setStudioMode("team")}
          className={`pb-2.5 flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            studioMode === "team" ? "border-brand text-brand" : "border-transparent text-ink-muted hover:text-ink"
          }`}
        >
          <span>👥</span>
          <span>Team Rollout (Manager Intakes & Approval)</span>
        </button>
      </div>

      {/* --- PART 1: Instant Studio Mode --- */}
      {studioMode === "instant" && (
        <div className="flex flex-col gap-4">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
            className="border-2 border-dashed border-border rounded-xl px-6 py-8 text-center cursor-pointer transition-colors hover:border-brand bg-surface"
            onClick={() => fileRef.current?.click()}
          >
            <Icon name="upload" className="w-8 h-8 mx-auto mb-2 text-brand" />
            <p className="m-0 text-[15px] font-bold">
              {uploading ? "Analyzing role specification…" : "Drop a raw JD, notes, or role spec to start"}
            </p>
            <p className="m-0 mt-1 text-[12.5px] text-ink-muted max-w-md mx-auto">
              Accepts .docx, .pdf, .txt, or a spreadsheet. We&apos;ll extract the core architecture and synthesize both formats instantly.
            </p>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept=".xlsx,.xls,.csv,.docx,.pdf,.txt"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
          </div>

          <div className="flex flex-col gap-3 p-4 bg-surface border border-border rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] font-bold text-ink">Or paste role notes directly:</span>
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-ink-muted font-medium">Department:</span>
                <input
                  className="border border-border rounded-md px-2 py-1 text-[12px] bg-page"
                  placeholder="e.g. Engineering"
                  value={defaultDept}
                  onChange={(e) => setDefaultDept(e.target.value)}
                />
              </div>
            </div>
            <textarea
              className="w-full border border-border rounded-md p-3 text-[13px] bg-page min-h-24 outline-none focus:border-brand"
              placeholder="Paste raw bullet points, job duties, required years of experience, or rough notes here..."
              value={instantText}
              onChange={(e) => setInstantText(e.target.value)}
            />
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-ink-muted font-medium">Output Template:</span>
                <select
                  className="border border-border rounded-md px-2 py-1 text-[12px] bg-page font-semibold"
                  value={template}
                  onChange={(e) => setTemplate(e.target.value as JdTemplate)}
                >
                  <option value="both">Both (Internal Blueprint + External JD)</option>
                  <option value="internal">Internal Format Only (People Architecture)</option>
                  <option value="external">External Format Only (Market Candidate JD)</option>
                </select>
              </div>
              <button
                disabled={instantGenerating || (!instantText.trim() && !upload)}
                onClick={() => handleDirectDraft()}
                className="bg-brand text-white font-bold text-[13px] px-5 py-2 rounded-lg shadow-xs hover:opacity-95 transition-opacity disabled:opacity-50 cursor-pointer flex items-center gap-2"
              >
                {instantGenerating ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    <span>Synthesizing People Architecture…</span>
                  </>
                ) : (
                  <>
                    <span>▶</span>
                    <span>Execute & Generate JDs</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Instant Generated Result Canvas */}
          {instantResult && (
            <div className="border border-brand/40 bg-surface rounded-xl p-5 shadow-sm flex flex-col gap-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-bold text-ink">
                    {instantResult.draft.internal?.role_title || instantResult.draft.external?.role_title || "Job Description"}
                  </span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-good-wash text-good-text">
                    Ready
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    className="text-[12px] font-bold px-3 py-1.5 rounded-md border border-border bg-page hover:border-brand transition-colors text-ink flex items-center gap-1.5"
                    href={`/api/jdstudio/requests/${instantResult.request.id}/download?format=internal`}
                  >
                    <span>📄</span>
                    <span>Download Internal .docx</span>
                  </a>
                  <a
                    className="text-[12px] font-bold px-3 py-1.5 rounded-md border border-border bg-page hover:border-brand transition-colors text-ink flex items-center gap-1.5"
                    href={`/api/jdstudio/requests/${instantResult.request.id}/download?format=external`}
                  >
                    <span>📄</span>
                    <span>Download External .docx</span>
                  </a>
                </div>
              </div>

              {/* Format Switcher */}
              <div className="flex rounded-lg bg-page p-1 gap-1 border border-border">
                <button
                  onClick={() => setInstantTab("internal")}
                  className={`flex-1 py-1.5 text-[12.5px] font-bold rounded-md transition-colors cursor-pointer ${
                    instantTab === "internal" ? "bg-surface text-ink shadow-xs" : "text-ink-muted hover:text-ink"
                  }`}
                >
                  🏢 Internal Format (People Architecture & KRAs)
                </button>
                <button
                  onClick={() => setInstantTab("external")}
                  className={`flex-1 py-1.5 text-[12.5px] font-bold rounded-md transition-colors cursor-pointer ${
                    instantTab === "external" ? "bg-surface text-ink shadow-xs" : "text-ink-muted hover:text-ink"
                  }`}
                >
                  🌐 External Format (Market Candidate JD)
                </button>
              </div>

              {/* Rendered content */}
              <div className="p-4 bg-page rounded-xl border border-border text-[13px] text-ink flex flex-col gap-4 max-h-[440px] overflow-y-auto">
                {instantTab === "internal" ? (
                  <>
                    <div className="border-b border-border pb-3">
                      <div className="text-[11px] font-bold uppercase text-brand tracking-wider">Internal People Blueprint</div>
                      <div className="text-[14px] font-bold mt-1">{instantResult.draft.internal?.role_title}</div>
                      <div className="text-[12px] text-ink-muted mt-0.5">
                        Band/Grade: <strong>{instantResult.draft.internal?.band_grade || "Standard"}</strong> · Dept: {instantResult.draft.internal?.department} · Location: {instantResult.draft.internal?.location} · Exp: {instantResult.draft.internal?.experience_level}
                      </div>
                    </div>

                    <div>
                      <div className="font-bold text-brand text-[11.5px] uppercase mb-1">1. Role Purpose & Strategic Context</div>
                      <p className="m-0 leading-relaxed text-ink">{instantResult.draft.internal?.role_purpose}</p>
                    </div>

                    <div>
                      <div className="font-bold text-brand text-[11.5px] uppercase mb-1">2. Top 5 Key Result Areas (KRAs)</div>
                      <ol className="m-0 pl-4 space-y-1">
                        {(instantResult.draft.internal?.kras || []).map((k, i) => (
                          <li key={i} className="leading-relaxed">{k}</li>
                        ))}
                      </ol>
                    </div>

                    <div>
                      <div className="font-bold text-brand text-[11.5px] uppercase mb-1">3. Performance Evaluation Benchmarks (OKRs / KPIs)</div>
                      <ul className="m-0 pl-4 space-y-1">
                        {(instantResult.draft.internal?.performance_metrics || []).map((m, i) => (
                          <li key={i} className="leading-relaxed">{m}</li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <div className="font-bold text-brand text-[11.5px] uppercase mb-1">4. Functional Interfaces & Cross-Team Boundaries</div>
                      <ul className="m-0 pl-4 space-y-1">
                        {(instantResult.draft.internal?.functional_interfaces || []).map((intf, i) => (
                          <li key={i} className="leading-relaxed">{intf}</li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <div className="font-bold text-brand text-[11.5px] uppercase mb-1">5. Core Competencies & Leveling Baseline (Non-Negotiable)</div>
                      <ul className="m-0 pl-4 space-y-1">
                        {(instantResult.draft.internal?.core_competencies || []).map((c, i) => (
                          <li key={i} className="leading-relaxed">{c}</li>
                        ))}
                      </ul>
                    </div>

                    {instantResult.draft.internal?.additional_strengths && instantResult.draft.internal.additional_strengths.length > 0 && (
                      <div>
                        <div className="font-bold text-brand text-[11.5px] uppercase mb-1">6. Additional Strengths & Certifications</div>
                        <ul className="m-0 pl-4 space-y-1">
                          {instantResult.draft.internal.additional_strengths.map((s, i) => (
                            <li key={i} className="leading-relaxed">{s}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="border-b border-border pb-3">
                      <div className="text-[11px] font-bold uppercase text-brand tracking-wider">Candidate-Facing Job Description</div>
                      <div className="text-[14px] font-bold mt-1">{instantResult.draft.external?.role_title}</div>
                      <div className="text-[12px] text-ink-muted mt-0.5">
                        {instantResult.draft.external?.department} · {instantResult.draft.external?.employment_type} · {instantResult.draft.external?.location_mode}
                      </div>
                    </div>

                    <div>
                      <div className="font-bold text-brand text-[11.5px] uppercase mb-1">About the Role</div>
                      <p className="m-0 leading-relaxed text-ink">{instantResult.draft.external?.about_role}</p>
                    </div>

                    <div>
                      <div className="font-bold text-brand text-[11.5px] uppercase mb-1">What You&apos;ll Do</div>
                      <ul className="m-0 pl-4 space-y-1">
                        {(instantResult.draft.external?.responsibilities || []).map((r, i) => (
                          <li key={i} className="leading-relaxed">{r}</li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <div className="font-bold text-critical text-[11.5px] uppercase mb-1">Must-Have Qualifications (Non-Negotiable)</div>
                      <ul className="m-0 pl-4 space-y-1">
                        {(instantResult.draft.external?.must_have_qualifications || []).map((q, i) => (
                          <li key={i} className="leading-relaxed">{q}</li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <div className="font-bold text-brand text-[11.5px] uppercase mb-1">Preferred Qualifications & Bonus Strengths</div>
                      <ul className="m-0 pl-4 space-y-1">
                        {(instantResult.draft.external?.preferred_qualifications || []).map((q, i) => (
                          <li key={i} className="leading-relaxed">{q}</li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <button
                  className="text-[12px] font-bold px-3 py-1.5 rounded-md border border-border bg-page hover:border-brand transition-colors text-ink"
                  onClick={() => {
                    const txt = instantTab === "internal"
                      ? JSON.stringify(instantResult.draft.internal, null, 2)
                      : JSON.stringify(instantResult.draft.external, null, 2);
                    copyToClipboard(txt, instantTab);
                  }}
                >
                  {copiedFormat === instantTab ? "✓ Copied to clipboard" : "📋 Copy content"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- PART 2: Team Rollout Mode --- */}
      {studioMode === "team" && (
        <div className="flex flex-col gap-4">
          {!upload && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
              className="border-2 border-dashed border-border rounded-xl px-6 py-8 text-center cursor-pointer transition-colors hover:border-brand bg-surface"
              onClick={() => fileRef.current?.click()}
            >
              <Icon name="upload" className="w-8 h-8 mx-auto mb-2 text-brand" />
              <p className="m-0 text-[15px] font-bold">
                {uploading ? "Reading spreadsheet…" : "Drop a team master list or email list (.xlsx / .csv)"}
              </p>
              <p className="m-0 mt-1 text-[12.5px] text-ink-muted max-w-md mx-auto">
                Upload roles and hiring manager email IDs. We&apos;ll automatically dispatch the 3-minute intake link and route drafts to approvers.
              </p>
            </div>
          )}

          {upload && upload.status === "failed" && (
            <div className="border border-critical/30 bg-critical-wash rounded-md px-4 py-3 text-[13px] text-critical flex items-center justify-between">
              <span>{upload.error || "Couldn't process this file."}</span>
              <button className="font-bold underline" onClick={() => setUpload(null)}>
                Try again
              </button>
            </div>
          )}

          {upload && upload.status !== "failed" && (
            <div className="border border-border rounded-xl p-5 flex flex-col gap-4 bg-surface">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-bold">{upload.file_name}</span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-brand-wash text-brand-dark">
                    {upload.kind === "master_data" ? "Master Data" : "Email List"}
                  </span>
                </div>
                <button className="text-[12px] text-ink-muted hover:text-ink" onClick={() => setUpload(null)}>
                  Cancel
                </button>
              </div>

              <div className="flex flex-col gap-2 max-h-72 overflow-auto">
                {targets.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 text-[12.5px] border-b border-border pb-2">
                    <input
                      type="checkbox"
                      checked={t.include}
                      onChange={(e) => setTargets((ts) => ts.map((x, xi) => (xi === i ? { ...x, include: e.target.checked } : x)))}
                    />
                    <input
                      className="flex-1 border border-border rounded-md px-2 py-1 bg-page"
                      value={t.name || ""}
                      placeholder="Manager Name"
                      onChange={(e) => setTargets((ts) => ts.map((x, xi) => (xi === i ? { ...x, name: e.target.value } : x)))}
                    />
                    <input
                      className="flex-[1.4] border border-border rounded-md px-2 py-1 bg-page"
                      value={t.email}
                      placeholder="Manager Email"
                      onChange={(e) => setTargets((ts) => ts.map((x, xi) => (xi === i ? { ...x, email: e.target.value } : x)))}
                    />
                    <input
                      className="flex-1 border border-border rounded-md px-2 py-1 bg-page"
                      value={t.department}
                      placeholder="Department"
                      onChange={(e) => setTargets((ts) => ts.map((x, xi) => (xi === i ? { ...x, department: e.target.value } : x)))}
                    />
                    <input
                      className="flex-1 border border-border rounded-md px-2 py-1 bg-page"
                      value={t.job_title || ""}
                      placeholder="Role Designation"
                      onChange={(e) => setTargets((ts) => ts.map((x, xi) => (xi === i ? { ...x, job_title: e.target.value } : x)))}
                    />
                  </div>
                ))}
                {!targets.length && <p className="text-[12.5px] text-ink-muted">No rows with a valid email were found -- add one manually below.</p>}
                <button
                  className="text-[12px] font-bold text-brand self-start cursor-pointer"
                  onClick={() => setTargets((ts) => [...ts, { name: "", email: "", department: defaultDept, job_title: "", include: true }])}
                >
                  + Add recipient
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[12.5px] pt-3 border-t border-border">
                <label className="flex flex-col gap-1">
                  <span className="text-ink-muted font-semibold">Approver Routing</span>
                  <select
                    className="border border-border rounded-md px-2 py-1.5 bg-page"
                    value={approverMode}
                    onChange={(e) => setApproverMode(e.target.value as ApproverMode)}
                  >
                    <option value="self">Self (I will review & approve)</option>
                    <option value="route">Route to 1–2 Approvers (by email)</option>
                  </select>
                </label>
                {approverMode === "route" && (
                  <label className="flex flex-col gap-1 sm:col-span-2">
                    <span className="text-ink-muted font-semibold">Approver Email(s)</span>
                    <input
                      className="border border-border rounded-md px-2 py-1.5 bg-page"
                      placeholder="e.g. hr-lead@company.com, dept-head@company.com"
                      value={approverEmail}
                      onChange={(e) => setApproverEmail(e.target.value)}
                    />
                  </label>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                <button
                  disabled={executing || !targets.some((t) => t.include && t.email)}
                  onClick={handleExecute}
                  className="bg-brand text-white font-bold text-[13px] px-5 py-2.5 rounded-lg shadow-xs hover:opacity-95 transition-opacity disabled:opacity-50 cursor-pointer"
                >
                  {executing ? "Dispatching…" : `Dispatch Intakes to Managers (${targets.filter((t) => t.include && t.email).length})`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- Filters --- */}
      <div className="flex flex-wrap items-center gap-2">
        <select className="border border-border rounded-md px-2 py-1.5 text-[12.5px]" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select className="border border-border rounded-md px-2 py-1.5 text-[12.5px]" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input
          className="border border-border rounded-md px-2 py-1.5 text-[12.5px] flex-1 min-w-[160px]"
          placeholder="Search title, name, email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {selectedIds.size > 0 && (
          <button onClick={handleDownloadZip} className="text-[12.5px] font-bold px-3 py-1.5 rounded-full border border-border hover:border-brand">
            Download zip ({selectedIds.size})
          </button>
        )}
      </div>

      {/* --- Table --- */}
      <div className="border border-border rounded-xl overflow-hidden">
        <table className="w-full text-[12.5px]">
          <thead className="bg-page text-ink-muted text-left">
            <tr>
              <th className="px-3 py-2 w-8"></th>
              <th className="px-3 py-2">Department</th>
              <th className="px-3 py-2">Recipient</th>
              <th className="px-3 py-2">Job title</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Progress</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id} className="border-t border-border hover:bg-page/60 cursor-pointer" onClick={() => setDetailId(r.id)}>
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(r.id)}
                    onChange={(e) =>
                      setSelectedIds((s) => {
                        const next = new Set(s);
                        if (e.target.checked) next.add(r.id);
                        else next.delete(r.id);
                        return next;
                      })
                    }
                  />
                </td>
                <td className="px-3 py-2">{r.department}</td>
                <td className="px-3 py-2">
                  {r.recipient_name || "—"} <span className="text-ink-muted">{r.recipient_email}</span>
                </td>
                <td className="px-3 py-2">{r.job_title || "—"}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={r.status} />
                  {r.duplicate_of_id && <span className="ml-1.5 text-[10px] text-warning font-bold">possible duplicate</span>}
                </td>
                <td className="px-3 py-2 text-ink-muted">
                  {r.reminder_count > 0 ? `${r.reminder_count} reminder${r.reminder_count > 1 ? "s" : ""}` : ""}
                </td>
                <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                  {r.status === "pending_review" && (
                    <button className="text-brand font-bold" onClick={() => act(r.id, r.answers ? "draft" : "send")}>
                      {r.answers ? "Draft JD" : "Send"}
                    </button>
                  )}
                  {["sent", "opened"].includes(r.status) && (
                    <button className="text-brand font-bold" onClick={() => act(r.id, "remind")}>
                      Remind
                    </button>
                  )}
                  {r.status === "pending_approval" && r.approver_mode === "self" && (
                    <button className="text-good-text font-bold" onClick={() => act(r.id, "approve")}>
                      Approve
                    </button>
                  )}
                  {r.status === "approved" && !r.job_posting_id && (
                    <button className="text-brand font-bold" onClick={() => act(r.id, "publish")}>
                      Publish
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!requests.length && !loading && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-ink-muted">
                  No JD runs yet -- drop a file above to start one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* --- Detail drawer --- */}
      {detail && (
        <div className="fixed inset-0 bg-black/30 flex justify-end z-50" onClick={() => setDetailId(null)}>
          <div className="bg-surface w-full max-w-lg h-full overflow-auto p-6 shadow-panel-right" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[16px] font-bold m-0">{detail.job_title || "Untitled role"}</h2>
              <button onClick={() => setDetailId(null)} className="text-ink-muted hover:text-ink">
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>
            <div className="flex items-center gap-2 mb-4">
              <StatusBadge status={detail.status} />
              <span className="text-[12px] text-ink-muted">{detail.department}</span>
            </div>

            {detail.duplicate_of_id && (
              <div className="border border-warning/40 bg-warning-wash rounded-md px-3 py-2 text-[12.5px] mb-4">
                Looks similar to an existing JD in this department (match {Math.round((detail.duplicate_score || 0) * 100)}%). Consider reusing it.
              </div>
            )}

            {detail.bias_flags && detail.bias_flags.length > 0 && (
              <div className="border border-warning/40 bg-warning-wash rounded-md px-3 py-2 text-[12.5px] mb-4 flex flex-col gap-1.5">
                <span className="font-bold">Bias / clarity flags</span>
                {detail.bias_flags.map((f, i) => (
                  <div key={i}>
                    <span className="italic">&ldquo;{f.text}&rdquo;</span> — {f.suggestion}
                  </div>
                ))}
              </div>
            )}

            {detail.ai_draft_json && (
              <div className="flex flex-col gap-3 text-[12.5px] mb-4">
                {detail.ai_draft_json.internal ? (
                  <div className="flex flex-col gap-3">
                    <div className="p-3 bg-brand/5 rounded-lg border border-brand/20">
                      <div className="font-bold text-brand text-[11px] uppercase tracking-wider mb-1">🏢 Internal Architecture Format</div>
                      <div className="font-semibold text-ink">{detail.ai_draft_json.internal.role_purpose}</div>
                      {detail.ai_draft_json.internal.band_grade && (
                        <div className="mt-1.5 text-ink-muted text-[11.5px]">Band / Grade: <strong className="text-ink">{detail.ai_draft_json.internal.band_grade}</strong></div>
                      )}
                      <div className="mt-2 text-[11.5px] font-semibold text-ink">Key Result Areas (KRAs):</div>
                      <ul className="m-0 pl-4 list-disc text-ink-2">
                        {detail.ai_draft_json.internal.kras?.map((k, i) => <li key={i}>{k}</li>)}
                      </ul>
                    </div>

                    {detail.ai_draft_json.external && (
                      <div className="p-3 bg-good/5 rounded-lg border border-good/20">
                        <div className="font-bold text-good-text text-[11px] uppercase tracking-wider mb-1">🌐 External Candidate Format</div>
                        <div className="text-ink-2">{detail.ai_draft_json.external.about_role}</div>
                        <div className="mt-2 text-[11.5px] font-semibold text-ink">Must-Have Qualifications:</div>
                        <ul className="m-0 pl-4 list-disc text-ink-2">
                          {detail.ai_draft_json.external.must_have_qualifications?.map((m, i) => <li key={i}>{m}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div>
                      <div className="font-bold text-ink-muted mb-1">Summary</div>
                      <p className="m-0">{detail.ai_draft_json.summary}</p>
                    </div>
                    <div>
                      <div className="font-bold text-ink-muted mb-1">Responsibilities</div>
                      <ul className="m-0 pl-4">
                        {detail.ai_draft_json.responsibilities?.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="font-bold text-ink-muted mb-1">Must-have skills</div>
                      <p className="m-0">{detail.ai_draft_json.must_have_skills?.join(", ")}</p>
                    </div>
                    <div>
                      <div className="font-bold text-ink-muted mb-1">Good-to-have skills</div>
                      <p className="m-0">{detail.ai_draft_json.good_to_have_skills?.join(", ") || "—"}</p>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-3 border-t border-border">
              {detail.status === "pending_review" && (
                <button
                  className="text-[12.5px] font-bold px-3 py-1.5 rounded-full bg-brand text-white"
                  onClick={() => act(detail.id, detail.answers ? "draft" : "send")}
                >
                  {detail.answers ? "Draft JD" : "Send invite"}
                </button>
              )}
              {["sent", "opened"].includes(detail.status) && (
                <button className="text-[12.5px] font-bold px-3 py-1.5 rounded-full border border-border" onClick={() => act(detail.id, "remind")}>
                  Send reminder
                </button>
              )}
              {detail.status === "pending_approval" && detail.approver_mode === "self" && (
                <button className="text-[12.5px] font-bold px-3 py-1.5 rounded-full bg-good text-white" onClick={() => act(detail.id, "approve")}>
                  Approve & finalize
                </button>
              )}
              {detail.status === "approved" && (
                <div className="flex flex-wrap gap-2">
                  <a
                    className="text-[12px] font-bold px-3 py-1.5 rounded-full border border-border bg-page hover:border-brand"
                    href={`/api/jdstudio/requests/${detail.id}/download?format=internal`}
                  >
                    🏢 Internal .docx
                  </a>
                  <a
                    className="text-[12px] font-bold px-3 py-1.5 rounded-full border border-border bg-page hover:border-brand"
                    href={`/api/jdstudio/requests/${detail.id}/download?format=external`}
                  >
                    🌐 External .docx
                  </a>
                </div>
              )}
              {detail.status === "approved" && !detail.job_posting_id && (
                <button className="text-[12.5px] font-bold px-3 py-1.5 rounded-full border border-border" onClick={() => act(detail.id, "publish")}>
                  Publish to Job Postings.ai
                </button>
              )}
              <button
                className="text-[12.5px] font-bold px-3 py-1.5 rounded-full border border-critical/40 text-critical ml-auto"
                onClick={async () => {
                  if (!confirm("Delete this JD run?")) return;
                  await api(`/api/jdstudio/requests/${detail.id}`, { method: "DELETE" });
                  setDetailId(null);
                  loadRequests();
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4">
          <div className="bg-surface border border-border rounded-lg shadow-soft max-w-sm w-full p-6">
            {upgradeDone ? (
              <>
                <h2 className="m-0 text-[16px] font-bold mb-2">Check your email</h2>
                <p className="m-0 text-[12.5px] text-ink-2 mb-4">
                  We sent a confirmation link to <strong>{upgradeEmail}</strong>. Once you confirm it, you&apos;ll
                  have 22 free credits and everything you&apos;ve drafted so far is already saved to your account.
                </p>
                <button
                  className="w-full bg-brand text-white font-bold text-[13px] rounded-sm py-2.5"
                  onClick={() => {
                    setUpgradeOpen(false);
                    setLimitReached(null);
                    setUpgradeDone(false);
                  }}
                >
                  Got it
                </button>
              </>
            ) : (
              <form onSubmit={handleUpgrade}>
                <h2 className="m-0 text-[16px] font-bold mb-1">Create your free account</h2>
                <p className="m-0 text-[12.5px] text-ink-muted mb-4">
                  {limitReached?.message || "Get 22 free credits and keep everything you've drafted so far."}
                </p>
                {upgradeError && (
                  <div className="bg-critical-wash text-critical text-[12px] rounded-sm px-3 py-2 mb-3">{upgradeError}</div>
                )}
                <label className="block text-[12px] font-bold mb-1.5">Email</label>
                <input
                  type="email"
                  required
                  value={upgradeEmail}
                  onChange={(e) => setUpgradeEmail(e.target.value)}
                  className="w-full border border-border rounded-sm px-3 py-2.5 text-[13.5px] mb-3 outline-none focus:border-brand"
                />
                <label className="block text-[12px] font-bold mb-1.5">Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={upgradePassword}
                  onChange={(e) => setUpgradePassword(e.target.value)}
                  className="w-full border border-border rounded-sm px-3 py-2.5 text-[13.5px] mb-4 outline-none focus:border-brand"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="flex-1 border border-border text-[12.5px] font-bold rounded-sm py-2.5"
                    onClick={() => {
                      setUpgradeOpen(false);
                      setLimitReached(null);
                    }}
                  >
                    Not now
                  </button>
                  <button
                    type="submit"
                    disabled={upgradeBusy}
                    className="flex-1 bg-brand text-white font-bold text-[12.5px] rounded-sm py-2.5 disabled:opacity-60"
                  >
                    {upgradeBusy ? "Creating…" : "Sign up free"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
