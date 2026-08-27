"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------
type JobStatus = "open" | "on_hold" | "closed";
type MatchStatus = "new" | "reviewed" | "shortlisted" | "shared" | "interview" | "selected" | "rejected" | "on_hold";

type Job = {
  id: string;
  title: string | null;
  company: string | null;
  job_ref: string | null;
  department: string | null;
  location: string | null;
  work_mode: string | null;
  experience_required: string | null;
  min_experience_years: number | null;
  qualification: string | null;
  required_skills: string[];
  preferred_skills: string[];
  industry: string | null;
  comp_min: number | null;
  comp_max: number | null;
  comp_currency: string | null;
  notice_period_requirement: string | null;
  other_requirements: string | null;
  role_summary: string | null;
  jd_file_path: string | null;
  jd_file_name: string | null;
  status: JobStatus;
  ai_status: "processing" | "done" | "failed";
  ai_error: string | null;
  candidate_count?: number;
  shortlisted_count?: number;
  created_at: string;
  updated_at: string;
};

type Candidate = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  current_company: string | null;
  previous_companies: string[];
  total_experience_years: number | null;
  relevant_experience_years: number | null;
  qualification: string | null;
  skills: string[];
  location: string | null;
  preferred_location: string | null;
  current_compensation: string | null;
  expected_compensation: string | null;
  notice_period: string | null;
  summary: string | null;
  file_path: string | null;
  file_name: string | null;
  manual_fields: string[];
  dedupe_status: "none" | "possible_duplicate" | "confirmed_unique" | "merged";
  duplicate_of: string | null;
  ai_status: "processing" | "done" | "failed";
  ai_error: string | null;
  created_at: string;
  updated_at: string;
};

type ScoreDim = { label: string; score: number; max: number };
type Match = {
  id: string;
  job_id: string;
  candidate_id: string;
  overall_score: number | null;
  score_breakdown: ScoreDim[] | null;
  evaluation: string | null;
  strengths: string[];
  concerns: string[];
  missing_requirements: string[];
  matching_skills: string[];
  status: MatchStatus;
  evaluated_at: string | null;
  created_at: string;
  candidate?: Candidate;
  job?: { id: string; title: string | null; company: string | null; status?: JobStatus };
};

type Note = { id: string; candidate_id: string; job_id: string | null; note: string; created_at: string };

type UploadResult = {
  fileName: string;
  status: "job_created" | "job_reused" | "candidate_created" | "candidate_reused" | "unknown" | "error";
  message?: string;
  job?: Job;
  candidate?: Candidate;
  possibleDuplicate?: { id: string; name: string | null } | null;
};

const STATUS_LABEL: Record<MatchStatus, string> = {
  new: "New",
  reviewed: "Reviewed",
  shortlisted: "Shortlisted",
  shared: "Shared",
  interview: "Interview",
  selected: "Selected",
  rejected: "Rejected",
  on_hold: "On Hold",
};
const STATUS_ORDER: MatchStatus[] = ["new", "reviewed", "shortlisted", "shared", "interview", "selected", "on_hold", "rejected"];

function statusPillClass(status: MatchStatus) {
  if (status === "selected") return "bg-good-wash text-good-text";
  if (status === "shortlisted" || status === "interview") return "bg-brand-wash text-brand";
  if (status === "rejected") return "bg-critical-wash text-critical";
  if (status === "on_hold") return "bg-warning-wash text-ink";
  return "bg-page text-ink-muted";
}

function scoreLabel(score: number | null) {
  if (score == null) return "Not scored";
  if (score >= 80) return "Strong Match";
  if (score >= 60) return "Good Match";
  if (score >= 40) return "Partial Match";
  return "Weak Match";
}
function scoreClass(score: number | null) {
  if (score == null) return "bg-page text-ink-muted";
  if (score >= 80) return "bg-good-wash text-good-text";
  if (score >= 60) return "bg-brand-wash text-brand";
  if (score >= 40) return "bg-warning-wash text-ink";
  return "bg-critical-wash text-critical";
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function csvEscape(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function downloadBlob(data: BlobPart, filename: string, type: string) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const EXPORT_COLUMNS: { key: string; label: string; get: (m: Match) => unknown }[] = [
  { key: "name", label: "Name", get: (m) => m.candidate?.name },
  { key: "score", label: "Score", get: (m) => m.overall_score },
  { key: "company", label: "Current Company", get: (m) => m.candidate?.current_company },
  { key: "experience", label: "Experience", get: (m) => m.candidate?.total_experience_years },
  { key: "qualification", label: "Qualification", get: (m) => m.candidate?.qualification },
  { key: "location", label: "Location", get: (m) => m.candidate?.location },
  { key: "current_comp", label: "Current Compensation", get: (m) => m.candidate?.current_compensation },
  { key: "expected_comp", label: "Expected Compensation", get: (m) => m.candidate?.expected_compensation },
  { key: "notice_period", label: "Notice Period", get: (m) => m.candidate?.notice_period },
  { key: "evaluation", label: "Evaluation", get: (m) => m.evaluation },
  { key: "status", label: "Status", get: (m) => STATUS_LABEL[m.status] },
  { key: "phone", label: "Phone", get: (m) => m.candidate?.phone },
  { key: "email", label: "Email", get: (m) => m.candidate?.email },
  { key: "linkedin", label: "LinkedIn", get: (m) => m.candidate?.linkedin_url },
  { key: "added", label: "Date Added", get: (m) => fmtDate(m.candidate?.created_at || null) },
];

// ---------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------
export default function ShortlistApp() {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Jobs list (the home view -- shown whenever no job is open)
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsQuery, setJobsQuery] = useState("");
  const [jobsStatusFilter, setJobsStatusFilter] = useState<"all" | JobStatus>("all");

  // Candidates not yet matched to any job -- shown at the bottom of the
  // home view so an uploaded CV is never invisible just because no
  // matching Job exists yet.
  const [unmatched, setUnmatched] = useState<Candidate[]>([]);
  const [unmatchedLoading, setUnmatchedLoading] = useState(false);
  const [unmatchedQuery, setUnmatchedQuery] = useState("");

  // Job detail (open when activeJob is set -- replaces the home view,
  // this is a single-page app so there's no separate route/tab for it)
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchQuery, setMatchQuery] = useState("");
  const [matchStatusFilter, setMatchStatusFilter] = useState<"all" | MatchStatus>("all");
  const [matchMinScore, setMatchMinScore] = useState("");
  const [matchSort, setMatchSort] = useState("score_desc");
  const [selectedMatchIds, setSelectedMatchIds] = useState<Set<string>>(new Set());
  const [reevaluating, setReevaluating] = useState(false);

  // Candidate profile modal
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileMatchContext, setProfileMatchContext] = useState<Match | null>(null);

  // Upload
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [showUploadSummary, setShowUploadSummary] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Export / share
  const [showExport, setShowExport] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [shareBusy, setShareBusy] = useState(false);

  const loadJobs = useCallback(async () => {
    setJobsLoading(true);
    try {
      const params = new URLSearchParams();
      if (jobsQuery.trim()) params.set("q", jobsQuery.trim());
      if (jobsStatusFilter !== "all") params.set("status", jobsStatusFilter);
      const res = await fetch(`/api/shortlist/jobs?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load jobs.");
      setJobs(data.jobs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load jobs.");
    } finally {
      setJobsLoading(false);
    }
  }, [jobsQuery, jobsStatusFilter]);

  const loadUnmatched = useCallback(async () => {
    setUnmatchedLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("unmatched", "1");
      if (unmatchedQuery.trim()) params.set("q", unmatchedQuery.trim());
      const res = await fetch(`/api/shortlist/candidates?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load candidates.");
      setUnmatched(data.candidates || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load candidates.");
    } finally {
      setUnmatchedLoading(false);
    }
  }, [unmatchedQuery]);

  const loadMatches = useCallback(async (jobId: string) => {
    setMatchesLoading(true);
    try {
      const params = new URLSearchParams();
      if (matchQuery.trim()) params.set("q", matchQuery.trim());
      if (matchStatusFilter !== "all") params.set("status", matchStatusFilter);
      if (matchMinScore) params.set("minScore", matchMinScore);
      params.set("sort", matchSort);
      const res = await fetch(`/api/shortlist/jobs/${jobId}/matches?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load candidates.");
      setMatches(data.matches || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load candidates.");
    } finally {
      setMatchesLoading(false);
    }
  }, [matchQuery, matchStatusFilter, matchMinScore, matchSort]);

  useEffect(() => {
    if (!activeJob) loadJobs();
  }, [activeJob, loadJobs]);

  useEffect(() => {
    if (!activeJob) loadUnmatched();
  }, [activeJob, loadUnmatched]);

  useEffect(() => {
    if (activeJob) loadMatches(activeJob.id);
  }, [activeJob, loadMatches]);

  function openJob(job: Job) {
    setActiveJob(job);
    setSelectedMatchIds(new Set());
    setMatchQuery("");
    setMatchStatusFilter("all");
    setMatchMinScore("");
  }
  function backToJobs() {
    setActiveJob(null);
  }

  // -------------------------------------------------------------------
  // Delete / remove
  // -------------------------------------------------------------------
  async function deleteJob(job: Job) {
    if (!confirm(`Delete "${job.title || "this job"}"? Candidates stay in your library -- only the job and its match records are removed.`)) return;
    try {
      const res = await fetch(`/api/shortlist/jobs/${job.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not delete job.");
      setNotice(`Deleted "${job.title || "job"}".`);
      setJobs((prev) => prev.filter((j) => j.id !== job.id));
      if (activeJob?.id === job.id) setActiveJob(null);
      loadUnmatched();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete job.");
    }
  }

  async function unmatchCandidate(match: Match) {
    if (!confirm(`Remove ${match.candidate?.name || "this candidate"} from this job? They'll stay in your candidate library and can still match other jobs.`)) return;
    try {
      const res = await fetch(`/api/shortlist/matches/${match.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not remove candidate.");
      setMatches((prev) => prev.filter((m) => m.id !== match.id));
      setSelectedMatchIds((prev) => {
        const next = new Set(prev);
        next.delete(match.id);
        return next;
      });
      setNotice(`Removed ${match.candidate?.name || "candidate"} from this job.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove candidate.");
    }
  }

  async function deleteUnmatchedCandidate(candidate: Candidate) {
    if (!confirm(`Permanently delete ${candidate.name || "this candidate"} and their CV? This can't be undone.`)) return;
    try {
      const res = await fetch(`/api/shortlist/candidates/${candidate.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not delete candidate.");
      setUnmatched((prev) => prev.filter((c) => c.id !== candidate.id));
      setNotice(`Deleted ${candidate.name || "candidate"}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete candidate.");
    }
  }

  // -------------------------------------------------------------------
  // Upload
  // -------------------------------------------------------------------
  async function processFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    setUploading(true);
    setUploadProgress({ done: 0, total: list.length });
    const results: UploadResult[] = [];
    for (const file of list) {
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/shortlist/upload", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) {
          results.push({ fileName: file.name, status: "error", message: data.error || "Upload failed." });
        } else {
          results.push(data as UploadResult);
        }
      } catch (err) {
        results.push({ fileName: file.name, status: "error", message: err instanceof Error ? err.message : "Upload failed." });
      }
      setUploadProgress((p) => ({ ...p, done: p.done + 1 }));
      setUploadResults([...results]);
    }
    setUploading(false);
    setShowUploadSummary(true);
    const jobsCreated = results.filter((r) => r.status === "job_created").length;
    const jobsReused = results.filter((r) => r.status === "job_reused").length;
    const candsCreated = results.filter((r) => r.status === "candidate_created").length;
    const candsReused = results.filter((r) => r.status === "candidate_reused").length;
    setNotice(
      `${jobsCreated + jobsReused ? `${jobsCreated + jobsReused} job(s) (${jobsReused} reused). ` : ""}` +
        `${candsCreated + candsReused ? `${candsCreated + candsReused} candidate(s) (${candsReused} reused).` : ""}`
    );
    // Refresh whatever's currently on screen.
    if (activeJob) {
      loadMatches(activeJob.id);
    } else {
      loadJobs();
      loadUnmatched();
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) processFiles(e.dataTransfer.files);
  }

  // -------------------------------------------------------------------
  // Candidate profile
  // -------------------------------------------------------------------
  const [profileData, setProfileData] = useState<{ candidate: Candidate; matches: Match[]; notes: Note[] } | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  async function openProfile(candidateId: string, matchContext?: Match | null) {
    setProfileId(candidateId);
    setProfileMatchContext(matchContext || null);
    setProfileLoading(true);
    setFileUrl(null);
    try {
      const res = await fetch(`/api/shortlist/candidates/${candidateId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load candidate.");
      setProfileData(data);
      if (data.candidate?.file_path) {
        const fr = await fetch(`/api/shortlist/candidates/${candidateId}/file`);
        const fd = await fr.json();
        if (fr.ok) setFileUrl(fd.url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load candidate.");
    } finally {
      setProfileLoading(false);
    }
  }
  function closeProfile() {
    setProfileId(null);
    setProfileData(null);
    setProfileMatchContext(null);
    setFileUrl(null);
  }

  async function saveField(field: string, value: unknown) {
    if (!profileData) return;
    try {
      const res = await fetch(`/api/shortlist/candidates/${profileData.candidate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save.");
      setProfileData((p) => (p ? { ...p, candidate: data.candidate } : p));
      setEditingField(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    }
  }

  async function addNote() {
    if (!profileData || !noteText.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/shortlist/candidates/${profileData.candidate.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: noteText.trim(), job_id: profileMatchContext?.job_id || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not add note.");
      setProfileData((p) => (p ? { ...p, notes: [data.note, ...p.notes] } : p));
      setNoteText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add note.");
    } finally {
      setSavingNote(false);
    }
  }

  async function updateMatchStatus(matchId: string, status: MatchStatus) {
    try {
      const res = await fetch(`/api/shortlist/matches/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update status.");
      setMatches((prev) => prev.map((m) => (m.id === matchId ? { ...m, status } : m)));
      if (profileMatchContext?.id === matchId) setProfileMatchContext({ ...profileMatchContext, status });
      setProfileData((p) =>
        p ? { ...p, matches: p.matches.map((m) => (m.id === matchId ? { ...m, status } : m)) } : p
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update status.");
    }
  }

  async function bulkStatus(status: MatchStatus) {
    if (!selectedMatchIds.size) return;
    try {
      const res = await fetch("/api/shortlist/matches/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchIds: Array.from(selectedMatchIds), status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update.");
      setMatches((prev) => prev.map((m) => (selectedMatchIds.has(m.id) ? { ...m, status } : m)));
      setNotice(`Updated ${data.updated} of ${data.total} candidate(s) to ${STATUS_LABEL[status]}.`);
      setSelectedMatchIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update.");
    }
  }

  async function reevaluateJob() {
    if (!activeJob) return;
    setReevaluating(true);
    try {
      const res = await fetch(`/api/shortlist/jobs/${activeJob.id}/reevaluate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not re-evaluate.");
      setNotice(`Re-evaluated ${data.reevaluated} candidate(s).`);
      loadMatches(activeJob.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not re-evaluate.");
    } finally {
      setReevaluating(false);
    }
  }

  async function resolveDuplicate(action: "merge" | "keep_separate" | "ignore", flaggedId: string, keepId?: string) {
    try {
      const res = await fetch("/api/shortlist/candidates/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, flaggedId, keepId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not resolve duplicate.");
      setNotice(action === "merge" ? "Candidates merged." : action === "keep_separate" ? "Kept as separate candidates." : "Dismissed.");
      if (action === "merge") closeProfile();
      else if (profileData) setProfileData({ ...profileData, candidate: data.candidate });
      if (!activeJob) loadUnmatched();
      if (activeJob) loadMatches(activeJob.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resolve duplicate.");
    }
  }

  function selectedMatchRows(): Match[] {
    if (selectedMatchIds.size) return matches.filter((m) => selectedMatchIds.has(m.id));
    return matches;
  }

  function exportCsv() {
    const rows = selectedMatchRows();
    const header = EXPORT_COLUMNS.map((c) => csvEscape(c.label)).join(",");
    const body = rows.map((r) => EXPORT_COLUMNS.map((c) => csvEscape(c.get(r))).join(",")).join("\n");
    downloadBlob(`${header}\n${body}`, "shortlist-candidates.csv", "text/csv;charset=utf-8");
    setShowExport(false);
  }
  async function exportExcel() {
    const XLSX = await import("xlsx");
    const rows = selectedMatchRows();
    const data = rows.map((r) => Object.fromEntries(EXPORT_COLUMNS.map((c) => [c.label, c.get(r) ?? ""])));
    const sheet = XLSX.utils.json_to_sheet(data);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Candidates");
    const buf = XLSX.write(book, { type: "array", bookType: "xlsx" });
    downloadBlob(buf, "shortlist-candidates.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    setShowExport(false);
  }
  async function exportPdf() {
    const { jsPDF } = await import("jspdf");
    const rows = selectedMatchRows();
    const doc = new jsPDF();
    let y = 14;
    doc.setFontSize(14);
    doc.text(`Shortlist.ai -- ${activeJob?.title || "Candidates"}`, 14, y);
    y += 8;
    doc.setFontSize(9);
    for (const r of rows) {
      if (y > 270) {
        doc.addPage();
        y = 14;
      }
      const c = r.candidate;
      const line1 = `${c?.name || "—"}  |  ${r.overall_score ?? "—"}/100 ${scoreLabel(r.overall_score)}  |  ${c?.current_company || "—"}  |  ${c?.location || "—"}`;
      const line2 = `Qualification: ${c?.qualification || "—"}  |  Comp: ${c?.current_compensation || "—"} -> ${c?.expected_compensation || "—"}  |  Notice: ${c?.notice_period || "—"}`;
      const line3 = `${c?.phone || "—"}  |  ${c?.email || "—"}  |  ${c?.linkedin_url || "No LinkedIn"}`;
      doc.text(line1, 14, y, { maxWidth: 180 });
      y += 6;
      doc.text(line2, 14, y, { maxWidth: 180 });
      y += 6;
      doc.text(line3, 14, y, { maxWidth: 180 });
      y += 8;
    }
    doc.save("shortlist-candidates.pdf");
    setShowExport(false);
  }

  async function sendShareEmail() {
    if (!shareEmail.trim()) {
      setError("Add a recipient email address.");
      return;
    }
    const rows = selectedMatchRows();
    if (!rows.length) {
      setError("Select at least one candidate first.");
      return;
    }
    setShareBusy(true);
    try {
      const res = await fetch("/api/shortlist/share-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: shareEmail.trim(),
          jobTitle: activeJob?.title || "",
          candidates: rows.map((r) => ({
            name: r.candidate?.name,
            current_company: r.candidate?.current_company,
            location: r.candidate?.location,
            overall_score: r.overall_score,
            qualification: r.candidate?.qualification,
            notice_period: r.candidate?.notice_period,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not send the email.");
      setNotice(`Sent ${rows.length} candidate(s) to ${shareEmail.trim()}.`);
      setShowShare(false);
      setShareEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the email.");
    } finally {
      setShareBusy(false);
    }
  }

  function shareWhatsApp() {
    const rows = selectedMatchRows();
    if (!rows.length) {
      setError("Select at least one candidate first.");
      return;
    }
    const lines = [
      `Shortlist.ai candidates${activeJob?.title ? ` — ${activeJob.title}` : ""}:`,
      ...rows.slice(0, 15).map((r, i) => {
        const c = r.candidate;
        return `${i + 1}. ${c?.name || "—"} — ${r.overall_score ?? "—"}/100, ${c?.current_company || "—"}, ${c?.location || "—"}`;
      }),
    ];
    const text = encodeURIComponent(lines.join("\n"));
    // No WhatsApp Business API is connected -- open a pre-filled chat
    // rather than claim a message was sent.
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
    setShowShare(false);
  }

  const dropZone = (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      className={`border-2 border-dashed rounded-xl px-6 py-10 text-center cursor-pointer transition-colors ${
        dragOver ? "border-brand bg-brand-wash" : "border-border hover:border-border-strong bg-page"
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) processFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="w-12 h-12 rounded-full bg-brand-wash text-brand flex items-center justify-center mx-auto mb-3">
        <Icon name="upload" className="w-6 h-6" />
      </div>
      <div className="text-[15px] font-bold text-ink">Drop JD or CV</div>
      <div className="text-[12.5px] text-ink-muted mt-1">
        Drop one or many job descriptions and resumes -- Shortlist.ai figures out which is which.
      </div>
      <div className="text-[11.5px] text-ink-muted mt-2">PDF, DOC, DOCX · click to browse</div>
    </div>
  );

  const uploadProgressBar = uploading && (
    <div className="border border-border rounded-lg bg-surface px-4 py-3 flex items-center gap-3">
      <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin flex-shrink-0" />
      <div className="flex-1 text-[12.5px] text-ink-2">
        {uploadProgress.done} / {uploadProgress.total} document{uploadProgress.total === 1 ? "" : "s"} analyzed…
      </div>
    </div>
  );

  const uploadSummaryPanel = showUploadSummary && uploadResults.length > 0 && (
    <div className="border border-border rounded-lg bg-surface p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-bold text-ink">Upload results</div>
        <button onClick={() => setShowUploadSummary(false)} className="text-ink-muted hover:text-ink">
          <Icon name="x" className="w-4 h-4" />
        </button>
      </div>
      <div className="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto">
        {uploadResults.map((r, i) => (
          <div key={i} className="flex items-center gap-2 text-[12px]">
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                r.status === "error" ? "bg-critical" : r.status === "unknown" ? "bg-warning" : "bg-good"
              }`}
            />
            <span className="text-ink-2 truncate flex-1">{r.fileName}</span>
            <span className="text-ink-muted flex-shrink-0">
              {r.status === "job_created" && "Job created"}
              {r.status === "job_reused" && "Job reused (duplicate JD)"}
              {r.status === "candidate_created" && "Candidate added"}
              {r.status === "candidate_reused" && "Already in library"}
              {r.status === "unknown" && "Unrecognized"}
              {r.status === "error" && "Failed"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 max-w-6xl">
      {error && (
        <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)}><Icon name="x" className="w-3.5 h-3.5" /></button>
        </div>
      )}
      {notice && (
        <div className="bg-good-wash text-good-text text-[12.5px] rounded-sm px-3 py-2 flex items-center justify-between">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)}><Icon name="x" className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {uploadProgressBar}
      {uploadSummaryPanel}

      {activeJob ? renderJobDetail() : renderHome()}

      {profileId && renderProfileModal()}
      {showExport && renderExportModal()}
      {showShare && renderShareModal()}
    </div>
  );

  // -------------------------------------------------------------------
  // Home: dropzone -> jobs listed one by one -> unmatched candidates
  // -------------------------------------------------------------------
  function renderHome() {
    return (
      <div className="flex flex-col gap-4">
        {dropZone}

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={jobsQuery}
            onChange={(e) => setJobsQuery(e.target.value)}
            placeholder="Search jobs by title, company, location…"
            className="flex-1 min-w-[200px] border border-border rounded-md px-3 py-2 text-[13px] bg-surface outline-none focus:border-brand"
          />
          <select
            value={jobsStatusFilter}
            onChange={(e) => setJobsStatusFilter(e.target.value as "all" | JobStatus)}
            className="border border-border rounded-md px-2.5 py-2 text-[12.5px] bg-surface outline-none"
          >
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="on_hold">On Hold</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        {jobsLoading ? (
          <div className="text-[13px] text-ink-muted">Loading…</div>
        ) : jobs.length === 0 ? (
          <div className="border border-dashed border-border rounded-lg px-6 py-10 text-center text-[13px] text-ink-muted">
            No jobs yet. Drop a JD above to create your first Job.
          </div>
        ) : (
          <div className="border border-border rounded-lg bg-surface divide-y divide-border">
            {jobs.map((job) => (
              <div key={job.id} className="flex items-center gap-2 group hover:bg-page/60">
                <button onClick={() => openJob(job)} className="flex-1 min-w-0 text-left flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-bold text-ink truncate">{job.title || "Untitled role"}</span>
                      <span
                        className={`shrink-0 text-[10.5px] font-bold px-2 py-0.5 rounded-full ${
                          job.status === "open" ? "bg-good-wash text-good-text" : job.status === "on_hold" ? "bg-warning-wash text-ink" : "bg-page text-ink-muted"
                        }`}
                      >
                        {job.status === "open" ? "Open" : job.status === "on_hold" ? "On Hold" : "Closed"}
                      </span>
                    </div>
                    <div className="text-[12px] text-ink-muted truncate">
                      {[job.company, job.location, job.experience_required].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-3 text-[11.5px] text-ink-2 flex-shrink-0">
                    <span>{job.candidate_count ?? 0} candidates</span>
                    <span>{job.shortlisted_count ?? 0} shortlisted</span>
                    <span className="text-ink-muted">{fmtDate(job.created_at)}</span>
                  </div>
                </button>
                <button
                  onClick={() => deleteJob(job)}
                  title="Delete job"
                  className="opacity-0 group-hover:opacity-100 text-ink-muted hover:text-critical flex-shrink-0 px-3"
                >
                  <Icon name="trash" className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2 mt-2">
          <div className="text-[12px] font-bold text-ink-muted uppercase tracking-wide">Unmatched candidates</div>
          <input
            value={unmatchedQuery}
            onChange={(e) => setUnmatchedQuery(e.target.value)}
            placeholder="Search name, company, email…"
            className="w-full max-w-sm border border-border rounded-md px-3 py-2 text-[12.5px] bg-surface outline-none focus:border-brand"
          />
          {unmatchedLoading ? (
            <div className="text-[12.5px] text-ink-muted">Loading…</div>
          ) : unmatched.length === 0 ? (
            <div className="text-[12px] text-ink-muted">
              Every candidate in your library currently matches at least one job.
            </div>
          ) : (
            <div className="border border-border rounded-lg bg-surface divide-y divide-border">
              {unmatched.map((c) => (
                <div key={c.id} className="flex items-center gap-2 group hover:bg-page/60">
                  <button onClick={() => openProfile(c.id)} className="flex-1 min-w-0 text-left flex items-center gap-3 px-3.5 py-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-ink flex items-center gap-1.5">
                        {c.name || "Unnamed"}
                        {c.dedupe_status === "possible_duplicate" && (
                          <span className="text-[10px] font-semibold text-warning-text bg-warning-wash rounded-full px-1.5 py-0.5">Possible duplicate</span>
                        )}
                      </div>
                      <div className="text-[11.5px] text-ink-muted truncate">
                        {[c.current_company, c.location, c.qualification].filter(Boolean).join(" · ") || "No details extracted"}
                      </div>
                    </div>
                    <div className="text-[11px] text-ink-muted flex-shrink-0">{fmtDate(c.created_at)}</div>
                  </button>
                  <button
                    onClick={() => deleteUnmatchedCandidate(c)}
                    title="Delete candidate"
                    className="opacity-0 group-hover:opacity-100 text-ink-muted hover:text-critical flex-shrink-0 px-3"
                  >
                    <Icon name="trash" className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderJobDetail() {
    if (!activeJob) return null;
    const job = activeJob;
    return (
      <div className="flex flex-col gap-4">
        <button onClick={backToJobs} className="text-[12px] text-ink-muted hover:text-ink flex items-center gap-1 self-start">
          <Icon name="chevronLeft" className="w-3.5 h-3.5" /> Back to Jobs
        </button>

        <div className="border border-border rounded-lg bg-surface p-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-[17px] font-bold text-ink">{job.title || "Untitled role"}</div>
              <div className="text-[12.5px] text-ink-muted mt-0.5">
                {[job.company, job.location, job.work_mode].filter(Boolean).join(" · ") || "—"}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={job.status}
                onChange={async (e) => {
                  const status = e.target.value as JobStatus;
                  const res = await fetch(`/api/shortlist/jobs/${job.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status }),
                  });
                  const data = await res.json();
                  if (res.ok) setActiveJob(data.job);
                }}
                className="border border-border rounded-md px-2.5 py-1.5 text-[12px] bg-surface outline-none"
              >
                <option value="open">Open</option>
                <option value="on_hold">On Hold</option>
                <option value="closed">Closed</option>
              </select>
              {job.jd_file_path && (
                <button
                  onClick={async () => {
                    const res = await fetch(`/api/shortlist/jobs/${job.id}/file`);
                    const data = await res.json();
                    if (res.ok) window.open(data.url, "_blank", "noopener,noreferrer");
                  }}
                  className="text-[12px] font-semibold text-brand border border-border rounded-md px-2.5 py-1.5 hover:border-border-strong"
                >
                  View JD
                </button>
              )}
              <button
                onClick={reevaluateJob}
                disabled={reevaluating}
                className="text-[12px] font-semibold text-ink-2 border border-border rounded-md px-2.5 py-1.5 hover:border-border-strong disabled:opacity-50 flex items-center gap-1"
              >
                <Icon name="sparkle" className="w-3.5 h-3.5" />
                {reevaluating ? "Re-evaluating…" : "Re-evaluate"}
              </button>
              <button
                onClick={() => deleteJob(job)}
                title="Delete job"
                className="text-[12px] font-semibold text-critical border border-border rounded-md px-2.5 py-1.5 hover:border-critical flex items-center gap-1"
              >
                <Icon name="trash" className="w-3.5 h-3.5" />
                Delete
              </button>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-2 text-[12px]">
            <Field label="Experience" value={job.experience_required} />
            <Field label="Qualification" value={job.qualification} />
            <Field label="Industry" value={job.industry} />
            <Field label="Notice period" value={job.notice_period_requirement} />
            <Field
              label="Compensation"
              value={job.comp_min || job.comp_max ? `${job.comp_min ?? "?"}–${job.comp_max ?? "?"} ${job.comp_currency || ""}` : null}
            />
            <Field label="Department" value={job.department} />
          </div>
          {job.required_skills?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {job.required_skills.map((s) => (
                <span key={s} className="text-[11px] bg-page text-ink-2 rounded-full px-2 py-0.5">{s}</span>
              ))}
            </div>
          )}
        </div>

        {dropZone}

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={matchQuery}
            onChange={(e) => setMatchQuery(e.target.value)}
            placeholder="Search candidates…"
            className="flex-1 min-w-[180px] border border-border rounded-md px-3 py-2 text-[13px] bg-surface outline-none focus:border-brand"
          />
          <select value={matchStatusFilter} onChange={(e) => setMatchStatusFilter(e.target.value as "all" | MatchStatus)} className="border border-border rounded-md px-2.5 py-2 text-[12px] bg-surface outline-none">
            <option value="all">All statuses</option>
            {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <input
            value={matchMinScore}
            onChange={(e) => setMatchMinScore(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="Min score"
            className="w-[90px] border border-border rounded-md px-2.5 py-2 text-[12px] bg-surface outline-none"
          />
          <select value={matchSort} onChange={(e) => setMatchSort(e.target.value)} className="border border-border rounded-md px-2.5 py-2 text-[12px] bg-surface outline-none">
            <option value="score_desc">Score: high to low</option>
            <option value="score_asc">Score: low to high</option>
            <option value="recent">Most recent</option>
          </select>
        </div>

        {selectedMatchIds.size > 0 && (
          <div className="border border-brand/30 bg-brand-wash rounded-md px-3 py-2 flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-semibold text-brand">{selectedMatchIds.size} selected</span>
            <select
              onChange={(e) => {
                if (e.target.value) bulkStatus(e.target.value as MatchStatus);
                e.target.value = "";
              }}
              className="border border-border rounded-md px-2 py-1 text-[11.5px] bg-surface outline-none"
              defaultValue=""
            >
              <option value="" disabled>Change status…</option>
              {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            <button onClick={() => setShowExport(true)} className="text-[11.5px] font-semibold text-ink-2 border border-border rounded-md px-2.5 py-1 bg-surface">Export</button>
            <button onClick={() => setShowShare(true)} className="text-[11.5px] font-semibold text-ink-2 border border-border rounded-md px-2.5 py-1 bg-surface">Share</button>
            <button onClick={() => bulkStatus("rejected")} className="text-[11.5px] font-semibold text-critical border border-border rounded-md px-2.5 py-1 bg-surface">Reject</button>
            <button onClick={() => setSelectedMatchIds(new Set())} className="text-[11.5px] text-ink-muted ml-auto">Clear</button>
          </div>
        )}

        {matchesLoading ? (
          <div className="text-[13px] text-ink-muted">Loading candidates…</div>
        ) : matches.length === 0 ? (
          <div className="border border-dashed border-border rounded-lg px-6 py-10 text-center text-[13px] text-ink-muted">
            Drop CVs here and Shortlist.ai will analyze and match them automatically.
          </div>
        ) : (
          <div className="border border-border rounded-lg bg-surface overflow-x-auto">
            <table className="w-full text-[12.5px] min-w-[1900px]">
              <thead>
                <tr className="border-b border-border text-left text-ink-muted text-[11px] uppercase tracking-wide">
                  <th className="px-3 py-2 w-8">
                    <input
                      type="checkbox"
                      checked={selectedMatchIds.size === matches.length && matches.length > 0}
                      onChange={(e) => setSelectedMatchIds(e.target.checked ? new Set(matches.map((m) => m.id)) : new Set())}
                    />
                  </th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Score</th>
                  <th className="px-3 py-2">Company</th>
                  <th className="px-3 py-2">Experience</th>
                  <th className="px-3 py-2">Qualification</th>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2">Compensation</th>
                  <th className="px-3 py-2">Expectation</th>
                  <th className="px-3 py-2">Notice period</th>
                  <th className="px-3 py-2">Evaluation</th>
                  <th className="px-3 py-2">Contact number</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">LinkedIn</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Date added</th>
                  <th className="px-3 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {matches.map((m) => {
                  const c = m.candidate;
                  return (
                    <tr key={m.id} className="hover:bg-page/60">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedMatchIds.has(m.id)}
                          onChange={(e) => {
                            const next = new Set(selectedMatchIds);
                            if (e.target.checked) next.add(m.id); else next.delete(m.id);
                            setSelectedMatchIds(next);
                          }}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <button onClick={() => c && openProfile(c.id, m)} className="font-semibold text-brand hover:underline text-left">
                          {c?.name || "Unnamed"}
                        </button>
                        {c?.dedupe_status === "possible_duplicate" && (
                          <div className="text-[10px] text-warning-text mt-0.5">Possible duplicate</div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${scoreClass(m.overall_score)}`}>
                          {m.overall_score ?? "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-ink-2">{c?.current_company || "Not found"}</td>
                      <td className="px-3 py-2 text-ink-2">{c?.total_experience_years != null ? `${c.total_experience_years} yrs` : "Not found"}</td>
                      <td className="px-3 py-2 text-ink-2 max-w-[160px] truncate" title={c?.qualification || undefined}>{c?.qualification || "Not found"}</td>
                      <td className="px-3 py-2 text-ink-2">{c?.location || "Not found"}</td>
                      <td className="px-3 py-2 text-ink-2">{c?.current_compensation || "Not found"}</td>
                      <td className="px-3 py-2 text-ink-2">{c?.expected_compensation || "Not found"}</td>
                      <td className="px-3 py-2 text-ink-2">{c?.notice_period || "Not found"}</td>
                      <td className="px-3 py-2 text-ink-muted max-w-[220px] truncate" title={m.evaluation || undefined}>
                        <button onClick={() => c && openProfile(c.id, m)} className="hover:text-ink hover:underline text-left truncate block w-full">
                          {m.evaluation || "Not evaluated yet"}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-ink-muted text-[11.5px]">{c?.phone || "Not found"}</td>
                      <td className="px-3 py-2 text-ink-muted text-[11.5px]">{c?.email || "Not found"}</td>
                      <td className="px-3 py-2">
                        {c?.linkedin_url ? (
                          <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-brand font-semibold hover:underline">View</a>
                        ) : (
                          <span className="text-ink-muted">Not found</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={m.status}
                          onChange={(e) => updateMatchStatus(m.id, e.target.value as MatchStatus)}
                          className={`text-[11px] font-semibold rounded-full px-2 py-0.5 border-none outline-none ${statusPillClass(m.status)}`}
                        >
                          {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-ink-muted text-[11px]">{fmtDate(c?.created_at || null)}</td>
                      <td className="px-3 py-2">
                        <button onClick={() => unmatchCandidate(m)} title="Remove from this job" className="text-ink-muted hover:text-critical">
                          <Icon name="trash" className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  function renderProfileModal() {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3" onClick={closeProfile}>
        <div
          className="bg-surface rounded-xl shadow-soft max-w-4xl w-full max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {profileLoading || !profileData ? (
            <div className="p-6 text-[13px] text-ink-muted">Loading candidate…</div>
          ) : (
            <div className="flex flex-col">
              <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border sticky top-0 bg-surface z-10">
                <div>
                  <div className="text-[17px] font-bold text-ink">{profileData.candidate.name || "Unnamed candidate"}</div>
                  {profileMatchContext && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${scoreClass(profileMatchContext.overall_score)}`}>
                        {profileMatchContext.overall_score ?? "—"}/100 · {scoreLabel(profileMatchContext.overall_score)}
                      </span>
                      <span className="text-[11.5px] text-ink-muted">for {profileMatchContext.job?.title || "this role"}</span>
                    </div>
                  )}
                </div>
                <button onClick={closeProfile} className="text-ink-muted hover:text-ink"><Icon name="x" className="w-5 h-5" /></button>
              </div>

              <div className="p-5 flex flex-col gap-5">
                {profileData.candidate.dedupe_status === "possible_duplicate" && profileData.candidate.duplicate_of && (
                  <div className="border border-warning bg-warning-wash rounded-md px-3.5 py-3 flex flex-wrap items-center gap-2">
                    <span className="text-[12.5px] text-ink font-semibold flex-1">Possible duplicate candidate</span>
                    <button onClick={() => resolveDuplicate("merge", profileData.candidate.id, profileData.candidate.duplicate_of!)} className="text-[11.5px] font-bold text-white bg-brand px-2.5 py-1 rounded-sm">Merge</button>
                    <button onClick={() => resolveDuplicate("keep_separate", profileData.candidate.id)} className="text-[11.5px] font-bold text-ink-2 border border-border rounded-sm px-2.5 py-1 bg-surface">Keep Separate</button>
                    <button onClick={() => resolveDuplicate("ignore", profileData.candidate.id)} className="text-[11.5px] text-ink-muted px-2 py-1">Ignore</button>
                  </div>
                )}

                {profileData.candidate.ai_status === "failed" && (
                  <div className="border border-critical bg-critical-wash rounded-md px-3.5 py-2.5 text-[12px] text-critical">
                    AI extraction failed on this document{profileData.candidate.ai_error ? `: ${profileData.candidate.ai_error}` : "."} Fields below need manual entry.
                  </div>
                )}

                <div className="grid sm:grid-cols-2 gap-5">
                  <div className="flex flex-col gap-3">
                    <div className="text-[12px] font-bold text-ink-muted uppercase tracking-wide">Professional Information</div>
                    <EditableField label="Current company" value={profileData.candidate.current_company} field="current_company" manual={profileData.candidate.manual_fields} editingField={editingField} setEditingField={setEditingField} onSave={saveField} />
                    <EditableField label="Total experience (yrs)" value={profileData.candidate.total_experience_years} field="total_experience_years" manual={profileData.candidate.manual_fields} editingField={editingField} setEditingField={setEditingField} onSave={saveField} type="number" />
                    <EditableField label="Qualification" value={profileData.candidate.qualification} field="qualification" manual={profileData.candidate.manual_fields} editingField={editingField} setEditingField={setEditingField} onSave={saveField} />
                    <EditableField label="Location" value={profileData.candidate.location} field="location" manual={profileData.candidate.manual_fields} editingField={editingField} setEditingField={setEditingField} onSave={saveField} />
                    <EditableField label="Current compensation" value={profileData.candidate.current_compensation} field="current_compensation" manual={profileData.candidate.manual_fields} editingField={editingField} setEditingField={setEditingField} onSave={saveField} />
                    <EditableField label="Expected compensation" value={profileData.candidate.expected_compensation} field="expected_compensation" manual={profileData.candidate.manual_fields} editingField={editingField} setEditingField={setEditingField} onSave={saveField} />
                    <EditableField label="Notice period" value={profileData.candidate.notice_period} field="notice_period" manual={profileData.candidate.manual_fields} editingField={editingField} setEditingField={setEditingField} onSave={saveField} />
                    {profileData.candidate.skills?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {profileData.candidate.skills.map((s) => (
                          <span key={s} className="text-[11px] bg-page text-ink-2 rounded-full px-2 py-0.5">{s}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-3">
                    <div className="text-[12px] font-bold text-ink-muted uppercase tracking-wide">Contact</div>
                    <EditableField label="Phone" value={profileData.candidate.phone} field="phone" manual={profileData.candidate.manual_fields} editingField={editingField} setEditingField={setEditingField} onSave={saveField} />
                    <EditableField label="Email" value={profileData.candidate.email} field="email" manual={profileData.candidate.manual_fields} editingField={editingField} setEditingField={setEditingField} onSave={saveField} />
                    <EditableField label="LinkedIn" value={profileData.candidate.linkedin_url} field="linkedin_url" manual={profileData.candidate.manual_fields} editingField={editingField} setEditingField={setEditingField} onSave={saveField} link />

                    {profileMatchContext && (
                      <>
                        <div className="text-[12px] font-bold text-ink-muted uppercase tracking-wide mt-2">Status</div>
                        <select
                          value={profileMatchContext.status}
                          onChange={(e) => updateMatchStatus(profileMatchContext.id, e.target.value as MatchStatus)}
                          className={`text-[12px] font-semibold rounded-full px-2.5 py-1 border-none outline-none self-start ${statusPillClass(profileMatchContext.status)}`}
                        >
                          {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                        </select>
                      </>
                    )}

                    {fileUrl && (
                      <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="text-[12px] font-semibold text-brand mt-1">
                        Open original CV →
                      </a>
                    )}
                  </div>
                </div>

                {profileMatchContext && (
                  <div className="border border-border rounded-lg p-4 flex flex-col gap-3">
                    <div className="text-[12px] font-bold text-ink-muted uppercase tracking-wide">AI Evaluation</div>
                    <p className="text-[13px] text-ink-2">{profileMatchContext.evaluation || "No evaluation available."}</p>
                    {profileMatchContext.score_breakdown && profileMatchContext.score_breakdown.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        {profileMatchContext.score_breakdown.map((d) => (
                          <div key={d.label} className="flex items-center gap-2 text-[11.5px]">
                            <span className="w-32 text-ink-muted truncate">{d.label}</span>
                            <div className="flex-1 h-1.5 bg-page rounded-full overflow-hidden">
                              <div className="h-full bg-brand rounded-full" style={{ width: `${d.max ? (d.score / d.max) * 100 : 0}%` }} />
                            </div>
                            <span className="w-12 text-right text-ink-2">{d.score}/{d.max}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="grid sm:grid-cols-3 gap-3 mt-1">
                      <ListBlock title="Strengths" items={profileMatchContext.strengths} tone="good" />
                      <ListBlock title="Concerns" items={profileMatchContext.concerns} tone="warning" />
                      <ListBlock title="Missing requirements" items={profileMatchContext.missing_requirements} tone="critical" />
                    </div>
                  </div>
                )}

                {!profileMatchContext && profileData.matches.length > 0 && (
                  <div className="border border-border rounded-lg p-4">
                    <div className="text-[12px] font-bold text-ink-muted uppercase tracking-wide mb-2">Matched Jobs</div>
                    <div className="flex flex-col gap-2">
                      {profileData.matches.map((m) => (
                        <div key={m.id} className="flex items-center justify-between gap-2 text-[12.5px]">
                          <span className="text-ink">{m.job?.title || "Untitled role"} <span className="text-ink-muted">· {m.job?.company}</span></span>
                          <div className="flex items-center gap-2">
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${scoreClass(m.overall_score)}`}>{m.overall_score ?? "—"}</span>
                            <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${statusPillClass(m.status)}`}>{STATUS_LABEL[m.status]}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="border border-border rounded-lg p-4 flex flex-col gap-2.5">
                  <div className="text-[12px] font-bold text-ink-muted uppercase tracking-wide">Notes</div>
                  <div className="flex gap-2">
                    <input
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Add a private note…"
                      onKeyDown={(e) => e.key === "Enter" && addNote()}
                      className="flex-1 border border-border rounded-md px-3 py-1.5 text-[12.5px] bg-page outline-none focus:border-brand"
                    />
                    <button onClick={addNote} disabled={savingNote || !noteText.trim()} className="text-[12px] font-bold text-white bg-brand px-3 py-1.5 rounded-md disabled:opacity-50">Add</button>
                  </div>
                  {profileData.notes.length === 0 ? (
                    <div className="text-[11.5px] text-ink-muted">No notes yet.</div>
                  ) : (
                    <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto">
                      {profileData.notes.map((n) => (
                        <div key={n.id} className="text-[12px] text-ink-2 border-l-2 border-border pl-2.5">
                          {n.note}
                          <div className="text-[10.5px] text-ink-muted mt-0.5">{fmtDate(n.created_at)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderExportModal() {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3" onClick={() => setShowExport(false)}>
        <div className="bg-surface rounded-xl shadow-soft max-w-sm w-full p-5 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
          <div className="text-[14px] font-bold text-ink">Export candidates</div>
          <div className="text-[12px] text-ink-muted">{selectedMatchRows().length} candidate(s) will be exported.</div>
          <button onClick={exportCsv} className="text-[12.5px] font-semibold text-ink-2 border border-border rounded-md px-3 py-2 text-left hover:border-border-strong">Export as CSV</button>
          <button onClick={exportExcel} className="text-[12.5px] font-semibold text-ink-2 border border-border rounded-md px-3 py-2 text-left hover:border-border-strong">Export as Excel</button>
          <button onClick={exportPdf} className="text-[12.5px] font-semibold text-ink-2 border border-border rounded-md px-3 py-2 text-left hover:border-border-strong">Export as PDF report</button>
          <button onClick={() => setShowExport(false)} className="text-[12px] text-ink-muted mt-1">Cancel</button>
        </div>
      </div>
    );
  }

  function renderShareModal() {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3" onClick={() => setShowShare(false)}>
        <div className="bg-surface rounded-xl shadow-soft max-w-sm w-full p-5 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
          <div className="text-[14px] font-bold text-ink">Share {selectedMatchRows().length} candidate(s)</div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11.5px] text-ink-muted">Email</label>
            <div className="flex gap-2">
              <input
                value={shareEmail}
                onChange={(e) => setShareEmail(e.target.value)}
                placeholder="recipient@company.com"
                className="flex-1 border border-border rounded-md px-3 py-2 text-[12.5px] bg-page outline-none focus:border-brand"
              />
              <button onClick={sendShareEmail} disabled={shareBusy} className="text-[12px] font-bold text-white bg-brand px-3 py-2 rounded-md disabled:opacity-50">
                {shareBusy ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
          <button onClick={shareWhatsApp} className="text-[12.5px] font-semibold text-ink-2 border border-border rounded-md px-3 py-2 text-left hover:border-border-strong flex items-center gap-2">
            <Icon name="whatsapp" className="w-4 h-4" /> Share via WhatsApp
          </button>
          <button onClick={() => setShowShare(false)} className="text-[12px] text-ink-muted mt-1">Cancel</button>
        </div>
      </div>
    );
  }
}

function Field({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div>
      <div className="text-ink-muted">{label}</div>
      <div className="text-ink-2 font-medium">{value ?? "Not found"}</div>
    </div>
  );
}

function ListBlock({ title, items, tone }: { title: string; items: string[]; tone: "good" | "warning" | "critical" }) {
  const cls = tone === "good" ? "text-good-text" : tone === "warning" ? "text-ink" : "text-critical";
  return (
    <div>
      <div className="text-[11px] font-bold text-ink-muted uppercase tracking-wide mb-1">{title}</div>
      {items.length === 0 ? (
        <div className="text-[11.5px] text-ink-muted">None noted.</div>
      ) : (
        <ul className={`text-[11.5px] ${cls} flex flex-col gap-0.5 list-disc list-inside`}>
          {items.map((it, i) => <li key={i}>{it}</li>)}
        </ul>
      )}
    </div>
  );
}

function EditableField({
  label,
  value,
  field,
  manual,
  editingField,
  setEditingField,
  onSave,
  type = "text",
  link = false,
}: {
  label: string;
  value: string | number | null;
  field: string;
  manual: string[];
  editingField: string | null;
  setEditingField: (f: string | null) => void;
  onSave: (field: string, value: unknown) => void;
  type?: "text" | "number";
  link?: boolean;
}) {
  const isManual = manual.includes(field);
  const editing = editingField === field;
  const [draft, setDraft] = useState(value ?? "");

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave(field, type === "number" ? Number(draft) || null : draft || null);
            if (e.key === "Escape") setEditingField(null);
          }}
          className="flex-1 border border-brand rounded-md px-2 py-1 text-[12.5px] bg-page outline-none"
        />
        <button onClick={() => onSave(field, type === "number" ? Number(draft) || null : draft || null)} className="text-brand"><Icon name="check" className="w-4 h-4" /></button>
        <button onClick={() => setEditingField(null)} className="text-ink-muted"><Icon name="x" className="w-4 h-4" /></button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 group">
      <div className="min-w-0">
        <div className="text-[11px] text-ink-muted">{label}</div>
        {value == null || value === "" ? (
          <button onClick={() => { setDraft(""); setEditingField(field); }} className="text-[12.5px] text-brand font-semibold">
            Not found · + Add manually
          </button>
        ) : link ? (
          <a href={value as string} target="_blank" rel="noopener noreferrer" className="text-[12.5px] text-brand truncate block hover:underline">{value}</a>
        ) : (
          <div className="text-[12.5px] text-ink-2 truncate">
            {value}
            {isManual && <span className="ml-1.5 text-[9.5px] font-semibold text-ink-muted bg-page rounded-full px-1.5 py-0.5">Manually updated</span>}
          </div>
        )}
      </div>
      {value != null && value !== "" && (
        <button onClick={() => { setDraft(value); setEditingField(field); }} className="opacity-0 group-hover:opacity-100 text-ink-muted hover:text-ink flex-shrink-0">
          <Icon name="edit" className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
