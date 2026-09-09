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
  extracted_criteria?: {
    target_companies?: string[] | null;
    exclude_companies?: string[] | null;
    lookalike_source?: string | null;
  } | null;
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
export type ProjectStageCounts = {
  screened: number;
  shortlisted: number;
  offered: number;
  joined: number;
  inactive: number;
};
export type ProjectSummary = {
  id: string;
  name: string;
  created_at: string;
  description?: string;
  start_date?: string | null;
  target_date?: string | null;
  target_hires?: number;
  status?: string;
  candidateCount: number;
  stageCounts?: ProjectStageCounts;
  completionPercentage?: number;
};

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
  const [searchSort, setSearchSort] = useState<"score_desc" | "score_asc" | "default">("score_desc");
  const [projectCandidateSort, setProjectCandidateSort] = useState<"score_desc" | "score_asc" | "default">("score_desc");
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

  const [projectTableSearch, setProjectTableSearch] = useState("");
  const [projectFilterTab, setProjectFilterTab] = useState<"All" | "Active" | "Due Soon" | "Completed" | "On Hold">("All");
  const [projectSortBy, setProjectSortBy] = useState<"updated" | "deadline" | "candidates" | "name">("updated");
  const [editingProjectModal, setEditingProjectModal] = useState<ProjectSummary | null>(null);
  const [editProjectForm, setEditProjectForm] = useState<{
    name: string;
    description: string;
    start_date: string;
    target_date: string;
    target_hires: number;
    status: string;
  }>({
    name: "",
    description: "",
    start_date: "",
    target_date: "",
    target_hires: 1,
    status: "Active",
  });
  const [editProjectSaving, setEditProjectSaving] = useState(false);

  const [manualTargetCompanies, setManualTargetCompanies] = useState("");
  const [manualExcludeCompanies, setManualExcludeCompanies] = useState("");
  const [describeTargetCompanies, setDescribeTargetCompanies] = useState("");
  const [describeExcludeCompanies, setDescribeExcludeCompanies] = useState("");
  const [showTargetCompaniesInDescribe, setShowTargetCompaniesInDescribe] = useState(false);

  const [lookalikeSource, setLookalikeSource] = useState<{
    name: string;
    designation?: string | null;
    company?: string | null;
  } | null>(null);

  const [whatsAppModalCandidate, setWhatsAppModalCandidate] = useState<Candidate | null>(null);
  const [whatsAppPhone, setWhatsAppPhone] = useState("");
  const [whatsAppMessage, setWhatsAppMessage] = useState("");
  const [whatsAppCopied, setWhatsAppCopied] = useState(false);

  const activeTargetCompanies = useMemo(() => {
    const list = search?.extracted_criteria?.target_companies;
    if (list && Array.isArray(list) && list.length > 0) return list;
    if (mode === "manual" && manualTargetCompanies.trim()) {
      return manualTargetCompanies.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
    }
    if (mode === "describe" && describeTargetCompanies.trim()) {
      return describeTargetCompanies.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
    }
    return [];
  }, [search, mode, manualTargetCompanies, describeTargetCompanies]);

  const projectsMetrics = useMemo(() => {
    let activeCount = 0;
    let totalCandidates = 0;
    let totalShortlisted = 0;
    let totalJoinedOrOffered = 0;

    for (const p of projectsList) {
      if (p.status === "Active") activeCount++;
      totalCandidates += p.candidateCount || 0;
      if (p.stageCounts) {
        totalShortlisted += p.stageCounts.shortlisted || 0;
        totalJoinedOrOffered += (p.stageCounts.offered || 0) + (p.stageCounts.joined || 0);
      }
    }

    return {
      activeCount,
      totalCandidates,
      totalShortlisted,
      totalJoinedOrOffered,
    };
  }, [projectsList]);

  const filteredProjects = useMemo(() => {
    return projectsList
      .filter((p) => {
        if (projectFilterTab === "Active" && p.status !== "Active") return false;
        if (projectFilterTab === "Completed" && p.status !== "Completed") return false;
        if (projectFilterTab === "On Hold" && p.status !== "On Hold") return false;
        if (projectFilterTab === "Due Soon") {
          if (!p.target_date || p.status === "Completed") return false;
          const now = new Date();
          now.setHours(0, 0, 0, 0);
          const target = new Date(p.target_date);
          target.setHours(0, 0, 0, 0);
          const diffDays = Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays > 5) return false;
        }

        if (projectTableSearch.trim()) {
          const q = projectTableSearch.toLowerCase();
          const matchName = p.name.toLowerCase().includes(q);
          const matchDesc = (p.description || "").toLowerCase().includes(q);
          if (!matchName && !matchDesc) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (projectSortBy === "name") {
          return a.name.localeCompare(b.name);
        }
        if (projectSortBy === "candidates") {
          return b.candidateCount - a.candidateCount;
        }
        if (projectSortBy === "deadline") {
          if (!a.target_date && !b.target_date) return 0;
          if (!a.target_date) return 1;
          if (!b.target_date) return -1;
          return new Date(a.target_date).getTime() - new Date(b.target_date).getTime();
        }
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [projectsList, projectFilterTab, projectTableSearch, projectSortBy]);

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

  function openWhatsAppModal(c: Candidate) {
    setWhatsAppModalCandidate(c);
    setWhatsAppPhone("");
    setWhatsAppCopied(false);

    const firstName = (c.name || "there").split(" ")[0];
    const roleHiring = search?.extracted_role || c.designation || "this opportunity";
    const currentRole = c.designation || "";
    const company = c.company ? `at ${c.company}` : "";
    const topSkills = (c.skills || []).slice(0, 2).join(" & ") || (c.evaluation_strengths || [])[0] || "your background";

    let msg = `Hi ${firstName}! I came across your impressive profile`;
    if (currentRole) {
      msg += ` as ${currentRole} ${company}`.trimEnd();
    }
    msg += `.\n\nWe are currently sourcing for a ${roleHiring} and your experience in ${topSkills} really caught our eye.\n\nWould you be open to a brief 5-minute confidential chat this week?`;

    setWhatsAppMessage(msg);
  }

  function closeWhatsAppModal() {
    setWhatsAppModalCandidate(null);
    setWhatsAppPhone("");
    setWhatsAppMessage("");
    setWhatsAppCopied(false);
  }

  function copyWhatsAppMessage() {
    if (!whatsAppMessage) return;
    navigator.clipboard.writeText(whatsAppMessage);
    setWhatsAppCopied(true);
    setTimeout(() => setWhatsAppCopied(false), 2500);
  }

  function launchWhatsApp() {
    const textEncoded = encodeURIComponent(whatsAppMessage);
    const cleanPhone = whatsAppPhone.replace(/[^0-9+]/g, "").replace(/^\+/, "");
    const url = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${textEncoded}`
      : `https://wa.me/?text=${textEncoded}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function handleFindLookalikes(c: Candidate) {
    if (showProjectsPanel) {
      setShowProjectsPanel(false);
    }
    const name = c.name || "Candidate";
    const role = c.designation || "";
    const comp = c.company || "";
    const loc = c.location || "";
    const skillsList = (c.skills && c.skills.length > 0)
      ? c.skills.slice(0, 3).join(", ")
      : (c.evaluation_strengths || []).slice(0, 2).join(", ");

    const query = [
      `Find candidates similar to ${name}`,
      role ? `Role: ${role}` : "",
      comp ? `at ${comp} or peer companies` : "",
      skillsList ? `with skills in ${skillsList}` : "",
      loc ? `in ${loc}` : "",
    ].filter(Boolean).join(", ");

    setMode("describe");
    setDescribeText(query);
    setLookalikeSource({
      name,
      designation: role,
      company: comp,
    });
    setError(null);
    setNotice(null);

    const body: Record<string, unknown> = {
      mode: "describe",
      text: query,
      lookalike_source: name,
    };
    if (comp) {
      body.target_companies = comp;
    }

    setStep("running");
    setStatusIdx(0);
    if (statusTimer.current) clearInterval(statusTimer.current);
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
      if (!res.ok) throw new Error(data.error || "The lookalike search failed.");
      setSearch(data.search);
      setCandidates(data.candidates || []);
      setPage(0);
      setSelected(new Set());
      setActiveId((data.candidates || [])[0]?.id || null);
      setStep("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The lookalike search failed.");
      setStep("input");
    } finally {
      if (statusTimer.current) clearInterval(statusTimer.current);
    }
  }

  function clearLookalikeSearch() {
    setLookalikeSource(null);
    reset();
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
      if (!manualRole.trim() && !skills.length && !manualTargetCompanies.trim()) {
        setError("Add a role title, target company, or at least one skill.");
        return;
      }
      body = {
        mode,
        manual: {
          role_title: manualRole.trim() || null,
          company: manualCompany.trim() || null,
          target_companies: manualTargetCompanies.trim() || null,
          exclude_companies: manualExcludeCompanies.trim() || null,
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
      body = {
        mode,
        text: text.trim(),
        target_companies: describeTargetCompanies.trim() || undefined,
        exclude_companies: describeExcludeCompanies.trim() || undefined,
        lookalike_source: lookalikeSource?.name || undefined,
      };
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
    setLookalikeSource(null);
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

  const sortedCandidates = useMemo(() => {
    if (searchSort === "score_desc") {
      return [...candidates].sort((a, b) => (b.match_score ?? -1) - (a.match_score ?? -1));
    }
    if (searchSort === "score_asc") {
      return [...candidates].sort((a, b) => (a.match_score ?? 999) - (b.match_score ?? 999));
    }
    return candidates;
  }, [candidates, searchSort]);

  function toggleSelectAll() {
    setSelected((prev) => (prev.size === sortedCandidates.length ? new Set() : new Set(sortedCandidates.map((c) => c.id))));
  }

  function selectedOrAllCandidates(): Candidate[] {
    if (selected.size > 0) return sortedCandidates.filter((c) => selected.has(c.id));
    return sortedCandidates;
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

  function openEditProjectModal(p: ProjectSummary) {
    setEditingProjectModal(p);
    setEditProjectForm({
      name: p.name,
      description: p.description || "",
      start_date: p.start_date || (p.created_at ? p.created_at.slice(0, 10) : ""),
      target_date: p.target_date || "",
      target_hires: p.target_hires || 1,
      status: p.status || "Active",
    });
  }

  function closeEditProjectModal() {
    setEditingProjectModal(null);
    setEditProjectSaving(false);
  }

  async function saveProjectDetails() {
    if (!editingProjectModal) return;
    if (!editProjectForm.name.trim()) {
      setProjectsError("Please enter a project name.");
      return;
    }
    setEditProjectSaving(true);
    try {
      const res = await fetch(`/api/smart-source/projects/${editingProjectModal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editProjectForm.name.trim(),
          description: editProjectForm.description.trim(),
          start_date: editProjectForm.start_date || null,
          target_date: editProjectForm.target_date || null,
          target_hires: Number(editProjectForm.target_hires) || 1,
          status: editProjectForm.status,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update project details.");

      setProjectsList((prev) =>
        prev.map((p) =>
          p.id === editingProjectModal.id
            ? {
                ...p,
                name: data.project.name,
                description: data.project.description,
                start_date: data.project.start_date,
                target_date: data.project.target_date,
                target_hires: data.project.target_hires,
                status: data.project.status,
              }
            : p
        )
      );
      if (activeProjectId === editingProjectModal.id) {
        setActiveProjectName(data.project.name);
      }
      closeEditProjectModal();
      setNotice(`Updated "${data.project.name}".`);
      setTimeout(() => setNotice(null), 3000);
    } catch (err) {
      setProjectsError(err instanceof Error ? err.message : "Failed to update project details.");
    } finally {
      setEditProjectSaving(false);
    }
  }

  function handleSourceMoreForProject(p: ProjectSummary) {
    setShowProjectsPanel(false);
    setMode("describe");
    const brief = p.description ? ` Details: ${p.description}.` : "";
    setDescribeText(`Find qualified talent for ${p.name}.${brief}`);
    setNotice(`Ready to source more candidates for "${p.name}". Review criteria and click "Source candidates".`);
  }

  async function deleteProjectById(id: string, name: string) {
    if (!window.confirm(`Delete project "${name}"? This will not delete candidates from the platform.`)) return;
    setProjectsList((prev) => prev.filter((p) => p.id !== id));
    setLists((prev) => prev.filter((l) => l.id !== id));
    if (activeProjectId === id) {
      setActiveProjectId(null);
    }
    try {
      await fetch(`/api/smart-source/projects/${id}`, { method: "DELETE" });
      setNotice(`Project "${name}" was deleted.`);
      setTimeout(() => setNotice(null), 3000);
    } catch {
      // best-effort
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
    const list = activeProjectCandidates.filter((c) => {
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

    if (projectCandidateSort === "score_desc") {
      return [...list].sort((a, b) => (b.match_score ?? -1) - (a.match_score ?? -1));
    }
    if (projectCandidateSort === "score_asc") {
      return [...list].sort((a, b) => (a.match_score ?? 999) - (b.match_score ?? 999));
    }
    return list;
  }, [activeProjectCandidates, projectStatusFilter, projectSearchQuery, projectCandidateSort]);

  const pageCount = Math.max(1, Math.ceil(sortedCandidates.length / PAGE_SIZE));
  const pageRows = sortedCandidates.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const activeCandidate = sortedCandidates.find((c) => c.id === activeId) || sortedCandidates[0] || null;

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
              <div className="flex flex-col gap-4">
                {/* Executive TA Sourcing KPIs Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="border border-border rounded-md bg-surface p-3.5 shadow-soft-sm flex flex-col justify-between">
                    <div className="text-[11.5px] font-bold uppercase tracking-wider text-ink-muted">Active Mandates</div>
                    <div className="text-2xl font-black text-ink mt-1">{projectsMetrics.activeCount}</div>
                    <div className="text-[11px] text-ink-muted mt-1">{projectsList.length} total projects</div>
                  </div>
                  <div className="border border-border rounded-md bg-surface p-3.5 shadow-soft-sm flex flex-col justify-between">
                    <div className="text-[11.5px] font-bold uppercase tracking-wider text-ink-muted">Talent Sourced</div>
                    <div className="text-2xl font-black text-ink mt-1">{projectsMetrics.totalCandidates}</div>
                    <div className="text-[11px] text-ink-muted mt-1">Across all pipelines</div>
                  </div>
                  <div className="border border-border rounded-md bg-surface p-3.5 shadow-soft-sm flex flex-col justify-between">
                    <div className="text-[11.5px] font-bold uppercase tracking-wider text-ink-muted">In Interviews</div>
                    <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">{projectsMetrics.totalShortlisted}</div>
                    <div className="text-[11px] text-ink-muted mt-1">Shortlisted (L1/L2/HR)</div>
                  </div>
                  <div className="border border-border rounded-md bg-surface p-3.5 shadow-soft-sm flex flex-col justify-between">
                    <div className="text-[11.5px] font-bold uppercase tracking-wider text-ink-muted">Offers & Hired</div>
                    <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{projectsMetrics.totalJoinedOrOffered}</div>
                    <div className="text-[11px] text-ink-muted mt-1">Advanced stage success</div>
                  </div>
                </div>

                {/* Project Control Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-surface border border-border rounded-md p-2.5 shadow-soft-sm">
                  {/* Status Filter Tabs */}
                  <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-thin">
                    {(["All", "Active", "Due Soon", "Completed", "On Hold"] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setProjectFilterTab(tab)}
                        className={`px-3 py-1 rounded-sm text-[12px] font-bold transition-colors shrink-0 ${
                          projectFilterTab === tab
                            ? "bg-brand text-white shadow-soft-sm"
                            : "bg-page/60 text-ink-2 hover:bg-page hover:text-ink"
                        }`}
                      >
                        {tab}
                        {tab === "All" && ` (${projectsList.length})`}
                        {tab === "Active" && ` (${projectsMetrics.activeCount})`}
                      </button>
                    ))}
                  </div>

                  {/* Search & Sort Controls */}
                  <div className="flex items-center gap-2 flex-1 sm:flex-none justify-end">
                    <div className="relative min-w-[220px] flex-1 sm:flex-none">
                      <Icon name="search" className="w-3.5 h-3.5 text-ink-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Filter by mandate or note…"
                        value={projectTableSearch}
                        onChange={(e) => setProjectTableSearch(e.target.value)}
                        className="w-full pl-8 pr-7 py-1 text-[12px] bg-page rounded border border-border focus:outline-none focus:border-brand"
                      />
                      {projectTableSearch && (
                        <button
                          type="button"
                          onClick={() => setProjectTableSearch("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink text-[11px]"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    <select
                      value={projectSortBy}
                      onChange={(e) => setProjectSortBy(e.target.value as any)}
                      className="text-[12px] font-medium bg-page border border-border rounded px-2.5 py-1 text-ink focus:outline-none focus:border-brand"
                    >
                      <option value="updated">Sort: Recent</option>
                      <option value="deadline">Sort: Deadline</option>
                      <option value="candidates">Sort: Most Candidates</option>
                      <option value="name">Sort: Name (A-Z)</option>
                    </select>
                  </div>
                </div>

                {/* Enterprise Project Table */}
                {filteredProjects.length === 0 ? (
                  <div className="text-[13px] text-ink-muted py-10 text-center border border-border rounded-md bg-surface flex flex-col items-center gap-2">
                    <p>No projects match your current filters.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setProjectFilterTab("All");
                        setProjectTableSearch("");
                      }}
                      className="text-[12px] font-bold text-brand hover:underline"
                    >
                      Reset filters
                    </button>
                  </div>
                ) : (
                  <div className="border border-border rounded-md bg-surface shadow-soft-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[1020px]">
                        <thead>
                          <tr className="bg-page border-b border-border text-[11px] font-bold text-ink-muted uppercase tracking-wider">
                            <th className="py-2.5 px-3.5 w-[26%]">Project Mandate & Role</th>
                            <th className="py-2.5 px-3 w-[16%]">Timeline & Deadline</th>
                            <th className="py-2.5 px-3 w-[18%]">Stage Completion (Battery)</th>
                            <th className="py-2.5 px-3 w-[14%]">Coverage & Target</th>
                            <th className="py-2.5 px-3 w-[16%]">Recruiter Brief / Notes</th>
                            <th className="py-2.5 px-3.5 w-[10%] text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border text-[12.5px]">
                          {filteredProjects.map((p) => {
                            const targetHires = p.target_hires && p.target_hires > 0 ? p.target_hires : 1;
                            const coverage = (p.candidateCount / targetHires).toFixed(1);
                            const isHealthyCoverage = Number(coverage) >= 4;

                            return (
                              <tr key={p.id} className="hover:bg-page/50 transition-colors group">
                                {/* Mandate Name & Role */}
                                <td className="py-3 px-3.5 align-top">
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <button
                                        type="button"
                                        onClick={() => openProjectDetail(p.id, p.name)}
                                        className="font-bold text-ink hover:text-brand text-[13.5px] text-left transition-colors cursor-pointer"
                                        title="Open candidate pipeline"
                                      >
                                        {p.name}
                                      </button>
                                      <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                        p.status === "Completed"
                                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800"
                                          : p.status === "On Hold"
                                          ? "bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
                                          : "bg-brand-wash text-brand-dark"
                                      }`}>
                                        {p.status || "Active"}
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-ink-muted">
                                      Created {new Date(p.created_at).toLocaleDateString()}
                                    </div>
                                  </div>
                                </td>

                                {/* Timeline & SLA */}
                                <td className="py-3 px-3 align-top">
                                  <ProjectTimelineBadge
                                    startDate={p.start_date}
                                    targetDate={p.target_date}
                                    status={p.status}
                                  />
                                </td>

                                {/* Battery-Style Funnel Stage Completion */}
                                <td className="py-3 px-3 align-top">
                                  <ProjectBatteryGauge
                                    candidateCount={p.candidateCount}
                                    stageCounts={p.stageCounts}
                                    completionPercentage={p.completionPercentage}
                                    targetHires={p.target_hires}
                                  />
                                  <div className="text-[10.5px] text-ink-muted mt-1 flex items-center gap-1.5 flex-wrap">
                                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{p.stageCounts?.joined || 0} joined</span>
                                    <span>•</span>
                                    <span className="text-amber-600 dark:text-amber-400 font-semibold">{p.stageCounts?.offered || 0} offered</span>
                                    <span>•</span>
                                    <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{p.stageCounts?.shortlisted || 0} shortlist</span>
                                  </div>
                                </td>

                                {/* Coverage & Target */}
                                <td className="py-3 px-3 align-top">
                                  <div className="flex flex-col gap-0.5">
                                    <div className="font-bold text-ink text-[12.5px]">
                                      {p.candidateCount} candidate{p.candidateCount === 1 ? "" : "s"}
                                    </div>
                                    <div className="text-[11px] text-ink-muted">
                                      Target: <span className="font-semibold text-ink-2">{targetHires} hire{targetHires > 1 ? "s" : ""}</span>
                                    </div>
                                    <div className="mt-0.5">
                                      <span className={`inline-block text-[10px] font-bold px-1.5 py-0.2 rounded ${
                                        isHealthyCoverage
                                          ? "bg-good-wash text-good-text"
                                          : "bg-warning-wash text-ink"
                                      }`}>
                                        {coverage}x coverage
                                      </span>
                                    </div>
                                  </div>
                                </td>

                                {/* Recruiter Notes / Comments */}
                                <td className="py-3 px-3 align-top">
                                  <div
                                    onClick={() => openEditProjectModal(p)}
                                    className="cursor-pointer group/note rounded p-1 -m-1 hover:bg-page hover:border hover:border-border transition-all flex flex-col gap-0.5"
                                    title="Click to edit recruiter comments & mandate details"
                                  >
                                    {p.description ? (
                                      <p className="text-[11.5px] text-ink line-clamp-3 leading-relaxed">
                                        {p.description}
                                      </p>
                                    ) : (
                                      <span className="text-[11.5px] text-ink-muted italic group-hover/note:text-brand flex items-center gap-1">
                                        <Icon name="edit" className="w-3 h-3 opacity-60" /> Add brief/notes…
                                      </span>
                                    )}
                                    {p.description && (
                                      <span className="text-[10px] text-brand opacity-0 group-hover/note:opacity-100 transition-opacity font-bold">
                                        Edit brief
                                      </span>
                                    )}
                                  </div>
                                </td>

                                {/* Actions */}
                                <td className="py-3 px-3.5 align-top text-right">
                                  <div className="flex flex-col items-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => openProjectDetail(p.id, p.name)}
                                      className="bg-brand text-white hover:bg-brand-hover text-[11.5px] font-bold px-2.5 py-1 rounded shadow-soft-sm inline-flex items-center gap-1 transition-colors"
                                      title="Open candidate pipeline"
                                    >
                                      <span>Pipeline</span>
                                      <Icon name="chevronRight" className="w-3 h-3" />
                                    </button>
                                    <div className="flex items-center gap-1 text-[11px]">
                                      <button
                                        type="button"
                                        onClick={() => handleSourceMoreForProject(p)}
                                        className="text-brand hover:underline font-bold"
                                        title="Source more candidates for this project"
                                      >
                                        Source
                                      </button>
                                      <span className="text-ink-muted">•</span>
                                      <button
                                        type="button"
                                        onClick={() => openEditProjectModal(p)}
                                        className="text-ink-2 hover:text-brand font-semibold"
                                        title="Edit timelines, target hires, and notes"
                                      >
                                        Edit
                                      </button>
                                      <span className="text-ink-muted">•</span>
                                      <button
                                        type="button"
                                        onClick={() => deleteProjectById(p.id, p.name)}
                                        className="text-critical hover:underline"
                                        title="Delete this project"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
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

                <div className="flex items-center gap-3">
                  {/* Score Sort Option */}
                  <div className="inline-flex items-center gap-1.5 bg-page border border-border rounded-sm px-2.5 py-1 text-[12px]">
                    <span className="text-ink-muted text-[11px] font-semibold uppercase tracking-wider">Sort:</span>
                    <button
                      type="button"
                      onClick={() => setProjectCandidateSort((s) => (s === "score_desc" ? "score_asc" : "score_desc"))}
                      className={`px-2 py-0.5 rounded text-[11.5px] font-bold inline-flex items-center gap-1 transition-all ${
                        projectCandidateSort === "score_desc"
                          ? "bg-brand text-white shadow-soft-sm"
                          : projectCandidateSort === "score_asc"
                          ? "bg-brand/15 text-brand"
                          : "bg-surface text-ink-2 hover:text-ink"
                      }`}
                      title={projectCandidateSort === "score_desc" ? "Currently sorted: Highest score first (click to invert)" : "Sort by highest score first"}
                    >
                      <span>Highest Score First</span>
                      <span className="text-[10.5px] font-mono">
                        {projectCandidateSort === "score_desc" ? "▼" : projectCandidateSort === "score_asc" ? "▲" : "↕"}
                      </span>
                    </button>
                    {projectCandidateSort !== "default" && (
                      <button
                        type="button"
                        onClick={() => setProjectCandidateSort("default")}
                        className="text-[11px] text-ink-muted hover:text-ink ml-0.5 hover:underline"
                        title="Reset to default order"
                      >
                        Reset
                      </button>
                    )}
                  </div>

                  <div className="text-[12px] text-ink-muted flex items-center gap-2">
                    <span>
                      Showing <strong className="text-ink">{filteredProjectCandidates.length}</strong> of{" "}
                      {activeProjectCandidates.length} candidates
                    </span>
                    {(projectStatusFilter !== "All" || projectSearchQuery || projectCandidateSort !== "default") && (
                      <button
                        onClick={() => {
                          setProjectStatusFilter("All");
                          setProjectSearchQuery("");
                          setProjectCandidateSort("default");
                        }}
                        className="text-[11.5px] font-bold text-brand hover:underline ml-1"
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
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
                      setProjectCandidateSort("default");
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
                          <th
                            onClick={() => setProjectCandidateSort((s) => (s === "score_desc" ? "score_asc" : "score_desc"))}
                            className="py-2.5 px-3 w-[8%] text-center cursor-pointer hover:text-brand select-none transition-colors group"
                            title="Click to sort by match score (highest score first)"
                          >
                            <div className="inline-flex items-center justify-center gap-1">
                              <span className="group-hover:underline">Score</span>
                              <span className={`text-[10.5px] font-mono ${projectCandidateSort === "score_desc" ? "text-brand font-bold" : "text-ink-muted"}`}>
                                {projectCandidateSort === "score_desc" ? "▼" : projectCandidateSort === "score_asc" ? "▲" : "↕"}
                              </span>
                            </div>
                          </th>
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
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => openWhatsAppModal(c)}
                                        className="text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 text-[11.5px] font-bold px-1.5 py-0.5 rounded hover:bg-emerald-50 dark:hover:bg-emerald-950/40 inline-flex items-center gap-1 transition-colors"
                                        title="Quick outreach via WhatsApp"
                                      >
                                        <Icon name="whatsapp" className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                        <span>WhatsApp</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleFindLookalikes(c)}
                                        className="text-brand hover:text-brand-hover text-[11.5px] font-bold px-1.5 py-0.5 rounded hover:bg-brand-wash inline-flex items-center gap-1 transition-colors"
                                        title="Find lookalike candidates"
                                      >
                                        <Icon name="users" className="w-3 h-3 text-brand" />
                                        <span>Lookalikes</span>
                                      </button>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        onClick={() =>
                                          setProjectExpanded((prev) => (prev === c.id ? null : c.id))
                                        }
                                        className={`text-[11.5px] font-bold px-2 py-0.5 rounded transition-colors inline-flex items-center gap-1 ${
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
                                      <EvaluationPanel c={c} onWhatsApp={openWhatsAppModal} onFindLookalikes={handleFindLookalikes} />
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
            <div className="flex flex-col gap-2.5">
              <Field label="Describe who you're looking for">
                <textarea
                  className="input min-h-[140px]"
                  placeholder='e.g. "Senior sales manager in Mexico with experience in feed additives from Cargill or Nutreco", or search for a specific person like "Riddhi Ramesh from Google"'
                  value={describeText}
                  onChange={(e) => setDescribeText(e.target.value)}
                />
              </Field>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowTargetCompaniesInDescribe((prev) => !prev)}
                  className="text-[11.5px] font-bold text-brand hover:underline inline-flex items-center gap-1"
                >
                  <Icon name="tag" className="w-3 h-3" />
                  {showTargetCompaniesInDescribe ? "Hide company filters" : "+ Target / Exclude specific companies"}
                </button>
              </div>
              {showTargetCompaniesInDescribe && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-page p-3 rounded-md border border-border">
                  <Field label="Target Companies (optional, comma-separated)">
                    <input
                      className="input"
                      value={describeTargetCompanies}
                      onChange={(e) => setDescribeTargetCompanies(e.target.value)}
                      placeholder="e.g. Razorpay, Swiggy, CRED, Zepto"
                    />
                  </Field>
                  <Field label="Exclude Companies (optional, comma-separated)">
                    <input
                      className="input"
                      value={describeExcludeCompanies}
                      onChange={(e) => setDescribeExcludeCompanies(e.target.value)}
                      placeholder="e.g. Current Employer, Client X"
                    />
                  </Field>
                </div>
              )}
            </div>
          )}

          {mode === "manual" && (
            <div className="grid grid-cols-2 gap-3.5">
              <Field label="Role title">
                <input className="input" value={manualRole} onChange={(e) => setManualRole(e.target.value)} placeholder="e.g. Sales Manager" />
              </Field>
              <Field label="Location (optional)">
                <input className="input" value={manualLocation} onChange={(e) => setManualLocation(e.target.value)} placeholder="e.g. Mexico City" />
              </Field>
              <Field label="Target Companies (optional, comma-separated)">
                <input
                  className="input"
                  value={manualTargetCompanies}
                  onChange={(e) => setManualTargetCompanies(e.target.value)}
                  placeholder="e.g. Google, Microsoft, Stripe, Razorpay"
                />
              </Field>
              <Field label="Exclude Companies (optional, comma-separated)">
                <input
                  className="input"
                  value={manualExcludeCompanies}
                  onChange={(e) => setManualExcludeCompanies(e.target.value)}
                  placeholder="e.g. Current employer, Client X"
                />
              </Field>
              <Field label="Minimum experience (years, optional)">
                <input className="input" type="number" min={0} value={manualExperience} onChange={(e) => setManualExperience(e.target.value)} placeholder="e.g. 6" />
              </Field>
              <Field label="Specific Company (optional)">
                <input className="input" value={manualCompany} onChange={(e) => setManualCompany(e.target.value)} placeholder="e.g. Cargill" />
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
          {lookalikeSource && (
            <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 dark:bg-indigo-950/40 dark:border-indigo-800 rounded-md p-3 text-[13px] text-indigo-900 dark:text-indigo-200">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300">
                  <Icon name="users" className="w-4 h-4" />
                </span>
                <div>
                  <span className="font-bold">Lookalike Discovery Active:</span> Sourcing profiles similar to{" "}
                  <span className="font-semibold underline">{lookalikeSource.name}</span>
                  {lookalikeSource.company ? ` (${lookalikeSource.company})` : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={clearLookalikeSearch}
                className="text-[12px] font-bold text-indigo-700 dark:text-indigo-300 hover:underline inline-flex items-center gap-1"
              >
                <Icon name="x" className="w-3.5 h-3.5" />
                Clear lookalikes
              </button>
            </div>
          )}

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
              {activeTargetCompanies.length > 0 && (
                <span className="bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800 rounded-full px-3 py-1 text-[12px] font-medium inline-flex items-center gap-1">
                  🎯 Targets: {activeTargetCompanies.join(", ")}
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
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="inline-flex bg-page rounded-sm p-1 gap-0.5 border border-border">
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

                  {/* Score Sort Option */}
                  <div className="inline-flex items-center gap-1.5 bg-surface border border-border rounded-sm px-2.5 py-1 text-[12px] shadow-soft-sm">
                    <span className="text-ink-muted text-[11px] font-semibold uppercase tracking-wider">Sort:</span>
                    <button
                      type="button"
                      onClick={() => setSearchSort((s) => (s === "score_desc" ? "score_asc" : "score_desc"))}
                      className={`px-2 py-0.5 rounded text-[11.5px] font-bold inline-flex items-center gap-1 transition-all ${
                        searchSort === "score_desc"
                          ? "bg-brand text-white shadow-soft-sm"
                          : searchSort === "score_asc"
                          ? "bg-brand/15 text-brand"
                          : "bg-page text-ink-2 hover:text-ink"
                      }`}
                      title={searchSort === "score_desc" ? "Currently sorted: Highest score first (click to invert)" : "Sort by highest score first"}
                    >
                      <span>Highest Score First</span>
                      <span className="text-[10.5px] font-mono">
                        {searchSort === "score_desc" ? "▼" : searchSort === "score_asc" ? "▲" : "↕"}
                      </span>
                    </button>
                    {searchSort !== "default" && (
                      <button
                        type="button"
                        onClick={() => setSearchSort("default")}
                        className="text-[11px] text-ink-muted hover:text-ink ml-0.5 hover:underline"
                        title="Reset to default search order"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>

                <div className="relative flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-[12px] font-medium text-ink-2 mr-1">
                    <input type="checkbox" checked={selected.size === sortedCandidates.length} onChange={toggleSelectAll} />
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
                  targetCompanies={activeTargetCompanies}
                  onWhatsApp={openWhatsAppModal}
                  onFindLookalikes={handleFindLookalikes}
                  searchSort={searchSort}
                  onToggleScoreSort={() => setSearchSort((s) => (s === "score_desc" ? "score_asc" : "score_desc"))}
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
                  targetCompanies={activeTargetCompanies}
                  onWhatsApp={openWhatsAppModal}
                  onFindLookalikes={handleFindLookalikes}
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
                  targetCompanies={activeTargetCompanies}
                  onWhatsApp={openWhatsAppModal}
                  onFindLookalikes={handleFindLookalikes}
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

      {whatsAppModalCandidate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
          onClick={closeWhatsAppModal}
        >
          <div
            className="bg-surface border border-border rounded-lg shadow-soft-lg p-5 w-full max-w-lg flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <Icon name="whatsapp" className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-bold text-ink text-[15px]">WhatsApp Outreach</h3>
                  <p className="text-[12px] text-ink-muted">
                    Reach out to <span className="font-bold text-ink-2">{whatsAppModalCandidate.name}</span>
                    {whatsAppModalCandidate.company ? ` (${whatsAppModalCandidate.company})` : ""}
                  </p>
                </div>
              </div>
              <button
                onClick={closeWhatsAppModal}
                className="text-ink-muted hover:text-ink p-1 rounded-sm"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-bold text-ink">Candidate Phone Number (optional)</label>
              <input
                className="input text-[13px]"
                type="tel"
                placeholder="e.g. +91 98765 43210 or 9876543210"
                value={whatsAppPhone}
                onChange={(e) => setWhatsAppPhone(e.target.value)}
              />
              <span className="text-[11px] text-ink-muted">
                If omitted, WhatsApp will open and let you select from your contacts or chat list.
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[12px] font-bold text-ink">Personalized Pitch Message</label>
                <button
                  type="button"
                  onClick={copyWhatsAppMessage}
                  className="text-[11.5px] font-bold text-brand hover:underline inline-flex items-center gap-1"
                >
                  <Icon name={whatsAppCopied ? "check" : "share"} className="w-3 h-3" />
                  {whatsAppCopied ? "Copied!" : "Copy message"}
                </button>
              </div>
              <textarea
                className="input min-h-[140px] text-[12.5px] leading-relaxed resize-y font-sans"
                value={whatsAppMessage}
                onChange={(e) => setWhatsAppMessage(e.target.value)}
                placeholder="Write your WhatsApp message..."
              />
              <span className="text-[11px] text-ink-muted">
                Edit the draft directly before launching or copying.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={closeWhatsAppModal}
                className="border border-border text-[12.5px] font-bold px-3 py-1.5 rounded-sm bg-surface hover:bg-page transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={copyWhatsAppMessage}
                className="border border-border text-[12.5px] font-bold px-3.5 py-1.5 rounded-sm bg-surface hover:bg-page inline-flex items-center gap-1.5 transition-colors"
              >
                <Icon name={whatsAppCopied ? "check" : "share"} className="w-3.5 h-3.5" />
                {whatsAppCopied ? "Copied" : "Copy text"}
              </button>
              <button
                type="button"
                onClick={launchWhatsApp}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-[12.5px] font-bold px-4 py-1.5 rounded-sm shadow-soft-sm inline-flex items-center gap-1.5 transition-colors"
              >
                <Icon name="whatsapp" className="w-4 h-4" />
                Open WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}

      {editingProjectModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
          onClick={closeEditProjectModal}
        >
          <div
            className="bg-surface border border-border rounded-lg shadow-soft-lg p-5 w-full max-w-lg flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-ink text-[15px]">Project Details & Timeline</h3>
                <p className="text-[12px] text-ink-muted">Configure mandate schedule, headcount targets, and recruiter notes.</p>
              </div>
              <button
                type="button"
                onClick={closeEditProjectModal}
                className="text-ink-muted hover:text-ink p-1 rounded-sm"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <label className="block">
                <span className="block text-[12px] font-bold text-ink mb-1">Project Name</span>
                <input
                  type="text"
                  className="input text-[13px]"
                  value={editProjectForm.name}
                  onChange={(e) => setEditProjectForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Senior Backend Engineers"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-[12px] font-bold text-ink mb-1">Start Date</span>
                  <input
                    type="date"
                    className="input text-[13px]"
                    value={editProjectForm.start_date}
                    onChange={(e) => setEditProjectForm((f) => ({ ...f, start_date: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="block text-[12px] font-bold text-ink mb-1">Target Deadline</span>
                  <input
                    type="date"
                    className="input text-[13px]"
                    value={editProjectForm.target_date}
                    onChange={(e) => setEditProjectForm((f) => ({ ...f, target_date: e.target.value }))}
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-[12px] font-bold text-ink mb-1">Target Hires (Headcount)</span>
                  <input
                    type="number"
                    min={1}
                    className="input text-[13px]"
                    value={editProjectForm.target_hires}
                    onChange={(e) => setEditProjectForm((f) => ({ ...f, target_hires: Math.max(1, Number(e.target.value)) }))}
                  />
                </label>
                <label className="block">
                  <span className="block text-[12px] font-bold text-ink mb-1">Project Status</span>
                  <select
                    className="input text-[13px]"
                    value={editProjectForm.status}
                    onChange={(e) => setEditProjectForm((f) => ({ ...f, status: e.target.value }))}
                  >
                    <option value="Active">Active</option>
                    <option value="On Hold">On Hold</option>
                    <option value="Completed">Completed</option>
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="block text-[12px] font-bold text-ink mb-1">Recruiter Comments & Mandate Brief</span>
                <textarea
                  rows={4}
                  className="input text-[12.5px] leading-relaxed resize-y font-sans"
                  value={editProjectForm.description}
                  onChange={(e) => setEditProjectForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Notes on hiring manager preferences, key skills, target competitor companies, or compensation range…"
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={closeEditProjectModal}
                disabled={editProjectSaving}
                className="border border-border text-[12.5px] font-bold px-3 py-1.5 rounded-sm bg-surface hover:bg-page transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveProjectDetails}
                disabled={editProjectSaving || !editProjectForm.name.trim()}
                className="bg-brand text-white text-[12.5px] font-bold px-4 py-1.5 rounded-sm shadow-soft-sm hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {editProjectSaving ? "Saving…" : "Save Details"}
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

function ProjectBatteryGauge({
  candidateCount,
  stageCounts,
  completionPercentage = 0,
  targetHires = 1,
}: {
  candidateCount: number;
  stageCounts?: {
    screened: number;
    shortlisted: number;
    offered: number;
    joined: number;
    inactive: number;
  };
  completionPercentage?: number;
  targetHires?: number;
}) {
  const counts = stageCounts || { screened: 0, shortlisted: 0, offered: 0, joined: 0, inactive: 0 };
  const total = candidateCount || 0;

  const joinedPct = total > 0 ? (counts.joined / total) * 100 : 0;
  const offeredPct = total > 0 ? (counts.offered / total) * 100 : 0;
  const shortlistPct = total > 0 ? (counts.shortlisted / total) * 100 : 0;
  const screenedPct = total > 0 ? (counts.screened / total) * 100 : 0;

  return (
    <div
      className="flex items-center gap-2"
      title={`Funnel: ${counts.joined} Joined, ${counts.offered} Offered, ${counts.shortlisted} Shortlisted, ${counts.screened} Screened (${completionPercentage}% completion score)`}
    >
      {/* Battery Body with Terminal Cap */}
      <div className="relative flex items-center">
        <div className="w-24 h-4 rounded-xs border border-ink/40 dark:border-ink/60 bg-page p-[1px] flex overflow-hidden shadow-xs">
          {total === 0 ? (
            <div className="w-full h-full bg-border/40 rounded-xs" />
          ) : (
            <>
              {joinedPct > 0 && (
                <div
                  style={{ width: `${joinedPct}%` }}
                  className="h-full bg-emerald-500 transition-all duration-300"
                  title={`${counts.joined} Joined`}
                />
              )}
              {offeredPct > 0 && (
                <div
                  style={{ width: `${offeredPct}%` }}
                  className="h-full bg-amber-500 transition-all duration-300"
                  title={`${counts.offered} Offered / To Join`}
                />
              )}
              {shortlistPct > 0 && (
                <div
                  style={{ width: `${shortlistPct}%` }}
                  className="h-full bg-indigo-500 transition-all duration-300"
                  title={`${counts.shortlisted} Interview Shortlist`}
                />
              )}
              {screenedPct > 0 && (
                <div
                  style={{ width: `${screenedPct}%` }}
                  className="h-full bg-sky-400 transition-all duration-300"
                  title={`${counts.screened} Screened`}
                />
              )}
            </>
          )}
        </div>
        {/* Terminal positive nipple */}
        <div className="w-[3px] h-[7px] rounded-r-xs bg-ink/40 dark:bg-ink/60 -ml-[1px]" />
      </div>

      <span className="text-[11.5px] font-bold text-ink shrink-0">
        {completionPercentage}%
      </span>
    </div>
  );
}

function ProjectTimelineBadge({
  startDate,
  targetDate,
  status,
}: {
  startDate?: string | null;
  targetDate?: string | null;
  status?: string;
}) {
  if (status === "Completed") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800">
        ✓ Completed
      </span>
    );
  }

  if (!targetDate) {
    return (
      <span className="text-[11.5px] text-ink-muted">
        {startDate ? `Started ${new Date(startDate).toLocaleDateString()}` : "No deadline set"}
      </span>
    );
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(targetDate);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return (
      <div className="flex flex-col">
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-bold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800 w-fit">
          Overdue by {Math.abs(diffDays)}d
        </span>
        <span className="text-[10px] text-ink-muted mt-0.5">Target: {target.toLocaleDateString()}</span>
      </div>
    );
  } else if (diffDays === 0) {
    return (
      <div className="flex flex-col">
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-bold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800 w-fit">
          Due today
        </span>
        <span className="text-[10px] text-ink-muted mt-0.5">Target: {target.toLocaleDateString()}</span>
      </div>
    );
  } else if (diffDays <= 3) {
    return (
      <div className="flex flex-col">
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-bold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800 w-fit">
          {diffDays}d remaining
        </span>
        <span className="text-[10px] text-ink-muted mt-0.5">Target: {target.toLocaleDateString()}</span>
      </div>
    );
  } else {
    return (
      <div className="flex flex-col">
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-semibold bg-page text-ink-2 border border-border w-fit">
          {diffDays}d left
        </span>
        <span className="text-[10px] text-ink-muted mt-0.5">Target: {target.toLocaleDateString()}</span>
      </div>
    );
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-bold mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function isTargetCompany(company: string | null | undefined, targetCompanies?: string[]): boolean {
  if (!company || !targetCompanies || targetCompanies.length === 0) return false;
  const compLower = company.toLowerCase();
  return targetCompanies.some((tc) => compLower.includes(tc.toLowerCase().trim()));
}

function LinksRow({
  c,
  expanded,
  setExpanded,
  onAddToProject,
  onWhatsApp,
  onFindLookalikes,
}: {
  c: Candidate;
  expanded: string | null;
  setExpanded: (id: string | null) => void;
  onAddToProject?: (c: Candidate) => void;
  onWhatsApp?: (c: Candidate) => void;
  onFindLookalikes?: (c: Candidate) => void;
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
      {onWhatsApp && (
        <button
          type="button"
          onClick={() => onWhatsApp(c)}
          className="text-emerald-700 dark:text-emerald-400 font-bold hover:underline inline-flex items-center gap-1"
          title="Send personalized WhatsApp pitch"
        >
          <Icon name="whatsapp" className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
          WhatsApp
        </button>
      )}
      {onFindLookalikes && (
        <button
          type="button"
          onClick={() => onFindLookalikes(c)}
          className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline inline-flex items-center gap-1"
          title="Find similar candidate profiles"
        >
          <Icon name="users" className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
          Lookalikes
        </button>
      )}
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
  onWhatsApp,
  onFindLookalikes,
}: {
  c: Candidate;
  cols?: number;
  onAddToProject?: (c: Candidate) => void;
  onWhatsApp?: (c: Candidate) => void;
  onFindLookalikes?: (c: Candidate) => void;
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
      <div className="flex items-center justify-end gap-2 pt-2.5 border-t border-border/80 flex-wrap">
        {onWhatsApp && (
          <button
            type="button"
            onClick={() => onWhatsApp(c)}
            className="border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[12px] font-bold px-3 py-1.5 rounded-sm shadow-soft-sm hover:opacity-90 inline-flex items-center gap-1.5 transition-opacity"
            title="Generate personalized WhatsApp outreach"
          >
            <Icon name="whatsapp" className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            WhatsApp Outreach
          </button>
        )}
        {onFindLookalikes && (
          <button
            type="button"
            onClick={() => onFindLookalikes(c)}
            className="border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-[12px] font-bold px-3 py-1.5 rounded-sm shadow-soft-sm hover:opacity-90 inline-flex items-center gap-1.5 transition-opacity"
            title="Find lookalike candidates with similar background"
          >
            <Icon name="users" className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            Find Lookalikes
          </button>
        )}
        {onAddToProject && (
          <button
            type="button"
            onClick={() => onAddToProject(c)}
            className="border border-border bg-surface text-ink text-[12px] font-bold px-3 py-1.5 rounded-sm shadow-soft-sm hover:border-brand hover:text-brand inline-flex items-center gap-1.5 transition-colors"
          >
            <Icon name="briefcase" className="w-3.5 h-3.5 text-brand" />
            Add to project
          </button>
        )}
      </div>
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
  targetCompanies,
  onWhatsApp,
  onFindLookalikes,
  searchSort,
  onToggleScoreSort,
}: {
  rows: Candidate[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  expanded: string | null;
  setExpanded: (id: string | null) => void;
  onAddToProject: (c: Candidate) => void;
  targetCompanies?: string[];
  onWhatsApp?: (c: Candidate) => void;
  onFindLookalikes?: (c: Candidate) => void;
  searchSort?: "score_desc" | "score_asc" | "default";
  onToggleScoreSort?: () => void;
}) {
  return (
    <div className="border border-border rounded-md bg-surface overflow-x-auto">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-wider text-ink-muted">
            <th className="px-3 py-2.5 w-8"></th>
            <th className="px-3 py-2.5">Name</th>
            <th
              onClick={onToggleScoreSort}
              className="px-3 py-2.5 cursor-pointer hover:text-brand select-none transition-colors group"
              title="Click to sort by match score (highest score first)"
            >
              <div className="inline-flex items-center gap-1">
                <span className="group-hover:underline">Score</span>
                <span className={`text-[10px] font-mono ${searchSort === "score_desc" ? "text-brand font-bold" : "text-ink-muted"}`}>
                  {searchSort === "score_desc" ? "▼" : searchSort === "score_asc" ? "▲" : "↕"}
                </span>
              </div>
            </th>
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
          {rows.map((c) => {
            const isTarget = isTargetCompany(c.company, targetCompanies);
            return (
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
                  <td className="px-3 py-2.5 text-ink-2">
                    <div className="flex items-center gap-1.5">
                      <span>{c.company || "—"}</span>
                      {isTarget && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800 shrink-0" title="Target company candidate">
                          🎯 Target
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-ink-2">{c.location || "—"}</td>
                  <td className="px-3 py-2.5 text-ink-2">{c.experience_years ?? "—"}</td>
                  <td className="px-3 py-2.5 text-ink-2">{c.compensation || "—"}</td>
                  <td className="px-3 py-2.5 text-ink-2 max-w-[180px] truncate" title={(c.skills || []).join(", ")}>
                    {(c.skills || []).slice(0, 3).join(", ") || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-ink-2">{c.qualification || "—"}</td>
                  <td className="px-3 py-2.5">
                    <LinksRow
                      c={c}
                      expanded={expanded}
                      setExpanded={setExpanded}
                      onAddToProject={onAddToProject}
                      onWhatsApp={onWhatsApp}
                      onFindLookalikes={onFindLookalikes}
                    />
                  </td>
                </tr>
                {expanded === c.id && (
                  <tr className="border-b border-border bg-page/40">
                    <td colSpan={10} className="px-4 py-3.5">
                      <EvaluationPanel
                        c={c}
                        onAddToProject={onAddToProject}
                        onWhatsApp={onWhatsApp}
                        onFindLookalikes={onFindLookalikes}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
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
  targetCompanies,
  onWhatsApp,
  onFindLookalikes,
}: {
  rows: Candidate[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  expanded: string | null;
  setExpanded: (id: string | null) => void;
  onAddToProject: (c: Candidate) => void;
  targetCompanies?: string[];
  onWhatsApp?: (c: Candidate) => void;
  onFindLookalikes?: (c: Candidate) => void;
}) {
  return (
    <div className="border border-border rounded-md bg-surface divide-y divide-border">
      {rows.map((c) => {
        const isTarget = isTargetCompany(c.company, targetCompanies);
        return (
          <div key={c.id}>
            <div className="flex items-center gap-3 px-3.5 py-2.5 text-[12.5px]">
              <input type="checkbox" checked={selected.has(c.id)} onChange={() => onToggle(c.id)} />
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${scoreClass(c.match_score)} shrink-0`}>{c.match_score ?? "—"}</span>
              <span className="font-bold text-ink w-[160px] truncate">{c.name || "—"}</span>
              <div className="text-ink-2 w-[140px] truncate flex items-center gap-1">
                <span className="truncate">{c.company || "—"}</span>
                {isTarget && (
                  <span className="shrink-0 px-1 py-0.2 rounded text-[9.5px] font-bold bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800" title="Target company candidate">
                    🎯
                  </span>
                )}
              </div>
              <span className="text-ink-2 w-[120px] truncate">{c.location || "—"}</span>
              <span className="text-ink-muted w-[80px] shrink-0">{c.experience_years != null ? `${c.experience_years} yrs` : "—"}</span>
              <span className="text-ink-2 flex-1 truncate">{(c.skills || []).slice(0, 3).join(", ") || "—"}</span>
              <div className="shrink-0">
                <LinksRow
                  c={c}
                  expanded={expanded}
                  setExpanded={setExpanded}
                  onAddToProject={onAddToProject}
                  onWhatsApp={onWhatsApp}
                  onFindLookalikes={onFindLookalikes}
                />
              </div>
            </div>
            {expanded === c.id && (
              <div className="px-4 py-3.5 bg-page/40">
                <EvaluationPanel
                  c={c}
                  onAddToProject={onAddToProject}
                  onWhatsApp={onWhatsApp}
                  onFindLookalikes={onFindLookalikes}
                />
              </div>
            )}
          </div>
        );
      })}
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
  targetCompanies,
  onWhatsApp,
  onFindLookalikes,
}: {
  rows: Candidate[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  activeId: string | null;
  setActiveId: (id: string) => void;
  active: Candidate | null;
  onAddToProject: (c: Candidate) => void;
  targetCompanies?: string[];
  onWhatsApp?: (c: Candidate) => void;
  onFindLookalikes?: (c: Candidate) => void;
}) {
  const activeIsTarget = active ? isTargetCompany(active.company, targetCompanies) : false;

  return (
    <div className="grid grid-cols-[280px_1fr] gap-3 border border-border rounded-md bg-surface overflow-hidden" style={{ minHeight: 360 }}>
      <div className="border-r border-border overflow-y-auto max-h-[520px] divide-y divide-border">
        {rows.map((c) => {
          const isTarget = isTargetCompany(c.company, targetCompanies);
          return (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className={`w-full text-left px-3 py-2.5 flex items-center gap-2 ${activeId === c.id ? "bg-page" : "hover:bg-page/60"}`}
            >
              <input type="checkbox" checked={selected.has(c.id)} onChange={(e) => { e.stopPropagation(); onToggle(c.id); }} />
              <span className={`text-[10.5px] font-bold px-1.5 py-0.5 rounded-full ${scoreClass(c.match_score)} shrink-0`}>{c.match_score ?? "—"}</span>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-ink text-[12.5px] truncate">{c.name || "—"}</div>
                <div className="text-ink-muted text-[11px] truncate flex items-center gap-1">
                  <span className="truncate">{c.company || "—"}</span>
                  {isTarget && <span title="Target company candidate">🎯</span>}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="p-4 overflow-y-auto max-h-[520px]">
        {active ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-bold text-ink text-[16px] flex items-center gap-2">
                  <span>{active.name || "—"}</span>
                  {activeIsTarget && (
                    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800">
                      🎯 Target Company
                    </span>
                  )}
                </div>
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
              {onWhatsApp && (
                <button
                  type="button"
                  onClick={() => onWhatsApp(active)}
                  className="text-emerald-700 dark:text-emerald-400 font-bold hover:underline inline-flex items-center gap-1"
                  title="Send personalized WhatsApp pitch"
                >
                  <Icon name="whatsapp" className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  WhatsApp
                </button>
              )}
              {onFindLookalikes && (
                <button
                  type="button"
                  onClick={() => onFindLookalikes(active)}
                  className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline inline-flex items-center gap-1"
                  title="Find similar candidate profiles"
                >
                  <Icon name="users" className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  Lookalikes
                </button>
              )}
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
              <EvaluationPanel
                c={active}
                cols={1}
                onAddToProject={onAddToProject}
                onWhatsApp={onWhatsApp}
                onFindLookalikes={onFindLookalikes}
              />
            </div>
          </div>
        ) : (
          <div className="text-ink-muted text-[13px]">Select a candidate on the left.</div>
        )}
      </div>
    </div>
  );
}
