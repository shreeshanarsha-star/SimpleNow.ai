"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { useRegisterToolHome } from "@/components/ToolHomeContext";

type Mode = "jd" | "describe" | "manual";
type Step = "input" | "running" | "results";
type ViewMode = "table" | "compact" | "split";

type SearchRow = {
  id: string;
  extracted_role: string | null;
  extracted_skills: string[] | null;
  extracted_location: string | null;
  search_query: string;
};

type Candidate = {
  id: string;
  name: string | null;
  designation: string | null;
  company: string | null;
  location: string | null;
  experience_years: number | null;
  compensation: string | null;
  qualification: string | null;
  skills: string[] | null;
  profile_url: string;
  match_score: number | null;
  evaluation_summary: string | null;
  evaluation_strengths: string[] | null;
  evaluation_gaps: string[] | null;
  internal_person_id: string | null;
  already_in_pipeline: boolean;
  project_member_id?: string;
  project_status?: string;
  project_comments?: string;
  added_at?: string;
};

type Requisition = { id: string; title: string };
type ProjectList = { id: string; name: string };
type ProjectSummary = { id: string; name: string; created_at: string; candidateCount: number };

export const PIPELINE_STATUSES = [
  "CV Screened",
  "CV Shared",
  "L1 Interview Shortlist",
  "L2 Interview Shortlist",
  "HR Interview Shortlist",
  "Offered",
  "To Join",
  "Joined",
  "Hold",
  "Rejected",
  "Offer Drop",
  "Backout",
] as const;

export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

function statusBadgeClass(status: string | null | undefined): string {
  switch (status) {
    case "CV Screened":
      return "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800";
    case "CV Shared":
      return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800";
    case "L1 Interview Shortlist":
      return "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800";
    case "L2 Interview Shortlist":
      return "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800";
    case "HR Interview Shortlist":
      return "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-950/60 dark:text-fuchsia-300 dark:border-fuchsia-800";
    case "Offered":
      return "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800";
    case "To Join":
      return "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800";
    case "Joined":
      return "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800";
    case "Hold":
      return "bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-950/60 dark:text-yellow-400 dark:border-yellow-800";
    case "Rejected":
      return "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800";
    case "Offer Drop":
      return "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800";
    case "Backout":
      return "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800";
    default:
      return "bg-page text-ink-muted border-border";
  }
}

const STATUS_STEPS = [
  "Reading the input",
  "Extracting role & skills",
  "Searching public data",
  "Scoring matches",
  "Checking your database",
];

const VIEWS: { key: ViewMode; label: string; icon: string }[] = [
  { key: "table", label: "Table", icon: "grid" },
  { key: "compact", label: "Compact", icon: "menu" },
  { key: "split", label: "Split", icon: "columns" },
];

const PAGE_SIZE = 20;
const VIEW_STORAGE_KEY = "smartSourceView";

function scoreClass(score: number | null) {
  if (score == null) return "bg-page text-ink-muted";
  if (score >= 70) return "bg-good-wash text-good-text";
  if (score >= 40) return "bg-warning-wash text-ink";
  return "bg-critical-wash text-critical";
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

const EXPORT_COLUMNS: { key: keyof Candidate; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "match_score", label: "Score" },
  { key: "company", label: "Company" },
  { key: "location", label: "Location" },
  { key: "experience_years", label: "Experience" },
  { key: "compensation", label: "Compensation" },
  { key: "qualification", label: "Qualification" },
  { key: "profile_url", label: "LinkedIn" },
];

export default function SmartSourceAiForm({
  isAdmin,
  monthlySearchCount,
}: {
  isAdmin?: boolean;
  monthlySearchCount?: number;
}) {
  const [mode, setMode] = useState<Mode>("jd");
  const [jdText, setJdText] = useState("");
  const [jdInputMode, setJdInputMode] = useState<"file" | "paste">("file");
  const [jdFile, setJdFile] = useState<File | null>(null);
  const [jdDragOver, setJdDragOver] = useState(false);
  const [jdExtracting, setJdExtracting] = useState(false);
  const [jdExtractError, setJdExtractError] = useState<string | null>(null);
  const [describeText, setDescribeText] = useState("");
  const [manualRole, setManualRole] = useState("");
  const [manualCompany, setManualCompany] = useState("");
  const [manualLocation, setManualLocation] = useState("");
  const [manualSkills, setManualSkills] = useState("");
  const [manualExperience, setManualExperience] = useState("");

  const [step, setStep] = useState<Step>("input");
  const [statusIdx, setStatusIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState<SearchRow | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const statusTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [view, setView] = useState<ViewMode>("table");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);

  const [showAddToProject, setShowAddToProject] = useState(false);
  const [candidateForProject, setCandidateForProject] = useState<Candidate[] | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [lists, setLists] = useState<ProjectList[]>([]);
  const [pickedRequisition, setPickedRequisition] = useState("");
  const [pickedList, setPickedList] = useState("");
  const [newListName, setNewListName] = useState("");
  const [sourcesLoaded, setSourcesLoaded] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [busyAction, setBusyAction] = useState(false);

  const [showProjectsPanel, setShowProjectsPanel] = useState(false);
  const [projectsList, setProjectsList] = useState<ProjectSummary[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeProjectName, setActiveProjectName] = useState("");
  const [activeProjectCandidates, setActiveProjectCandidates] = useState<Candidate[]>([]);
  const [projectDetailLoading, setProjectDetailLoading] = useState(false);
  const [projectExpanded, setProjectExpanded] = useState<string | null>(null);
  const [renamingProject, setRenamingProject] = useState<{ id: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renamingBusy, setRenamingBusy] = useState(false);
  const [projectStatusFilter, setProjectStatusFilter] = useState<string>("All");
  const [projectSearchQuery, setProjectSearchQuery] = useState<string>("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);

  // Topbar's clickable "Smart Source.ai" title (ToolHomeContext) closes the
  // My Projects panel, returning to the search view underneath it.
  useRegisterToolHome(useCallback(() => setShowProjectsPanel(false), []));

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(VIEW_STORAGE_KEY) : null;
    if (saved && (saved === "table" || saved === "compact" || saved === "split")) {
      setView(saved as ViewMode);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view]);

  useEffect(() => {
    return () => {
      if (statusTimer.current) clearInterval(statusTimer.current);
    };
  }, []);

  const JD_ACCEPTED_EXT = [".pdf", ".docx", ".txt"];

  async function extractJdFile(file: File | undefined | null) {
    if (!file) return;
    const ok = JD_ACCEPTED_EXT.some((ext) => file.name.toLowerCase().endsWith(ext));
    if (!ok) {
      setJdExtractError("That file type isn't supported — use a PDF, DOCX, or TXT.");
      return;
    }
    setJdExtractError(null);
    setJdFile(file);
    setJdExtracting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/smart-source/extract-jd-text", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't read that file.");
      setJdText(data.text || "");
    } catch (err) {
      setJdExtractError(err instanceof Error ? err.message : "Couldn't read that file.");
      setJdFile(null);
    } finally {
      setJdExtracting(false);
    }
  }

  async function handleSearch() {
    setError(null);
    setNotice(null);

    let body: Record<string, unknown>;
    if (mode === "manual") {
      const skills = manualSkills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (!manualRole.trim() && !skills.length) {
        setError("Add a role title or at least one skill.");
        return;
      }
      body = {
        mode,
        manual: {
          role_title: manualRole.trim() || null,
          company: manualCompany.trim() || null,
          location: manualLocation.trim() || null,
          skills,
          min_experience_years: manualExperience ? Number(manualExperience) : null,
        },
      };
    } else {
      const text = mode === "jd" ? jdText : describeText;
      if (!text.trim()) {
        setError(mode === "jd" ? "Paste a job description first." : "Describe who you're looking for first.");
        return;
      }
      body = { mode, text: text.trim() };
    }

    setStep("running");
    setStatusIdx(0);
    statusTimer.current = setInterval(() => {
      setStatusIdx((i) => (i < STATUS_STEPS.length - 1 ? i + 1 : i));
    }, 1800);

    try {
      const res = await fetch("/api/smart-source/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "The search failed.");
      setSearch(data.search);
      setCandidates(data.candidates || []);
      setPage(0);
      setSelected(new Set());
      setActiveId((data.candidates || [])[0]?.id || null);
      setStep("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The search failed.");
      setStep("input");
    } finally {
      if (statusTimer.current) clearInterval(statusTimer.current);
    }
  }

  function reset() {
    setStep("input");
    setSearch(null);
    setCandidates([]);
    setError(null);
    setNotice(null);
    setExpanded(null);
    setSelected(new Set());
    setJdFile(null);
    setJdExtractError(null);
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => (prev.size === candidates.length ? new Set() : new Set(candidates.map((c) => c.id))));
  }

  function selectedOrAllCandidates(): Candidate[] {
    if (selected.size > 0) return candidates.filter((c) => selected.has(c.id));
    return candidates;
  }

  async function loadProjectSources() {
    // Requisitions (ATS-linking, optional) and Smart Source projects
    // (standalone, always available) are fetched independently -- an org
    // without Talent.ai access will 403 on the first and that's fine, the
    // project picker should still load normally.
    const [reqResult, listResult] = await Promise.allSettled([
      fetch("/api/talent-ai/requisitions").then((r) => (r.ok ? r.json() : { requisitions: [] })),
      fetch("/api/smart-source/projects").then((r) => (r.ok ? r.json() : { projects: [] })),
    ]);
    const reqData = reqResult.status === "fulfilled" ? reqResult.value : { requisitions: [] };
    const listData = listResult.status === "fulfilled" ? listResult.value : { projects: [] };
    setRequisitions((reqData.requisitions || []).map((r: { id: string; title: string }) => ({ id: r.id, title: r.title })));
    setLists((listData.projects || []).map((l: { id: string; name: string }) => ({ id: l.id, name: l.name })));
    setSourcesLoaded(true);
  }

  function openAddToProject(target?: Candidate | Candidate[]) {
    setShowExport(false);
    setShowEmail(false);
    if (target) {
      setCandidateForProject(Array.isArray(target) ? target : [target]);
    } else {
      setCandidateForProject(null);
    }
    setShowAddToProject(true);
    if (!sourcesLoaded) loadProjectSources();
  }

  async function openProjectsPanel() {
    setError(null);
    setShowProjectsPanel(true);
    setActiveProjectId(null);
    setActiveProjectName("");
    setActiveProjectCandidates([]);
    setProjectsError(null);
    setProjectStatusFilter("All");
    setProjectSearchQuery("");
    setEditingCommentId(null);
    setProjectsLoading(true);
    try {
      const res = await fetch("/api/smart-source/projects");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load your projects.");
      setProjectsList(data.projects || []);
    } catch (err) {
      setProjectsError(err instanceof Error ? err.message : "Could not load your projects.");
    } finally {
      setProjectsLoading(false);
    }
  }

  function closeProjectsPanel() {
    setShowProjectsPanel(false);
  }

  async function openProjectDetail(id: string, name: string) {
    setError(null);
    setActiveProjectId(id);
    setActiveProjectName(name);
    setProjectStatusFilter("All");
    setProjectSearchQuery("");
    setEditingCommentId(null);
    setProjectExpanded(null);
    setProjectsError(null);
    setProjectDetailLoading(true);
    try {
      const res = await fetch(`/api/smart-source/projects/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load this project.");
      setActiveProjectCandidates(data.candidates || []);
    } catch (err) {
      setProjectsError(err instanceof Error ? err.message : "Could not load this project.");
    } finally {
      setProjectDetailLoading(false);
    }
  }

  async function updateCandidateStatus(candidateId: string, status: string) {
    if (!activeProjectId) return;
    setActiveProjectCandidates((prev) =>
      prev.map((c) => (c.id === candidateId ? { ...c, project_status: status } : c))
    );
    try {
      const res = await fetch(`/api/smart-source/projects/${activeProjectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update status");
      }
    } catch (err) {
      console.error("Could not update candidate status:", err);
    }
  }

  function startEditingComment(c: Candidate) {
    setEditingCommentId(c.id);
    setCommentDraft(c.project_comments || "");
  }

  function cancelEditingComment() {
    setEditingCommentId(null);
    setCommentDraft("");
  }

  async function saveCandidateComment(candidateId: string) {
    if (!activeProjectId) return;
    const finalComment = commentDraft.trim();
    setCommentSaving(true);
    setActiveProjectCandidates((prev) =>
      prev.map((c) => (c.id === candidateId ? { ...c, project_comments: finalComment } : c))
    );
    setEditingCommentId(null);
    try {
      await fetch(`/api/smart-source/projects/${activeProjectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, comments: finalComment }),
      });
    } catch (err) {
      console.error("Could not save comment:", err);
    } finally {
      setCommentSaving(false);
    }
  }

  function exportProjectCsv() {
    if (!activeProjectCandidates.length) return;
    const headers = [
      "Name",
      "Score",
      "Current Role",
      "Company",
      "Location",
      "Experience Years",
      "Pipeline Status",
      "Recruiter Comments",
      "LinkedIn URL",
    ];
    const rows = activeProjectCandidates.map((c) => [
      csvEscape(c.name || ""),
      csvEscape(c.match_score ?? ""),
      csvEscape(c.designation || ""),
      csvEscape(c.company || ""),
      csvEscape(c.location || ""),
      csvEscape(c.experience_years ?? ""),
      csvEscape(c.project_status || "CV Screened"),
      csvEscape(c.project_comments || ""),
      csvEscape(c.profile_url || ""),
    ]);
    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const fileName = `${(activeProjectName || "project").replace(/[^a-z0-9]/gi, "_")}_candidates.csv`;
    downloadBlob(csvContent, fileName, "text/csv;charset=utf-8");
  }

  async function removeFromActiveProject(candidateId: string) {
    if (!activeProjectId) return;
    setActiveProjectCandidates((prev) => prev.filter((c) => c.id !== candidateId));
    setProjectsList((prev) =>
      prev.map((p) => (p.id === activeProjectId ? { ...p, candidateCount: Math.max(0, p.candidateCount - 1) } : p))
    );
    try {
      await fetch(`/api/smart-source/projects/${activeProjectId}?candidateId=${encodeURIComponent(candidateId)}`, {
        method: "DELETE",
      });
    } catch {
      // best-effort -- if this fails the candidate reappears on next open
    }
  }

  async function deleteActiveProject() {
    if (!activeProjectId) return;
    if (!window.confirm(`Delete project "${activeProjectName}"? This will not delete the candidates from searches.`)) return;
    const toDelete = activeProjectId;
    setActiveProjectId(null);
    setProjectsList((prev) => prev.filter((p) => p.id !== toDelete));
    setLists((prev) => prev.filter((l) => l.id !== toDelete));
    try {
      await fetch(`/api/smart-source/projects/${toDelete}`, { method: "DELETE" });
    } catch {
      // best-effort
    }
  }

  function openRenameModal(id: string, currentName: string) {
    setRenamingProject({ id, name: currentName });
    setRenameValue(currentName);
  }

  async function submitRenameProject() {
    if (!renamingProject || !renameValue.trim()) return;
    const newName = renameValue.trim();
    const id = renamingProject.id;
    setRenamingBusy(true);
    try {
      const res = await fetch(`/api/smart-source/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not rename the project.");

      setProjectsList((prev) => prev.map((p) => (p.id === id ? { ...p, name: newName } : p)));
      setLists((prev) => prev.map((l) => (l.id === id ? { ...l, name: newName } : l)));
      if (activeProjectId === id) {
        setActiveProjectName(newName);
      }
      setNotice(`Project renamed to "${newName}".`);
      setRenamingProject(null);
    } catch (err) {
      setProjectsError(err instanceof Error ? err.message : "Could not rename the project.");
    } finally {
      setRenamingBusy(false);
    }
  }

  async function submitAddToProject() {
    const picked = candidateForProject && candidateForProject.length > 0 ? candidateForProject : selectedOrAllCandidates();
    if (!picked.length) {
      setError("Select at least one candidate first.");
      return;
    }
    if (!pickedRequisition && !pickedList && !newListName.trim()) {
      setError("Choose a requisition or a project to save these candidates to.");
      return;
    }
    setBusyAction(true);
    setError(null);
    try {
      const res = await fetch("/api/smart-source/add-to-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidates: picked.map((c) => ({
            id: c.id,
            profile_url: c.profile_url,
            name: c.name,
            designation: c.designation,
            company: c.company,
            location: c.location,
            experience_years: c.experience_years,
            qualification: c.qualification,
            match_score: c.match_score,
            internal_person_id: c.internal_person_id,
          })),
          requisitionId: pickedRequisition || undefined,
          listId: pickedList || undefined,
          newListName: !pickedList ? newListName.trim() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok && res.status !== 207) throw new Error(data.error || "Could not add these candidates.");
      const failed = (data.results || []).filter((r: { ok: boolean }) => !r.ok).length;
      const destination = pickedRequisition && (pickedList || newListName)
        ? "the requisition and project"
        : pickedRequisition
        ? "the requisition"
        : "the project";

      const targetName =
        data.projectName ||
        newListName.trim() ||
        lists.find((l) => l.id === pickedList)?.name ||
        "Project";

      const firstError = (data.results || []).find((r: { ok: boolean; error?: string }) => !r.ok)?.error;

      setNotice(
        failed
          ? `Added ${picked.length - failed} of ${picked.length} candidates (${failed} failed${firstError ? `: ${firstError}` : ""}).`
          : `Added ${picked.length} candidate${picked.length === 1 ? "" : "s"} to ${destination} "${targetName}".`
      );
      setShowAddToProject(false);
      setCandidateForProject(null);
      setPickedRequisition("");
      setPickedList("");
      setNewListName("");
      loadProjectSources();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add these candidates.");
    } finally {
      setBusyAction(false);
    }
  }

  function exportCsv() {
    const rows = selectedOrAllCandidates();
    const header = EXPORT_COLUMNS.map((c) => csvEscape(c.label)).join(",");
    const body = rows
      .map((r) => EXPORT_COLUMNS.map((c) => csvEscape(r[c.key])).join(","))
      .join("\n");
    downloadBlob(`${header}\n${body}`, "smart-source-candidates.csv", "text/csv;charset=utf-8");
    setShowExport(false);
  }

  async function exportExcel() {
    const XLSX = await import("xlsx");
    const rows = selectedOrAllCandidates();
    const data = rows.map((r) => Object.fromEntries(EXPORT_COLUMNS.map((c) => [c.label, r[c.key] ?? ""])));
    const sheet = XLSX.utils.json_to_sheet(data);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Candidates");
    const buf = XLSX.write(book, { type: "array", bookType: "xlsx" });
    downloadBlob(buf, "smart-source-candidates.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    setShowExport(false);
  }

  async function exportPdf() {
    const { jsPDF } = await import("jspdf");
    const rows = selectedOrAllCandidates();
    const doc = new jsPDF();
    let y = 14;
    doc.setFontSize(14);
    doc.text("Smart Source.ai candidates", 14, y);
    y += 8;
    doc.setFontSize(9);
    for (const r of rows) {
      if (y > 280) {
        doc.addPage();
        y = 14;
      }
      const line = `${r.name || "—"}  |  Score ${r.match_score ?? "—"}  |  ${r.company || "—"}  |  ${r.location || "—"}  |  ${r.profile_url}`;
      doc.text(line, 14, y, { maxWidth: 180 });
      y += 7;
    }
    doc.save("smart-source-candidates.pdf");
    setShowExport(false);
  }

  async function submitEmail() {
    const picked = selectedOrAllCandidates();
    if (!emailTo.trim()) {
      setError("Add a recipient email address.");
      return;
    }
    if (!picked.length) {
      setError("Select at least one candidate first.");
      return;
    }
    setBusyAction(true);
    setError(null);
    try {
      const res = await fetch("/api/smart-source/share-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: emailTo.trim(),
          roleTitle: search?.extracted_role || "",
          candidates: picked.map((c) => ({
            name: c.name,
            designation: c.designation,
            company: c.company,
            location: c.location,
            match_score: c.match_score,
            profile_url: c.profile_url,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not send the email.");
      setNotice(`Sent ${picked.length} candidate(s) to ${emailTo.trim()}.`);
      setShowEmail(false);
      setEmailTo("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the email.");
    } finally {
      setBusyAction(false);
    }
  }

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { All: activeProjectCandidates.length };
    for (const status of PIPELINE_STATUSES) {
      counts[status] = 0;
    }
    for (const c of activeProjectCandidates) {
      const st = c.project_status || "CV Screened";
      counts[st] = (counts[st] || 0) + 1;
    }
    return counts;
  }, [activeProjectCandidates]);

  const filteredProjectCandidates = useMemo(() => {
    return activeProjectCandidates.filter((c) => {
      if (projectStatusFilter !== "All") {
        const st = c.project_status || "CV Screened";
        if (st !== projectStatusFilter) return false;
      }
      if (projectSearchQuery.trim()) {
        const q = projectSearchQuery.trim().toLowerCase();
        const matchesName = (c.name || "").toLowerCase().includes(q);
        const matchesDesignation = (c.designation || "").toLowerCase().includes(q);
        const matchesCompany = (c.company || "").toLowerCase().includes(q);
        const matchesLocation = (c.location || "").toLowerCase().includes(q);
        const matchesComments = (c.project_comments || "").toLowerCase().includes(q);
        if (!matchesName && !matchesDesignation && !matchesCompany && !matchesLocation && !matchesComments) {
          return false;
        }
      }
      return true;
    });
  }, [activeProjectCandidates, projectStatusFilter, projectSearchQuery]);

  const pageCount = Math.max(1, Math.ceil(candidates.length / PAGE_SIZE));
  const pageRows = candidates.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const activeCandidate = candidates.find((c) => c.id === activeId) || candidates[0] || null;

  return (
    <div className="max-w-6xl">
      <div className="flex items-start justify-between gap-3 mb-5">
        <p className="text-[13px] text-ink-2 max-w-2xl">
          Drop in a job description, describe who you need in your own words, or set skills manually.
          The AI reads it, builds a search, and finds matching candidates.
        </p>
        <button
          onClick={showProjectsPanel ? closeProjectsPanel : openProjectsPanel}
          className="shrink-0 border border-border text-[12.5px] font-bold px-3 py-1.5 rounded-sm bg-surface inline-flex items-center gap-1.5"
        >
          <Icon name="grid" className="w-3.5 h-3.5" />
          {showProjectsPanel ? "Back to search" : "My Projects"}
        </button>
      </div>

      {error && !showProjectsPanel && (
        <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2 mb-4">{error}</div>
      )}
      {notice && (
        <div className="bg-good-wash text-good-text text-[12.5px] rounded-sm px-3.5 py-2.5 mb-4">
          {notice}
        </div>
      )}
      {showProjectsPanel && projectsError && (
        <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2 mb-4">{projectsError}</div>
      )}

      {showProjectsPanel && (
        <div className="flex flex-col gap-4">
          {!activeProjectId ? (
            projectsLoading ? (
              <div className="text-[13px] text-ink-muted py-10 text-center">Loading your projects…</div>
            ) : projectsList.length === 0 ? (
              <div className="text-[13px] text-ink-muted py-10 text-center">
                No saved projects yet. Save candidates from a search using &ldquo;Add to Project&rdquo;.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {projectsList.map((p) => (
                  <div
                    key={p.id}
                    className="border border-border rounded-md bg-surface p-3.5 shadow-soft-sm hover:border-brand transition-colors flex flex-col justify-between"
                  >
                    <button
                      onClick={() => openProjectDetail(p.id, p.name)}
                      className="text-left w-full cursor-pointer"
                    >
                      <div className="font-bold text-ink text-[13.5px] mb-1">{p.name}</div>
                      <div className="text-[12px] text-ink-muted">
                        {p.candidateCount} candidate{p.candidateCount === 1 ? "" : "s"}
                      </div>
                      <div className="text-[11px] text-ink-muted mt-1">
                        Saved {new Date(p.created_at).toLocaleDateString()}
                      </div>
                    </button>
                    <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-border">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openRenameModal(p.id, p.name);
                        }}
                        className="text-[11.5px] font-bold text-brand hover:underline"
                      >
                        Rename
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="flex flex-col gap-4">
              {/* Workday Context Bar & Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setActiveProjectId(null)}
                    className="text-[12.5px] font-bold text-ink-muted hover:text-ink inline-flex items-center gap-1 transition-colors"
                  >
                    <Icon name="chevronLeft" className="w-3.5 h-3.5" /> All projects
                  </button>
                  <span className="text-ink-muted">/</span>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-ink">{activeProjectName}</h2>
                    <span className="text-[11.5px] font-semibold bg-page text-ink-muted px-2 py-0.5 rounded-full border border-border">
                      {activeProjectCandidates.length} candidate{activeProjectCandidates.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={exportProjectCsv}
                    disabled={activeProjectCandidates.length === 0}
                    className="border border-border text-[12px] font-bold px-2.5 py-1.5 rounded-sm bg-surface hover:bg-page transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
                    title="Export candidate pipeline as CSV"
                  >
                    <Icon name="download" className="w-3.5 h-3.5 text-ink-muted" />
                    <span>Export CSV</span>
                  </button>
                  <button
                    onClick={() => openRenameModal(activeProjectId, activeProjectName)}
                    className="border border-border text-[12px] font-bold px-2.5 py-1.5 rounded-sm bg-surface hover:bg-page transition-colors inline-flex items-center gap-1.5 text-ink"
                  >
                    <Icon name="edit" className="w-3.5 h-3.5 text-ink-muted" />
                    <span>Rename</span>
                  </button>
                  <button
                    onClick={deleteActiveProject}
                    className="border border-rose-200 dark:border-rose-900 text-[12px] font-bold px-2.5 py-1.5 rounded-sm bg-surface hover:bg-rose-50 dark:hover:bg-rose-950/40 text-critical transition-colors inline-flex items-center gap-1.5"
                  >
                    <Icon name="trash" className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>

              {/* Workday Pipeline Stages Metric Strip / Filter Ribbon */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin">
                <button
                  onClick={() => setProjectStatusFilter("All")}
                  className={`shrink-0 text-[12px] font-bold px-2.5 py-1 rounded-full border transition-all inline-flex items-center gap-1.5 ${
                    projectStatusFilter === "All"
                      ? "bg-brand text-white border-brand shadow-soft-sm"
                      : "bg-surface text-ink-2 border-border hover:border-brand/40"
                  }`}
                >
                  <span>All Stages</span>
                  <span
                    className={`text-[10.5px] px-1.5 py-0.2 rounded-full ${
                      projectStatusFilter === "All"
                        ? "bg-white/20 text-white font-bold"
                        : "bg-page text-ink-muted"
                    }`}
                  >
                    {activeProjectCandidates.length}
                  </span>
                </button>

                {PIPELINE_STATUSES.map((status) => {
                  const count = stageCounts[status] || 0;
                  const isSelected = projectStatusFilter === status;
                  return (
                    <button
                      key={status}
                      onClick={() => setProjectStatusFilter(isSelected ? "All" : status)}
                      className={`shrink-0 text-[11.5px] font-semibold px-2.5 py-1 rounded-full border transition-all inline-flex items-center gap-1.5 ${
                        isSelected
                          ? "bg-ink text-surface border-ink shadow-soft-sm font-bold"
                          : count > 0
                          ? "bg-surface text-ink border-border hover:border-ink-muted"
                          : "bg-page/60 text-ink-muted border-transparent hover:border-border"
                      }`}
                    >
                      <span>{status}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                          isSelected
                            ? "bg-surface/25 text-surface font-bold"
                            : count > 0
                            ? "bg-brand-wash text-brand font-bold"
                            : "bg-border/60 text-ink-muted"
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Quick Search & Filter Status */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-surface p-2.5 rounded-md border border-border">
                <div className="relative flex-1 min-w-[240px]">
                  <Icon
                    name="search"
                    className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none"
                  />
                  <input
                    type="text"
                    placeholder="Search candidate name, role, company, location, or recruiter comments…"
                    value={projectSearchQuery}
                    onChange={(e) => setProjectSearchQuery(e.target.value)}
                    className="w-full text-[12.5px] bg-page border border-border rounded-sm pl-8 pr-7 py-1.5 text-ink placeholder:text-ink-muted focus:outline-none focus:border-brand"
                  />
                  {projectSearchQuery && (
                    <button
                      onClick={() => setProjectSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink text-[11px]"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="text-[12px] text-ink-muted flex items-center gap-2">
                  <span>
                    Showing <strong className="text-ink">{filteredProjectCandidates.length}</strong> of{" "}
                    {activeProjectCandidates.length} candidates
                  </span>
                  {(projectStatusFilter !== "All" || projectSearchQuery) && (
                    <button
                      onClick={() => {
                        setProjectStatusFilter("All");
                        setProjectSearchQuery("");
                      }}
                      className="text-[11.5px] font-bold text-brand hover:underline ml-1"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              </div>

              {/* Candidate Pipeline Table */}
              {projectDetailLoading ? (
                <div className="text-[13px] text-ink-muted py-12 text-center flex flex-col items-center gap-2">
                  <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                  <span>Loading candidate pipeline…</span>
                </div>
              ) : activeProjectCandidates.length === 0 ? (
                <div className="text-[13px] text-ink-muted py-12 text-center border border-dashed border-border rounded-md bg-surface">
                  No candidates in this project yet. Find candidates via search and click &ldquo;Add to Project&rdquo;.
                </div>
              ) : filteredProjectCandidates.length === 0 ? (
                <div className="text-[13px] text-ink-muted py-10 text-center border border-border rounded-md bg-surface flex flex-col items-center gap-2">
                  <p>No candidates match your current stage or search filters.</p>
                  <button
                    onClick={() => {
                      setProjectStatusFilter("All");
                      setProjectSearchQuery("");
                    }}
                    className="text-[12px] font-bold text-brand hover:underline"
                  >
                    Reset filters
                  </button>
                </div>
              ) : (
                <div className="border border-border rounded-md bg-surface shadow-soft-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[980px]">
                      <thead>
                        <tr className="bg-page border-b border-border text-[11.5px] font-bold text-ink-muted uppercase tracking-wider">
                          <th className="py-2.5 px-3.5 w-[30%]">Candidate & Role</th>
                          <th className="py-2.5 px-3 w-[16%]">Location & Exp</th>
                          <th className="py-2.5 px-3 w-[8%] text-center">Score</th>
                          <th className="py-2.5 px-3 w-[18%]">Pipeline Status</th>
                          <th className="py-2.5 px-3 w-[20%]">Recruiter Comments</th>
                          <th className="py-2.5 px-3 w-[8%] text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border text-[12.5px]">
                        {filteredProjectCandidates.map((c) => {
                          const isEditingComment = editingCommentId === c.id;
                          const currentStatus = c.project_status || "CV Screened";
                          const isExpanded = projectExpanded === c.id;

                          return (
                            <Fragment key={c.id}>
                              <tr className="hover:bg-page/50 transition-colors group">
                                {/* Candidate & Role */}
                                <td className="py-3 px-3.5 align-top">
                                  <div className="flex items-start gap-2.5">
                                    <div className="w-8 h-8 rounded-full bg-brand/10 text-brand font-bold text-[12px] flex items-center justify-center shrink-0 border border-brand/20">
                                      {(c.name || "C").slice(0, 2).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-bold text-ink text-[13.5px]">
                                          {c.name || "Unnamed Candidate"}
                                        </span>
                                        {c.profile_url && (
                                          <a
                                            href={c.profile_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-brand hover:text-brand-hover inline-flex items-center"
                                            title="Open LinkedIn / profile in new tab"
                                          >
                                            <Icon name="externalLink" className="w-3.5 h-3.5" />
                                          </a>
                                        )}
                                      </div>
                                      <div className="text-[12px] text-ink-2 font-medium truncate max-w-sm">
                                        {c.designation || "—"}
                                      </div>
                                      {c.company && (
                                        <div className="text-[11.5px] text-ink-muted truncate max-w-sm">
                                          at <span className="text-ink">{c.company}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>

                                {/* Location & Exp */}
                                <td className="py-3 px-3 align-top text-ink-2">
                                  <div className="flex flex-col gap-0.5">
                                    <div className="truncate max-w-[170px]" title={c.location || ""}>
                                      {c.location || "—"}
                                    </div>
                                    <div className="text-[11.5px] text-ink-muted">
                                      {c.experience_years != null ? `${c.experience_years} yrs exp` : "—"}
                                    </div>
                                  </div>
                                </td>

                                {/* Score */}
                                <td className="py-3 px-3 align-top text-center">
                                  <span
                                    className={`inline-block text-[11.5px] font-bold px-2 py-0.5 rounded-full ${scoreClass(
                                      c.match_score
                                    )}`}
                                  >
                                    {c.match_score ?? "—"}
                                  </span>
                                </td>

                                {/* Pipeline Status Dropdown */}
                                <td className="py-3 px-3 align-top">
                                  <div className="flex flex-col gap-1">
                                    <div className="relative inline-block">
                                      <select
                                        value={currentStatus}
                                        onChange={(e) => updateCandidateStatus(c.id, e.target.value)}
                                        className={`text-[11.5px] font-bold py-1 px-2.5 pr-6 rounded-md border appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand ${statusBadgeClass(
                                          currentStatus
                                        )}`}
                                      >
                                        {PIPELINE_STATUSES.map((st) => (
                                          <option
                                            key={st}
                                            value={st}
                                            className="bg-surface text-ink font-medium"
                                          >
                                            {st}
                                          </option>
                                        ))}
                                      </select>
                                      <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-current opacity-70">
                                        <Icon name="chevronDown" className="w-3 h-3" />
                                      </div>
                                    </div>
                                    {c.added_at && (
                                      <span className="text-[10.5px] text-ink-muted">
                                        Added {new Date(c.added_at).toLocaleDateString()}
                                      </span>
                                    )}
                                  </div>
                                </td>

                                {/* Recruiter Comments */}
                                <td className="py-3 px-3 align-top">
                                  {isEditingComment ? (
                                    <div className="flex flex-col gap-1.5 bg-page p-2 rounded border border-brand/40 shadow-soft-sm">
                                      <textarea
                                        rows={3}
                                        value={commentDraft}
                                        onChange={(e) => setCommentDraft(e.target.value)}
                                        placeholder="Add screening feedback, interview notes, or candidate status details…"
                                        className="w-full text-[12px] bg-surface text-ink p-1.5 rounded border border-border focus:outline-none focus:border-brand resize-y"
                                        autoFocus
                                      />
                                      <div className="flex items-center justify-end gap-1.5">
                                        <button
                                          type="button"
                                          onClick={cancelEditingComment}
                                          className="text-[11px] font-bold px-2 py-0.5 rounded text-ink-muted hover:text-ink hover:bg-surface border border-transparent"
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => saveCandidateComment(c.id)}
                                          disabled={commentSaving}
                                          className="text-[11px] font-bold px-2.5 py-0.5 rounded bg-brand text-white hover:bg-brand-hover shadow-soft-sm disabled:opacity-50"
                                        >
                                          {commentSaving ? "Saving…" : "Save Comment"}
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div
                                      onClick={() => startEditingComment(c)}
                                      className="group/comment cursor-pointer rounded p-1 -m-1 hover:bg-page hover:border hover:border-border transition-all flex flex-col gap-0.5"
                                      title="Click to edit recruiter comment"
                                    >
                                      {c.project_comments ? (
                                        <p className="text-[12px] text-ink line-clamp-3 whitespace-pre-wrap">
                                          {c.project_comments}
                                        </p>
                                      ) : (
                                        <span className="text-[11.5px] text-ink-muted italic group-hover/comment:text-brand flex items-center gap-1">
                                          <Icon name="edit" className="w-3 h-3 opacity-60" /> Add comment…
                                        </span>
                                      )}
                                      {c.project_comments && (
                                        <span className="text-[10.5px] text-brand opacity-0 group-hover/comment:opacity-100 transition-opacity font-bold">
                                          Edit note
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </td>

                                {/* Actions */}
                                <td className="py-3 px-3 align-top text-right">
                                  <div className="flex flex-col items-end gap-1.5">
                                    <button
                                      onClick={() =>
                                        setProjectExpanded((prev) => (prev === c.id ? null : c.id))
                                      }
                                      className={`text-[11.5px] font-bold px-2 py-1 rounded transition-colors inline-flex items-center gap-1 ${
                                        isExpanded
                                          ? "bg-brand/10 text-brand"
                                          : "text-ink-muted hover:text-ink hover:bg-page"
                                      }`}
                                      title="Toggle AI Fit Evaluation drawer"
                                    >
                                      <span>Fit</span>
                                      <Icon
                                        name={isExpanded ? "chevronUp" : "chevronDown"}
                                        className="w-3 h-3"
                                      />
                                    </button>
                                    <button
                                      onClick={() => removeFromActiveProject(c.id)}
                                      className="text-[11px] font-bold text-critical hover:underline opacity-80 hover:opacity-100"
                                      title="Remove candidate from this project"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </td>
                              </tr>

                              {/* Evaluation Panel Drawer */}
                              {isExpanded && (
                                <tr className="bg-page/70 border-b border-border">
                                  <td colSpan={6} className="p-3.5">
                                    <div className="bg-surface rounded-md border border-border p-3 shadow-soft-sm">
                                      <div className="flex items-center justify-between mb-2">
                                        <div className="text-[12px] font-bold text-ink flex items-center gap-1.5">
                                          <Icon name="sparkle" className="w-3.5 h-3.5 text-brand" />
                                          <span>AI Fit Evaluation for {c.name || "Candidate"}</span>
                                        </div>
                                        <button
                                          onClick={() => setProjectExpanded(null)}
                                          className="text-[11px] font-bold text-ink-muted hover:text-ink"
                                        >
                                          Close
                                        </button>
                                      </div>
                                      <EvaluationPanel c={c} />
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!showProjectsPanel && step === "input" && (
        <div className="flex flex-col gap-4">
          <div className="inline-flex bg-page rounded-sm p-1 self-start">
            {([
              { key: "jd", label: "Drop/browse JD" },
              { key: "describe", label: "Describe what you need" },
              { key: "manual", label: "Manual Source" },
            ] as { key: Mode; label: string }[]).map((t) => (
              <button
                key={t.key}
                onClick={() => setMode(t.key)}
                className={`text-[12.5px] font-bold px-3 py-1.5 rounded-sm transition-colors ${
                  mode === t.key ? "bg-surface text-ink shadow-soft-sm" : "text-ink-muted"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {mode === "jd" && (
            <div className="flex flex-col gap-3">
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setJdDragOver(true);
                }}
                onDragLeave={() => setJdDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setJdDragOver(false);
                  extractJdFile(e.dataTransfer.files?.[0]);
                }}
                className={`border-2 border-dashed rounded-md p-7 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors text-center ${
                  jdDragOver ? "border-brand bg-brand-wash" : "border-border bg-page hover:border-ink-muted hover:bg-surface"
                }`}
              >
                <input
                  type="file"
                  accept=".pdf,.docx,.txt"
                  onChange={(e) => extractJdFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <Icon name="upload" className="w-5 h-5 text-ink-muted" />
                {jdExtracting ? (
                  <div className="text-[13px] font-bold text-ink">Reading {jdFile?.name}…</div>
                ) : jdFile ? (
                  <div className="flex items-center gap-2">
                    <Icon name="check" className="w-4 h-4 text-good" />
                    <span className="text-[13px] font-bold text-brand">{jdFile.name}</span>
                    <span className="text-[11.5px] text-ink-muted underline ml-1">Change file</span>
                  </div>
                ) : (
                  <div className="text-[13px] font-bold text-ink">Drop/browse JD</div>
                )}
              </label>
              {jdExtractError && <div className="text-[12px] text-critical">{jdExtractError}</div>}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setJdInputMode((m) => (m === "paste" ? "file" : "paste"))}
                  className="text-[11.5px] text-ink-muted hover:text-ink underline"
                >
                  {jdInputMode === "paste" ? "Hide text box" : "or paste JD text"}
                </button>
              </div>

              {jdInputMode === "paste" && (
                <textarea
                  className="input min-h-[140px]"
                  placeholder="Paste the full JD text here…"
                  value={jdText}
                  onChange={(e) => setJdText(e.target.value)}
                />
              )}

              {jdInputMode === "file" && jdText && !jdExtracting && (
                <Field label="Extracted text (edit if needed)">
                  <textarea
                    className="input min-h-[140px]"
                    value={jdText}
                    onChange={(e) => setJdText(e.target.value)}
                  />
                </Field>
              )}
            </div>
          )}

          {mode === "describe" && (
            <Field label="Describe who you're looking for">
              <textarea
                className="input min-h-[140px]"
                placeholder='e.g. "Senior sales manager in Mexico with experience in feed additives", or search for a specific person like "Riddhi Ramesh from Google"'
                value={describeText}
                onChange={(e) => setDescribeText(e.target.value)}
              />
            </Field>
          )}

          {mode === "manual" && (
            <div className="grid grid-cols-2 gap-3.5">
              <Field label="Role title">
                <input className="input" value={manualRole} onChange={(e) => setManualRole(e.target.value)} placeholder="e.g. Sales Manager" />
              </Field>
              <Field label="Company (optional)">
                <input className="input" value={manualCompany} onChange={(e) => setManualCompany(e.target.value)} placeholder="e.g. Cargill" />
              </Field>
              <Field label="Location (optional)">
                <input className="input" value={manualLocation} onChange={(e) => setManualLocation(e.target.value)} placeholder="e.g. Mexico City" />
              </Field>
              <Field label="Minimum experience (years, optional)">
                <input className="input" type="number" min={0} value={manualExperience} onChange={(e) => setManualExperience(e.target.value)} placeholder="e.g. 6" />
              </Field>
              <div className="col-span-2">
                <Field label="Skills (comma-separated)">
                  <input className="input" value={manualSkills} onChange={(e) => setManualSkills(e.target.value)} placeholder="e.g. feed additives, acidifiers, B2B sales" />
                </Field>
              </div>
            </div>
          )}

          <button
            onClick={handleSearch}
            disabled={jdExtracting}
            className="bg-brand text-white text-[13px] font-bold px-4 py-2.5 rounded-sm self-start shadow-soft-sm inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Icon name="search" className="w-4 h-4" />
            {jdExtracting ? "Reading file…" : "Source candidates"}
          </button>
        </div>
      )}

      {!showProjectsPanel && step === "running" && (
        <div className="flex flex-col items-center justify-center text-center gap-3 py-14">
          <div className="w-8 h-8 rounded-full border-2 border-border border-t-brand animate-spin" />
          <div className="text-[13px] font-bold">{STATUS_STEPS[statusIdx]}…</div>
          <div className="flex items-center gap-1.5">
            {STATUS_STEPS.map((s, i) => (
              <span
                key={s}
                className={`w-1.5 h-1.5 rounded-full ${i <= statusIdx ? "bg-brand" : "bg-border"}`}
              />
            ))}
          </div>
          <div className="text-[12px] text-ink-muted">This can take up to a minute.</div>
        </div>
      )}

      {!showProjectsPanel && step === "results" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {search?.extracted_role && (
                <span className="inline-flex items-center gap-1.5 bg-brand-wash text-brand-dark rounded-full px-3 py-1 text-[12px] font-bold">
                  <Icon name="briefcase" className="w-3.5 h-3.5" />
                  {search.extracted_role}
                </span>
              )}
              {search?.extracted_location && (
                <span className="bg-page text-ink-2 rounded-full px-3 py-1 text-[12px] font-medium">
                  {search.extracted_location}
                </span>
              )}
              {(search?.extracted_skills || []).slice(0, 5).map((s) => (
                <span key={s} className="bg-page text-ink-2 rounded-full px-3 py-1 text-[12px] font-medium">
                  {s}
                </span>
              ))}
              <span className="text-[12px] text-ink-muted">
                {candidates.length} candidate{candidates.length === 1 ? "" : "s"} found
              </span>
            </div>
            <button onClick={reset} className="border border-border text-[12.5px] font-bold px-3 py-1.5 rounded-sm bg-surface">
              New search
            </button>
          </div>

          {candidates.length === 0 ? (
            <div className="border border-border rounded-md bg-surface p-10 text-center flex flex-col items-center gap-3 shadow-soft-sm">
              <div className="w-10 h-10 rounded-full bg-page flex items-center justify-center text-ink-muted mb-1">
                <Icon name="search" className="w-5 h-5" />
              </div>
              <div className="text-[14px] font-bold text-ink">No candidates found</div>
              <p className="text-[13px] text-ink-muted max-w-md">
                No matching public profiles were found for this query. Try adjusting the keywords, removing niche skill constraints, or broadening the location.
              </p>
              <button
                onClick={reset}
                className="mt-2 bg-brand text-white text-[12.5px] font-bold px-4 py-2 rounded-sm hover:opacity-90 transition-opacity"
              >
                Modify search criteria
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="inline-flex bg-page rounded-sm p-1 gap-0.5">
                  {VIEWS.map((v) => (
                    <button
                      key={v.key}
                      onClick={() => setView(v.key)}
                      title={v.label}
                      aria-label={v.label}
                      className={`p-1.5 rounded-xs transition-colors inline-flex items-center justify-center ${
                        view === v.key ? "bg-surface text-ink shadow-soft-sm" : "text-ink-muted hover:text-ink"
                      }`}
                    >
                      <Icon name={v.icon} className="w-3.5 h-3.5" />
                    </button>
                  ))}
                </div>

                <div className="relative flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-[12px] font-medium text-ink-2 mr-1">
                    <input type="checkbox" checked={selected.size === candidates.length} onChange={toggleSelectAll} />
                    {selected.size > 0 ? `${selected.size} selected` : "Select all"}
                  </label>

                  <button
                    onClick={() => {
                      setShowEmail(false);
                      setShowExport((v) => !v);
                    }}
                    className="border border-border text-[12px] font-bold px-3 py-1.5 rounded-sm bg-surface inline-flex items-center gap-1.5"
                  >
                    <Icon name="upload" className="w-3.5 h-3.5" />
                    Export
                  </button>
                  <button
                    onClick={() => {
                      setShowExport(false);
                      setShowEmail((v) => !v);
                    }}
                    className="border border-border text-[12px] font-bold px-3 py-1.5 rounded-sm bg-surface inline-flex items-center gap-1.5"
                  >
                    <Icon name="chat" className="w-3.5 h-3.5" />
                    Email
                  </button>

                  {showExport && (
                    <div className="absolute right-0 top-[calc(100%+6px)] z-20 bg-surface border border-border rounded-md shadow-soft p-2 flex flex-col gap-1 min-w-[160px]">
                      <button onClick={exportCsv} className="text-left text-[12.5px] font-medium px-2.5 py-1.5 rounded-sm hover:bg-page">CSV</button>
                      <button onClick={exportExcel} className="text-left text-[12.5px] font-medium px-2.5 py-1.5 rounded-sm hover:bg-page">Excel</button>
                      <button onClick={exportPdf} className="text-left text-[12.5px] font-medium px-2.5 py-1.5 rounded-sm hover:bg-page">PDF</button>
                    </div>
                  )}

                  {showEmail && (
                    <div className="absolute right-0 top-[calc(100%+6px)] z-20 bg-surface border border-border rounded-md shadow-soft p-3 flex flex-col gap-2 w-[280px]">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Email candidates</span>
                      <input
                        className="input"
                        type="email"
                        placeholder="recipient@company.com"
                        value={emailTo}
                        onChange={(e) => setEmailTo(e.target.value)}
                      />
                      <button
                        onClick={submitEmail}
                        disabled={busyAction}
                        className="bg-brand text-white text-[12.5px] font-bold px-3 py-1.5 rounded-sm disabled:opacity-50"
                      >
                        {busyAction ? "Sending…" : "Send"}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {view === "table" && (
                <TableView
                  rows={pageRows}
                  selected={selected}
                  onToggle={toggleSelected}
                  expanded={expanded}
                  setExpanded={setExpanded}
                  onAddToProject={openAddToProject}
                />
              )}
              {view === "compact" && (
                <CompactView
                  rows={pageRows}
                  selected={selected}
                  onToggle={toggleSelected}
                  expanded={expanded}
                  setExpanded={setExpanded}
                  onAddToProject={openAddToProject}
                />
              )}
              {view === "split" && (
                <SplitView
                  rows={pageRows}
                  selected={selected}
                  onToggle={toggleSelected}
                  activeId={activeCandidate?.id || null}
                  setActiveId={setActiveId}
                  active={activeCandidate}
                  onAddToProject={openAddToProject}
                />
              )}

              {pageCount > 1 && (
                <div className="flex items-center justify-center gap-3 text-[12.5px]">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="border border-border rounded-sm px-2.5 py-1 bg-surface disabled:opacity-40"
                  >
                    <Icon name="chevronLeft" className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-ink-muted font-medium">
                    Page {page + 1} of {pageCount}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                    disabled={page >= pageCount - 1}
                    className="border border-border rounded-sm px-2.5 py-1 bg-surface disabled:opacity-40"
                  >
                    <Icon name="chevronRight" className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {showAddToProject && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
          onClick={() => {
            if (!busyAction) {
              setShowAddToProject(false);
              setCandidateForProject(null);
            }
          }}
        >
          <div
            className="bg-surface border border-border rounded-lg shadow-soft-lg p-5 w-full max-w-md flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-ink text-[15px]">Add to Project</h3>
                <p className="text-[12px] text-ink-muted mt-0.5">
                  {(candidateForProject || selectedOrAllCandidates()).length === 1
                    ? (candidateForProject || selectedOrAllCandidates())[0]?.name || "1 candidate"
                    : `${(candidateForProject || selectedOrAllCandidates()).length} candidates selected`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddToProject(false);
                  setCandidateForProject(null);
                }}
                disabled={busyAction}
                className="text-ink-muted hover:text-ink text-[18px] leading-none"
              >
                &times;
              </button>
            </div>

            <label className="block">
              <span className="block text-[11.5px] font-bold mb-1">Link to a requisition (optional)</span>
              <select className="input" value={pickedRequisition} onChange={(e) => setPickedRequisition(e.target.value)}>
                <option value="">None</option>
                {requisitions.map((r) => (
                  <option key={r.id} value={r.id}>{r.title}</option>
                ))}
              </select>
              {!requisitions.length && (
                <span className="block text-[10.5px] text-ink-muted mt-1">
                  No requisitions available — you can still save these to a project below.
                </span>
              )}
            </label>

            <label className="block">
              <span className="block text-[11.5px] font-bold mb-1">Existing project</span>
              <select
                className="input"
                value={pickedList}
                onChange={(e) => {
                  setPickedList(e.target.value);
                  if (e.target.value) setNewListName("");
                }}
              >
                <option value="">None</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </label>

            {!pickedList && (
              <label className="block">
                <span className="block text-[11.5px] font-bold mb-1">Or new project name (optional)</span>
                <input
                  className="input"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder="e.g. Q3 Sales pipeline"
                />
              </label>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => {
                  setShowAddToProject(false);
                  setCandidateForProject(null);
                }}
                disabled={busyAction}
                className="text-[12.5px] font-bold text-ink-2 px-3 py-1.5 rounded-sm hover:bg-page transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitAddToProject}
                disabled={busyAction}
                className="bg-brand text-white text-[12.5px] font-bold px-4 py-1.5 rounded-sm shadow-soft-sm hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <Icon name="briefcase" className="w-3.5 h-3.5" />
                {busyAction
                  ? "Adding…"
                  : `Add ${(candidateForProject || selectedOrAllCandidates()).length} candidate(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {renamingProject && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
          onClick={() => {
            if (!renamingBusy) setRenamingProject(null);
          }}
        >
          <div
            className="bg-surface border border-border rounded-lg shadow-soft-lg p-5 w-full max-w-md flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-ink text-[15px]">Rename Project</h3>
              <button
                type="button"
                onClick={() => setRenamingProject(null)}
                disabled={renamingBusy}
                className="text-ink-muted hover:text-ink text-[18px] leading-none"
              >
                &times;
              </button>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-bold text-ink-2">Project Name</span>
              <input
                type="text"
                autoFocus
                className="input"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && renameValue.trim() && !renamingBusy) {
                    e.preventDefault();
                    submitRenameProject();
                  } else if (e.key === "Escape" && !renamingBusy) {
                    setRenamingProject(null);
                  }
                }}
                disabled={renamingBusy}
                placeholder="e.g. Senior Frontend Engineers"
              />
            </label>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setRenamingProject(null)}
                disabled={renamingBusy}
                className="text-[12.5px] font-bold text-ink-2 px-3 py-1.5 rounded-sm hover:bg-page transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitRenameProject}
                disabled={renamingBusy || !renameValue.trim()}
                className="bg-brand text-white text-[12.5px] font-bold px-4 py-1.5 rounded-sm shadow-soft-sm hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {renamingBusy ? "Saving…" : "Save Name"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .input {
          width: 100%;
          border: 1px solid #e1e0d9;
          border-radius: 7px;
          padding: 10px 12px;
          font-size: 13.5px;
          outline: none;
          background: #fcfcfb;
        }
        .input:focus {
          border-color: #2a78d6;
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-bold mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function LinksRow({
  c,
  expanded,
  setExpanded,
  onAddToProject,
}: {
  c: Candidate;
  expanded: string | null;
  setExpanded: (id: string | null) => void;
  onAddToProject?: (c: Candidate) => void;
}) {
  return (
    <div className="flex items-center gap-2.5 flex-wrap">
      <a href={c.profile_url} target="_blank" rel="noreferrer" className="text-brand-dark font-bold hover:underline">
        View profile
      </a>
      {c.internal_person_id ? (
        <a href={`/tools/talent-ai/candidates/${c.internal_person_id}`} className="text-brand-dark font-bold hover:underline inline-flex items-center gap-1">
          <Icon name="database" className="w-3 h-3" />
          View CV
        </a>
      ) : (
        <span className="text-ink-muted" title="Not found in your organization's database yet">
          View CV
        </span>
      )}
      <span className="text-ink-muted" title="SignalHire contact reveal — coming soon">
        Contact
      </span>
      <button onClick={() => setExpanded(expanded === c.id ? null : c.id)} className="text-ink-2 font-bold inline-flex items-center gap-0.5">
        Evaluation
        <Icon name={expanded === c.id ? "chevronUp" : "chevronDown"} className="w-3 h-3" />
      </button>
      {onAddToProject && (
        <button
          type="button"
          onClick={() => onAddToProject(c)}
          className="text-brand-dark font-bold hover:underline inline-flex items-center gap-1"
        >
          <Icon name="briefcase" className="w-3 h-3" />
          Add to project
        </button>
      )}
    </div>
  );
}

function EvaluationPanel({
  c,
  cols,
  onAddToProject,
}: {
  c: Candidate;
  cols?: number;
  onAddToProject?: (c: Candidate) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className={`grid grid-cols-${cols || 3} gap-4`}>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1">Summary</div>
          <p className="text-ink-2 leading-relaxed">{c.evaluation_summary || "No evaluation available."}</p>
          {c.already_in_pipeline && (
            <span className="inline-flex items-center gap-1 mt-2 bg-brand-wash text-brand-dark rounded-full px-2 py-0.5 text-[11px] font-bold">
              <Icon name="check" className="w-3 h-3" />
              Already in a pipeline
            </span>
          )}
        </div>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1">Strengths</div>
          {(c.evaluation_strengths || []).length ? (
            <ul className="list-disc list-inside text-ink-2 space-y-0.5">
              {(c.evaluation_strengths || []).map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-muted">None noted.</p>
          )}
        </div>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1">Unconfirmed</div>
          {(c.evaluation_gaps || []).length ? (
            <ul className="list-disc list-inside text-ink-2 space-y-0.5">
              {(c.evaluation_gaps || []).map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-muted">None noted.</p>
          )}
        </div>
      </div>
      {onAddToProject && (
        <div className="flex items-center justify-end pt-2.5 border-t border-border/80">
          <button
            type="button"
            onClick={() => onAddToProject(c)}
            className="border border-border bg-surface text-ink text-[12px] font-bold px-3 py-1.5 rounded-sm shadow-soft-sm hover:border-brand hover:text-brand inline-flex items-center gap-1.5 transition-colors"
          >
            <Icon name="briefcase" className="w-3.5 h-3.5 text-brand" />
            Add to project
          </button>
        </div>
      )}
    </div>
  );
}

function TableView({
  rows,
  selected,
  onToggle,
  expanded,
  setExpanded,
  onAddToProject,
}: {
  rows: Candidate[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  expanded: string | null;
  setExpanded: (id: string | null) => void;
  onAddToProject: (c: Candidate) => void;
}) {
  return (
    <div className="border border-border rounded-md bg-surface overflow-x-auto">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-wider text-ink-muted">
            <th className="px-3 py-2.5 w-8"></th>
            <th className="px-3 py-2.5">Name</th>
            <th className="px-3 py-2.5">Score</th>
            <th className="px-3 py-2.5">Company</th>
            <th className="px-3 py-2.5">Location</th>
            <th className="px-3 py-2.5">Experience</th>
            <th className="px-3 py-2.5">Compensation</th>
            <th className="px-3 py-2.5">Skills</th>
            <th className="px-3 py-2.5">Qualification</th>
            <th className="px-3 py-2.5">Links</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <Fragment key={c.id}>
              <tr className="border-b border-border last:border-0 hover:bg-page/50">
                <td className="px-3 py-2.5">
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => onToggle(c.id)} />
                </td>
                <td className="px-3 py-2.5 font-bold text-ink">{c.name || "—"}</td>
                <td className="px-3 py-2.5">
                  <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-full ${scoreClass(c.match_score)}`}>
                    {c.match_score ?? "—"}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-ink-2">{c.company || "—"}</td>
                <td className="px-3 py-2.5 text-ink-2">{c.location || "—"}</td>
                <td className="px-3 py-2.5 text-ink-2">{c.experience_years ?? "—"}</td>
                <td className="px-3 py-2.5 text-ink-2">{c.compensation || "—"}</td>
                <td className="px-3 py-2.5 text-ink-2 max-w-[180px] truncate" title={(c.skills || []).join(", ")}>
                  {(c.skills || []).slice(0, 3).join(", ") || "—"}
                </td>
                <td className="px-3 py-2.5 text-ink-2">{c.qualification || "—"}</td>
                <td className="px-3 py-2.5">
                  <LinksRow c={c} expanded={expanded} setExpanded={setExpanded} onAddToProject={onAddToProject} />
                </td>
              </tr>
              {expanded === c.id && (
                <tr className="border-b border-border bg-page/40">
                  <td colSpan={10} className="px-4 py-3.5">
                    <EvaluationPanel c={c} onAddToProject={onAddToProject} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompactView({
  rows,
  selected,
  onToggle,
  expanded,
  setExpanded,
  onAddToProject,
}: {
  rows: Candidate[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  expanded: string | null;
  setExpanded: (id: string | null) => void;
  onAddToProject: (c: Candidate) => void;
}) {
  return (
    <div className="border border-border rounded-md bg-surface divide-y divide-border">
      {rows.map((c) => (
        <div key={c.id}>
          <div className="flex items-center gap-3 px-3.5 py-2.5 text-[12.5px]">
            <input type="checkbox" checked={selected.has(c.id)} onChange={() => onToggle(c.id)} />
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${scoreClass(c.match_score)} shrink-0`}>{c.match_score ?? "—"}</span>
            <span className="font-bold text-ink w-[160px] truncate">{c.name || "—"}</span>
            <span className="text-ink-2 w-[140px] truncate">{c.company || "—"}</span>
            <span className="text-ink-2 w-[120px] truncate">{c.location || "—"}</span>
            <span className="text-ink-muted w-[80px] shrink-0">{c.experience_years != null ? `${c.experience_years} yrs` : "—"}</span>
            <span className="text-ink-2 flex-1 truncate">{(c.skills || []).slice(0, 3).join(", ") || "—"}</span>
            <div className="shrink-0">
              <LinksRow c={c} expanded={expanded} setExpanded={setExpanded} onAddToProject={onAddToProject} />
            </div>
          </div>
          {expanded === c.id && (
            <div className="px-4 py-3.5 bg-page/40">
              <EvaluationPanel c={c} onAddToProject={onAddToProject} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SplitView({
  rows,
  selected,
  onToggle,
  activeId,
  setActiveId,
  active,
  onAddToProject,
}: {
  rows: Candidate[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  activeId: string | null;
  setActiveId: (id: string) => void;
  active: Candidate | null;
  onAddToProject: (c: Candidate) => void;
}) {
  return (
    <div className="grid grid-cols-[280px_1fr] gap-3 border border-border rounded-md bg-surface overflow-hidden" style={{ minHeight: 360 }}>
      <div className="border-r border-border overflow-y-auto max-h-[520px] divide-y divide-border">
        {rows.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveId(c.id)}
            className={`w-full text-left px-3 py-2.5 flex items-center gap-2 ${activeId === c.id ? "bg-page" : "hover:bg-page/60"}`}
          >
            <input type="checkbox" checked={selected.has(c.id)} onChange={(e) => { e.stopPropagation(); onToggle(c.id); }} />
            <span className={`text-[10.5px] font-bold px-1.5 py-0.5 rounded-full ${scoreClass(c.match_score)} shrink-0`}>{c.match_score ?? "—"}</span>
            <div className="min-w-0">
              <div className="font-bold text-ink text-[12.5px] truncate">{c.name || "—"}</div>
              <div className="text-ink-muted text-[11px] truncate">{c.company || "—"}</div>
            </div>
          </button>
        ))}
      </div>
      <div className="p-4 overflow-y-auto max-h-[520px]">
        {active ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-bold text-ink text-[16px]">{active.name || "—"}</div>
                <div className="text-ink-2 text-[13px]">{active.designation || "—"}</div>
                <div className="text-ink-muted text-[12.5px]">{[active.company, active.location].filter(Boolean).join(" • ")}</div>
              </div>
              <span className={`text-[12px] font-bold px-2.5 py-1 rounded-full ${scoreClass(active.match_score)}`}>{active.match_score ?? "—"}</span>
            </div>
            <div className="flex gap-4 text-[12.5px] text-ink-2">
              <span>{active.experience_years != null ? `${active.experience_years} yrs experience` : "Experience unknown"}</span>
              <span>{active.compensation || "Compensation unknown"}</span>
              <span>{active.qualification || "Qualification unknown"}</span>
            </div>
            {(active.skills || []).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {(active.skills || []).map((s) => (
                  <span key={s} className="bg-page text-ink-2 rounded-full px-2 py-0.5 text-[11px]">{s}</span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2.5 flex-wrap pt-1 border-t border-border">
              <a href={active.profile_url} target="_blank" rel="noreferrer" className="text-brand-dark font-bold hover:underline">View profile</a>
              {active.internal_person_id ? (
                <a href={`/tools/talent-ai/candidates/${active.internal_person_id}`} className="text-brand-dark font-bold hover:underline inline-flex items-center gap-1">
                  <Icon name="database" className="w-3 h-3" />
                  View CV
                </a>
              ) : (
                <span className="text-ink-muted">View CV</span>
              )}
              <span className="text-ink-muted">Contact</span>
              <button
                type="button"
                onClick={() => onAddToProject(active)}
                className="text-brand-dark font-bold hover:underline inline-flex items-center gap-1"
              >
                <Icon name="briefcase" className="w-3 h-3" />
                Add to project
              </button>
            </div>
            <div className="pt-2 border-t border-border">
              <EvaluationPanel c={active} cols={1} onAddToProject={onAddToProject} />
            </div>
          </div>
        ) : (
          <div className="text-ink-muted text-[13px]">Select a candidate on the left.</div>
        )}
      </div>
    </div>
  );
}
