"use client";

import { useCallback, useEffect, useState } from "react";
import { useRegisterToolHome } from "@/components/ToolHomeContext";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import RequisitionTabs from "@/components/tools/RequisitionTabs";
import { STAGES } from "@/lib/talentStages";

type Candidate = {
  id: string;
  stage: string;
  source: string | null;
  current_ctc: number | null;
  expected_ctc: number | null;
  created_at: string;
};

type ApprovalStep = {
  id: string;
  step_order: number;
  approver_role: string | null;
  status: string | null;
  comment: string | null;
  decided_at: string | null;
  approver_name: string | null;
  decided_by_name: string | null;
};

type PostingChannel = { channel: string; posted: boolean };

type Requisition = {
  id: string;
  req_no: string;
  title: string;
  department: string | null;
  location: string | null;
  employment_type: string | null;
  headcount: number | null;
  status: string;
  priority: string | null;
  hiring_manager: string | null;
  description: string | null;
  comments: string | null;
  created_at: string;
  requisition_type: string | null;
  replacement_name: string | null;
  replacement_employee_id: string | null;
  is_confidential: boolean | null;
  is_internal_only: boolean | null;
  cost_center: string | null;
  target_hire_date: string | null;
  work_mode: string | null;
  comp_min: number | null;
  comp_max: number | null;
  job_level: string | null;
  jd_source_text: string | null;
  jd_file_name: string | null;
  is_published: boolean | null;
  published_at: string | null;
  posting_channels: PostingChannel[] | null;
  talent_candidates: Candidate[];
  talent_approval_steps: ApprovalStep[];
  assigned_recruiter: { id: string; name: string } | null;
};

function reqLabel(r: { req_no?: string; title: string; location?: string | null }) {
  const suffix = r.location ? `${r.title}-${r.location}` : r.title;
  return r.req_no ? `${r.req_no} ${suffix}` : suffix;
}

function fmtCtc(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString("en-IN");
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function daysOpen(createdAt: string) {
  return Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 86_400_000));
}

function titleCase(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const SOURCE_LABEL: Record<string, string> = {
  sourced: "Resume upload / sourced",
  internal_application: "Internal application",
  referral: "Employee referral",
  other: "Other",
};

function sourceLabel(s: string | null) {
  if (!s) return "Not recorded";
  return SOURCE_LABEL[s] || titleCase(s);
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted mb-0.5">{label}</div>
      <div className="text-[13px] text-ink">{value ?? "—"}</div>
    </div>
  );
}

function SectionCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border border-border rounded-lg bg-surface p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[13px] font-bold text-ink">{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

export default function RequisitionRoleOverview({ requisitionId }: { requisitionId: string }) {
  const router = useRouter();

  // Topbar's clickable "Talent.ai" title (ToolHomeContext) returns here
  // to the tool's own home tab, from wherever this drill-down view sits.
  useRegisterToolHome(useCallback(() => router.push("/tools/talent-ai"), [router]));
  const [requisition, setRequisition] = useState<Requisition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jdExpanded, setJdExpanded] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [togglingChannel, setTogglingChannel] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requisitionId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/talent-ai/requisitions/${requisitionId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load requisition.");
      setRequisition(data.requisition);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load requisition.");
    } finally {
      setLoading(false);
    }
  }

  async function workflowAction(body: Record<string, unknown>) {
    const res = await fetch(`/api/talent-ai/requisitions/${requisitionId}/workflow`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "That action failed.");
    return data;
  }

  async function handlePublishToggle() {
    if (!requisition) return;
    setPublishing(true);
    try {
      await workflowAction({ action: requisition.is_published ? "unpublish" : "publish" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update publish status.");
    } finally {
      setPublishing(false);
    }
  }

  async function handleToggleChannel(channel: string) {
    setTogglingChannel(channel);
    try {
      await workflowAction({ action: "toggle_channel", channel });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update that channel.");
    } finally {
      setTogglingChannel(null);
    }
  }

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-[13px] text-ink-muted">Loading…</div>;
  }
  if (error || !requisition) {
    return (
      <div className="flex flex-col gap-3">
        <button onClick={() => router.push("/tools/talent-ai")} className="text-[12.5px] font-semibold text-brand self-start">
          ← Back to My requisitions
        </button>
        <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2">{error || "Requisition not found."}</div>
      </div>
    );
  }

  const candidates = requisition.talent_candidates || [];
  const stageCounts: Record<string, number> = {};
  for (const c of candidates) stageCounts[c.stage] = (stageCounts[c.stage] || 0) + 1;
  const maxStageCount = Math.max(1, ...STAGES.map((s) => stageCounts[s.id] || 0));

  const sourceCounts = new Map<string, number>();
  for (const c of candidates) {
    const key = c.source || "other";
    sourceCounts.set(key, (sourceCounts.get(key) || 0) + 1);
  }
  const sourceRows = Array.from(sourceCounts.entries()).sort((a, b) => b[1] - a[1]);
  const totalForSource = candidates.length || 1;

  const shareText = [
    reqLabel(requisition),
    [requisition.employment_type, requisition.location, requisition.work_mode].filter(Boolean).map((v) => titleCase(String(v))).join(" · "),
    requisition.jd_source_text ? requisition.jd_source_text.slice(0, 220).trim() + (requisition.jd_source_text.length > 220 ? "…" : "") : "",
    "Learn more / apply: https://www.askshree.com/apply",
  ]
    .filter(Boolean)
    .join("\n\n");
  const applyUrl = "https://www.askshree.com/apply";

  async function copyShareText() {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable — silently ignore, Copy button just won't confirm
    }
  }

  const channels: PostingChannel[] = requisition.posting_channels || [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <button onClick={() => router.push("/tools/talent-ai")} className="text-[11.5px] font-semibold text-brand mb-1">
            ← Back to My requisitions
          </button>
          <h1 className="m-0 text-[19px] font-bold">{reqLabel(requisition)}</h1>
          <div className="text-[12px] text-ink-muted mt-0.5">{requisition.department || "No department"}</div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-semibold px-2 py-1 rounded-sm bg-brand-wash text-brand">{titleCase(requisition.status)}</span>
          {requisition.priority && (
            <span className="text-[11px] font-semibold px-2 py-1 rounded-sm border border-border text-ink-2">{titleCase(requisition.priority)} priority</span>
          )}
          {requisition.is_published ? (
            <span className="text-[11px] font-semibold px-2 py-1 rounded-sm bg-good-wash text-good-text">Published</span>
          ) : (
            <span className="text-[11px] font-semibold px-2 py-1 rounded-sm border border-border text-ink-muted">Not published</span>
          )}
        </div>
      </div>

      <RequisitionTabs requisitionId={requisitionId} active="role" />

      <div className="grid grid-cols-4 gap-3">
        <div className="border border-border rounded-lg bg-surface p-3">
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted">Candidates</div>
          <div className="text-[20px] font-bold text-ink mt-0.5">{candidates.length}</div>
        </div>
        <div className="border border-border rounded-lg bg-surface p-3">
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted">Days open</div>
          <div className="text-[20px] font-bold text-ink mt-0.5">{daysOpen(requisition.created_at)}</div>
        </div>
        <div className="border border-border rounded-lg bg-surface p-3">
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted">Headcount</div>
          <div className="text-[20px] font-bold text-ink mt-0.5">{requisition.headcount ?? 1}</div>
        </div>
        <div className="border border-border rounded-lg bg-surface p-3">
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted">In offer/BGV/RTJ</div>
          <div className="text-[20px] font-bold text-ink mt-0.5">
            {(stageCounts.offer || 0) + (stageCounts.bgv || 0) + (stageCounts.ready_to_join || 0)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 items-start">
        <div className="col-span-2 flex flex-col gap-4">
          <SectionCard title="Funnel">
            {candidates.length === 0 ? (
              <div className="text-[12.5px] text-ink-muted">No candidates in the pipeline yet.</div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {STAGES.map((s) => {
                  const count = stageCounts[s.id] || 0;
                  const pct = Math.round((count / maxStageCount) * 100);
                  return (
                    <div key={s.id} className="flex items-center gap-2">
                      <div className="w-[110px] flex-shrink-0 text-[11.5px] text-ink-2 truncate">{s.label}</div>
                      <div className="flex-1 h-4 bg-page rounded-sm overflow-hidden">
                        <div
                          className={`h-full rounded-sm ${s.id === "rejected" ? "bg-critical/60" : "bg-brand/70"}`}
                          style={{ width: count > 0 ? `${Math.max(pct, 4)}%` : "0%" }}
                        />
                      </div>
                      <div className="w-6 flex-shrink-0 text-[11.5px] text-ink font-semibold text-right tabular-nums">{count}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Source mix">
            {sourceRows.length === 0 ? (
              <div className="text-[12.5px] text-ink-muted">No candidates yet.</div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {sourceRows.map(([source, count]) => {
                  const pct = Math.round((count / totalForSource) * 100);
                  return (
                    <div key={source} className="flex items-center gap-2">
                      <div className="w-[170px] flex-shrink-0 text-[11.5px] text-ink-2 truncate">{sourceLabel(source)}</div>
                      <div className="flex-1 h-4 bg-page rounded-sm overflow-hidden">
                        <div className="h-full rounded-sm bg-brand/70" style={{ width: `${Math.max(pct, 4)}%` }} />
                      </div>
                      <div className="w-10 flex-shrink-0 text-[11.5px] text-ink font-semibold text-right tabular-nums">
                        {count} ({pct}%)
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Job description">
            {requisition.jd_file_name && (
              <div className="text-[11.5px] text-ink-muted -mt-2">
                <Icon name="upload" className="w-3 h-3 inline mr-1" />
                Sourced from <span className="font-semibold text-ink-2">{requisition.jd_file_name}</span>
              </div>
            )}
            {requisition.jd_source_text ? (
              <>
                <p className={`m-0 text-[13px] text-ink whitespace-pre-line leading-relaxed ${jdExpanded ? "" : "line-clamp-6"}`}>
                  {requisition.jd_source_text}
                </p>
                {requisition.jd_source_text.length > 400 && (
                  <button onClick={() => setJdExpanded((v) => !v)} className="text-[11.5px] font-semibold text-brand self-start">
                    {jdExpanded ? "Show less" : "Show full JD"}
                  </button>
                )}
              </>
            ) : (
              <div className="text-[12.5px] text-ink-muted">No JD text on file for this requisition.</div>
            )}
          </SectionCard>

          {requisition.talent_approval_steps?.length > 0 && (
            <SectionCard title="Approval chain">
              <div className="flex flex-col gap-2">
                {[...requisition.talent_approval_steps]
                  .sort((a, b) => a.step_order - b.step_order)
                  .map((step) => (
                    <div key={step.id} className="flex items-center justify-between gap-2 text-[12.5px] border-b border-border last:border-0 pb-2 last:pb-0">
                      <div>
                        <span className="font-semibold text-ink">{titleCase(step.approver_role || "Approver")}</span>
                        {step.approver_name && <span className="text-ink-muted"> — {step.approver_name}</span>}
                      </div>
                      <div className="flex items-center gap-2 text-ink-muted">
                        <span
                          className={`font-semibold px-1.5 py-0.5 rounded-sm text-[10.5px] ${
                            step.status === "approved"
                              ? "bg-good-wash text-good-text"
                              : step.status === "rejected"
                              ? "bg-critical-wash text-critical"
                              : "bg-page text-ink-muted"
                          }`}
                        >
                          {titleCase(step.status || "pending")}
                        </span>
                        {step.decided_at && <span>{fmtDate(step.decided_at)}</span>}
                      </div>
                    </div>
                  ))}
              </div>
            </SectionCard>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <SectionCard title="Requisition details">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Location" value={requisition.location} />
              <Field label="Employment type" value={requisition.employment_type ? titleCase(requisition.employment_type) : "—"} />
              <Field label="Work mode" value={requisition.work_mode ? titleCase(requisition.work_mode) : "—"} />
              <Field label="Job level" value={requisition.job_level} />
              <Field label="Requisition type" value={requisition.requisition_type ? titleCase(requisition.requisition_type) : "—"} />
              <Field label="Target hire date" value={fmtDate(requisition.target_hire_date)} />
              <Field
                label="Compensation range"
                value={requisition.comp_min || requisition.comp_max ? `${fmtCtc(requisition.comp_min)} – ${fmtCtc(requisition.comp_max)}` : "—"}
              />
              <Field label="Cost center" value={requisition.cost_center} />
              <Field label="Confidential" value={requisition.is_confidential ? "Yes" : "No"} />
              <Field label="Internal only" value={requisition.is_internal_only ? "Yes" : "No"} />
            </div>
            {requisition.requisition_type === "replacement" && (requisition.replacement_name || requisition.replacement_employee_id) && (
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
                <Field label="Replacing" value={requisition.replacement_name} />
                <Field label="Employee ID" value={requisition.replacement_employee_id} />
              </div>
            )}
            {requisition.description && (
              <div className="pt-2 border-t border-border">
                <Field label="Justification" value={<span className="whitespace-pre-line">{requisition.description}</span>} />
              </div>
            )}
            {requisition.comments && (
              <div className="pt-2 border-t border-border">
                <Field label="Comments" value={<span className="whitespace-pre-line">{requisition.comments}</span>} />
              </div>
            )}
          </SectionCard>

          <SectionCard title="Hiring team">
            <Field label="Hiring manager" value={requisition.hiring_manager} />
            <Field label="Assigned recruiter" value={requisition.assigned_recruiter?.name || "Not yet assigned"} />
          </SectionCard>

          <SectionCard
            title="Publish & share"
            action={
              <button
                onClick={handlePublishToggle}
                disabled={publishing}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-sm disabled:opacity-50 ${
                  requisition.is_published ? "border border-border text-ink-muted hover:border-brand" : "bg-brand text-white"
                }`}
              >
                {publishing ? "…" : requisition.is_published ? "Unpublish" : "Publish"}
              </button>
            }
          >
            {requisition.is_published && (
              <div className="text-[11.5px] text-ink-muted -mt-1">Published {fmtDate(requisition.published_at)}</div>
            )}

            {requisition.is_published && channels.length > 0 && (
              <div className="flex flex-col gap-1">
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted mb-0.5">Posting channels</div>
                {channels.map((c) => (
                  <label key={c.channel} className="flex items-center gap-1.5 text-[12px] text-ink-2">
                    <input
                      type="checkbox"
                      checked={c.posted}
                      disabled={togglingChannel === c.channel}
                      onChange={() => handleToggleChannel(c.channel)}
                    />
                    {c.channel}
                    {c.posted && <span className="text-[10px] text-good-text font-semibold">posted</span>}
                  </label>
                ))}
              </div>
            )}

            <div className="pt-2 border-t border-border flex flex-col gap-1.5">
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted mb-0.5">Share this role</div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11.5px] font-semibold px-2.5 py-1 border border-border rounded-md hover:border-brand"
                >
                  WhatsApp
                </a>
                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11.5px] font-semibold px-2.5 py-1 border border-border rounded-md hover:border-brand"
                >
                  X
                </a>
                <a
                  href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(applyUrl)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11.5px] font-semibold px-2.5 py-1 border border-border rounded-md hover:border-brand"
                >
                  LinkedIn
                </a>
                <a
                  href={`mailto:?subject=${encodeURIComponent(`Open role: ${reqLabel(requisition)}`)}&body=${encodeURIComponent(shareText)}`}
                  className="text-[11.5px] font-semibold px-2.5 py-1 border border-border rounded-md hover:border-brand"
                >
                  Email
                </a>
                <button
                  onClick={copyShareText}
                  className="text-[11.5px] font-semibold px-2.5 py-1 border border-border rounded-md hover:border-brand"
                >
                  {copied ? "Copied ✓" : "Copy text"}
                </button>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
