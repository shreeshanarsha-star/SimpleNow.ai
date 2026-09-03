"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { useRegisterToolHome } from "@/components/ToolHomeContext";
import type {
  JdStudioRequest,
  JdStudioUpload,
  JdStudioQuestionSet,
  JdTemplate,
  ApproverMode,
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
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export default function JdStudioApp() {
  useRegisterToolHome(useCallback(() => setDetailId(null), []));

  const [requests, setRequests] = useState<JdStudioRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [questionSets, setQuestionSets] = useState<JdStudioQuestionSet[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [deptFilter, setDeptFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  // Upload / review flow
  const [uploading, setUploading] = useState(false);
  const [upload, setUpload] = useState<JdStudioUpload | null>(null);
  const [uploadMode, setUploadMode] = useState<"auto" | "manual">("manual");
  const [targets, setTargets] = useState<Target[]>([]);
  const [sampleAnswers, setSampleAnswers] = useState<Record<string, string>>({});
  const [questionSetId, setQuestionSetId] = useState<string>("");
  const [template, setTemplate] = useState<JdTemplate>("standard");
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
        setTargets(
          (u.extracted_rows || []).map((r) => ({
            name: r.name,
            email: r.email || "",
            department: r.department || defaultDept,
            job_title: r.job_title,
            include: true,
          }))
        );
      } else if (u.kind === "sample_jd") {
        const sa = (u.classification as unknown as { sample_answers?: Record<string, string> })?.sample_answers || {};
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
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
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
      alert(err instanceof Error ? err.message : "Couldn't start this run.");
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

  const detail = requests.find((r) => r.id === detailId) || null;

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <div>
        <h1 className="m-0 text-[20px] font-bold flex items-center gap-2">
          <Icon name="book" className="w-5 h-5 text-brand" />
          JD Studio.ai
        </h1>
        <p className="m-0 mt-1 text-[13px] text-ink-muted">
          Drop a master list, an email list, or a sample JD -- JD Studio.ai gathers the details and drafts the job description.
        </p>
      </div>

      {/* --- Drop zone / review --- */}
      {!upload && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
          className="border-2 border-dashed border-border rounded-xl px-6 py-10 text-center cursor-pointer transition-colors hover:border-brand"
          onClick={() => fileRef.current?.click()}
        >
          <Icon name="upload" className="w-8 h-8 mx-auto mb-3 text-brand" />
          <p className="m-0 text-[15px] font-bold">{uploading ? "Reading your file…" : "Click or drop a file to start"}</p>
          <p className="m-0 mt-1.5 text-[12.5px] text-ink-muted max-w-md mx-auto">
            A master data sheet or email list (.xlsx/.csv) to gather details from stakeholders, or a sample JD (.docx/.pdf/.txt) to draft from directly.
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
          <div className="flex items-center justify-center gap-2 mt-5" onClick={(e) => e.stopPropagation()}>
            <span className="text-[12px] font-semibold text-ink-muted">Mode:</span>
            {(["manual", "auto"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setUploadMode(m)}
                className={`text-[12.5px] font-bold px-3 py-1.5 rounded-full border transition-colors ${
                  uploadMode === m ? "bg-brand text-white border-brand" : "border-border text-ink-muted hover:border-brand"
                }`}
              >
                {m === "manual" ? "Manual (review before sending)" : "Auto (send immediately)"}
              </button>
            ))}
          </div>
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
                {upload.kind === "master_data" ? "Master data" : upload.kind === "email_list" ? "Email list" : upload.kind === "sample_jd" ? "Sample JD" : "Unrecognized"}
              </span>
            </div>
            <button className="text-[12px] text-ink-muted hover:text-ink" onClick={() => setUpload(null)}>
              Cancel
            </button>
          </div>

          {(upload.kind === "master_data" || upload.kind === "email_list") && (
            <div className="flex flex-col gap-2 max-h-72 overflow-auto">
              {targets.map((t, i) => (
                <div key={i} className="flex items-center gap-2 text-[12.5px] border-b border-border pb-2">
                  <input type="checkbox" checked={t.include} onChange={(e) => setTargets((ts) => ts.map((x, xi) => (xi === i ? { ...x, include: e.target.checked } : x)))} />
                  <input
                    className="flex-1 border border-border rounded-md px-2 py-1"
                    value={t.name || ""}
                    placeholder="Name"
                    onChange={(e) => setTargets((ts) => ts.map((x, xi) => (xi === i ? { ...x, name: e.target.value } : x)))}
                  />
                  <input
                    className="flex-[1.4] border border-border rounded-md px-2 py-1"
                    value={t.email}
                    placeholder="Email"
                    onChange={(e) => setTargets((ts) => ts.map((x, xi) => (xi === i ? { ...x, email: e.target.value } : x)))}
                  />
                  <input
                    className="flex-1 border border-border rounded-md px-2 py-1"
                    value={t.department}
                    placeholder="Department"
                    onChange={(e) => setTargets((ts) => ts.map((x, xi) => (xi === i ? { ...x, department: e.target.value } : x)))}
                  />
                  <input
                    className="flex-1 border border-border rounded-md px-2 py-1"
                    value={t.job_title || ""}
                    placeholder="Job title"
                    onChange={(e) => setTargets((ts) => ts.map((x, xi) => (xi === i ? { ...x, job_title: e.target.value } : x)))}
                  />
                </div>
              ))}
              {!targets.length && <p className="text-[12.5px] text-ink-muted">No rows with a valid email were found -- add one manually below.</p>}
              <button
                className="text-[12px] font-bold text-brand self-start"
                onClick={() => setTargets((ts) => [...ts, { name: "", email: "", department: defaultDept, job_title: "", include: true }])}
              >
                + Add recipient
              </button>
            </div>
          )}

          {upload.kind === "sample_jd" && (
            <div className="grid grid-cols-2 gap-3 text-[12.5px]">
              {(
                [
                  ["job_title", "Job title"],
                  ["department", "Department"],
                  ["location_mode", "Location & work mode"],
                  ["employment_headcount", "Employment type & headcount"],
                  ["years_experience", "Years of experience"],
                  ["comp_range", "Compensation range"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex flex-col gap-1">
                  <span className="text-ink-muted font-semibold">{label}</span>
                  <input
                    className="border border-border rounded-md px-2 py-1.5"
                    value={sampleAnswers[key] || ""}
                    onChange={(e) => setSampleAnswers((a) => ({ ...a, [key]: e.target.value }))}
                  />
                </label>
              ))}
              <label className="flex flex-col gap-1 col-span-2">
                <span className="text-ink-muted font-semibold">Top responsibilities</span>
                <textarea
                  className="border border-border rounded-md px-2 py-1.5 min-h-16"
                  value={sampleAnswers.top_responsibilities || ""}
                  onChange={(e) => setSampleAnswers((a) => ({ ...a, top_responsibilities: e.target.value }))}
                />
              </label>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12.5px] pt-3 border-t border-border">
            <label className="flex flex-col gap-1">
              <span className="text-ink-muted font-semibold">Question set</span>
              <select className="border border-border rounded-md px-2 py-1.5" value={questionSetId} onChange={(e) => setQuestionSetId(e.target.value)}>
                {questionSets.map((qs) => (
                  <option key={qs.id} value={qs.id}>
                    {qs.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-ink-muted font-semibold">Template</span>
              <select className="border border-border rounded-md px-2 py-1.5" value={template} onChange={(e) => setTemplate(e.target.value as JdTemplate)}>
                <option value="standard">Standard</option>
                <option value="compact">Compact</option>
                <option value="branded">Branded</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-ink-muted font-semibold">Approval</span>
              <select className="border border-border rounded-md px-2 py-1.5" value={approverMode} onChange={(e) => setApproverMode(e.target.value as ApproverMode)}>
                <option value="self">Self-approve</option>
                <option value="route">Route to someone else</option>
              </select>
            </label>
            {approverMode === "route" ? (
              <label className="flex flex-col gap-1">
                <span className="text-ink-muted font-semibold">Approver email</span>
                <input className="border border-border rounded-md px-2 py-1.5" value={approverEmail} onChange={(e) => setApproverEmail(e.target.value)} placeholder="from your master tracker" />
              </label>
            ) : (
              <label className="flex flex-col gap-1">
                <span className="text-ink-muted font-semibold">Default department</span>
                <input className="border border-border rounded-md px-2 py-1.5" value={defaultDept} onChange={(e) => setDefaultDept(e.target.value)} />
              </label>
            )}
          </div>

          <div className="flex justify-end">
            <button
              disabled={executing}
              onClick={handleExecute}
              className="text-[13px] font-bold px-5 py-2.5 rounded-lg bg-brand text-white shadow-button disabled:opacity-60"
            >
              {executing ? "Starting…" : upload.mode === "auto" ? "Execute (send now)" : "Execute (create for review)"}
            </button>
          </div>
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
                <div>
                  <div className="font-bold text-ink-muted mb-1">Summary</div>
                  <p className="m-0">{detail.ai_draft_json.summary}</p>
                </div>
                <div>
                  <div className="font-bold text-ink-muted mb-1">Responsibilities</div>
                  <ul className="m-0 pl-4">
                    {detail.ai_draft_json.responsibilities.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="font-bold text-ink-muted mb-1">Must-have skills</div>
                  <p className="m-0">{detail.ai_draft_json.must_have_skills.join(", ")}</p>
                </div>
                <div>
                  <div className="font-bold text-ink-muted mb-1">Good-to-have skills</div>
                  <p className="m-0">{detail.ai_draft_json.good_to_have_skills.join(", ") || "—"}</p>
                </div>
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
              {detail.status === "approved" && detail.final_docx_path && (
                <a
                  className="text-[12.5px] font-bold px-3 py-1.5 rounded-full border border-border"
                  href={`/api/jdstudio/download-zip?ids=${detail.id}`}
                >
                  Download final JD
                </a>
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
    </div>
  );
}
