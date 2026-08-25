"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";

type Mode = "jd" | "describe" | "manual";
type Step = "input" | "running" | "results";
type ViewMode = "table" | "cards" | "compact" | "split";

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
};

type Requisition = { id: string; title: string };
type ProjectList = { id: string; name: string };
type ProjectSummary = { id: string; name: string; created_at: string; candidateCount: number };

const STATUS_STEPS = [
  "Reading the input",
  "Extracting role & skills",
  "Searching LinkedIn",
  "Scoring matches",
  "Checking your database",
];

const VIEWS: { key: ViewMode; label: string; icon: string }[] = [
  { key: "table", label: "Table", icon: "grid" },
  { key: "cards", label: "Cards", icon: "grid" },
  { key: "compact", label: "Compact", icon: "menu" },
  { key: "split", label: "Split", icon: "chevronRight" },
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

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(VIEW_STORAGE_KEY) : null;
    if (saved) setView(saved as ViewMode);
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

  function openAddToProject() {
    setShowExport(false);
    setShowEmail(false);
    setShowAddToProject((v) => !v);
    if (!sourcesLoaded) loadProjectSources();
  }

  async function openProjectsPanel() {
    setShowProjectsPanel(true);
    setActiveProjectId(null);
    setActiveProjectName("");
    setActiveProjectCandidates([]);
    setProjectsError(null);
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
    setActiveProjectId(id);
    setActiveProjectName(name);
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

  async function submitAddToProject() {
    const picked = selectedOrAllCandidates();
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
      setNotice(
        failed
          ? `Added ${picked.length - failed} of ${picked.length} candidates (${failed} failed).`
          : `Added ${picked.length} candidate${picked.length === 1 ? "" : "s"} to ${destination}.`
      );
      setShowAddToProject(false);
      setPickedRequisition("");
      setPickedList("");
      setNewListName("");
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

      {error && (
        <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2 mb-4">{error}</div>
      )}
      {notice && (
        <div className="bg-good-wash text-good-text text-[12.5px] rounded-sm px-3 py-2 mb-4">{notice}</div>
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
                  <button
                    key={p.id}
                    onClick={() => openProjectDetail(p.id, p.name)}
                    className="text-left border border-border rounded-md bg-surface p-3.5 shadow-soft-sm hover:border-brand transition-colors"
                  >
                    <div className="font-bold text-ink text-[13.5px] mb-1">{p.name}</div>
                    <div className="text-[12px] text-ink-muted">
                      {p.candidateCount} candidate{p.candidateCount === 1 ? "" : "s"}
                    </div>
                    <div className="text-[11px] text-ink-muted mt-1">
                      Saved {new Date(p.created_at).toLocaleDateString()}
                    </div>
                  </button>
                ))}
              </div>
            )
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setActiveProjectId(null)}
                  className="text-[12.5px] font-bold text-ink-muted inline-flex items-center gap-1"
                >
                  <Icon name="chevronLeft" className="w-3.5 h-3.5" /> All projects
                </button>
                <div className="text-[13px] font-bold">{activeProjectName}</div>
              </div>
              {projectDetailLoading ? (
                <div className="text-[13px] text-ink-muted py-10 text-center">Loading candidates…</div>
              ) : activeProjectCandidates.length === 0 ? (
                <div className="text-[13px] text-ink-muted py-10 text-center">No candidates in this project yet.</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {activeProjectCandidates.map((c) => (
                    <div key={c.id} className="border border-border rounded-md bg-surface p-3 shadow-soft-sm flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold text-ink text-[13.5px]">{c.name || "—"}</div>
                          <div className="text-ink-muted text-[12px]">{c.designation || "—"}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${scoreClass(c.match_score)}`}>
                            {c.match_score ?? "—"}
                          </span>
                          <button
                            onClick={() => removeFromActiveProject(c.id)}
                            className="text-[11px] font-bold text-critical"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                      <div className="text-[12.5px] text-ink-2">{[c.company, c.location].filter(Boolean).join(" • ") || "—"}</div>
                      <div className="pt-1 border-t border-border">
                        <LinksRow c={c} expanded={projectExpanded} setExpanded={setProjectExpanded} />
                      </div>
                      {projectExpanded === c.id && (
                        <div className="pt-2 border-t border-border">
                          <EvaluationPanel c={c} />
                        </div>
                      )}
                    </div>
                  ))}
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
              { key: "jd", label: "Upload a JD" },
              { key: "describe", label: "Describe what you need" },
              { key: "manual", label: "Manual skills" },
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
              <div
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
                className={`border-2 border-dashed rounded-md p-4 flex flex-col gap-3 transition-colors ${
                  jdDragOver ? "border-brand bg-brand-wash" : "border-border bg-page"
                }`}
              >
                <div>
                  <div className="text-[13px] font-bold">Attach a job description</div>
                  <div className="text-[11.5px] text-ink-muted mt-0.5">
                    Drag a JD file in, or paste the text — we&apos;ll pull out the role, skills, and location.
                  </div>
                </div>
                <div className="flex items-center gap-4 text-[12px]">
                  <label className="flex items-center gap-1.5">
                    <input type="radio" checked={jdInputMode === "file"} onChange={() => setJdInputMode("file")} /> Upload file
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="radio" checked={jdInputMode === "paste"} onChange={() => setJdInputMode("paste")} /> Paste text
                  </label>
                </div>
                {jdInputMode === "file" ? (
                  <div className="flex flex-col items-center justify-center gap-2 border border-border rounded-sm bg-surface py-6 px-4 text-center">
                    <Icon name="upload" className="w-5 h-5 text-ink-muted" />
                    {jdExtracting ? (
                      <div className="text-[12.5px] font-bold">Reading {jdFile?.name}…</div>
                    ) : jdFile ? (
                      <div className="text-[12.5px] font-bold">{jdFile.name}</div>
                    ) : (
                      <>
                        <div className="text-[12.5px]">
                          <span className="font-bold text-brand">Drag &amp; drop</span> a JD file here
                        </div>
                        <div className="text-[11px] text-ink-muted">or</div>
                      </>
                    )}
                    <label className="border border-border text-[12px] font-bold px-3 py-1.5 rounded-sm bg-page cursor-pointer">
                      {jdFile ? "Choose a different file" : "Browse files"}
                      <input
                        type="file"
                        accept=".pdf,.docx,.txt"
                        onChange={(e) => extractJdFile(e.target.files?.[0] || null)}
                        className="hidden"
                      />
                    </label>
                    <div className="text-[10.5px] text-ink-muted">PDF, DOCX, or TXT</div>
                  </div>
                ) : (
                  <textarea
                    className="input min-h-[160px]"
                    placeholder="Paste the full JD text here…"
                    value={jdText}
                    onChange={(e) => setJdText(e.target.value)}
                  />
                )}
                {jdExtractError && <div className="text-[12px] text-critical">{jdExtractError}</div>}
              </div>

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
                placeholder='e.g. "Search me a sales candidate who has experience selling feed additives and acidifiers in Mexico with 6+ years of experience"'
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
            <div className="border border-border rounded-md bg-surface p-8 text-center text-[13px] text-ink-muted">
              No matching profiles were indexed for this search. Try broadening the role, skills, or location.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="inline-flex bg-page rounded-sm p-1">
                  {VIEWS.map((v) => (
                    <button
                      key={v.key}
                      onClick={() => setView(v.key)}
                      className={`text-[12px] font-bold px-3 py-1.5 rounded-sm transition-colors inline-flex items-center gap-1.5 ${
                        view === v.key ? "bg-surface text-ink shadow-soft-sm" : "text-ink-muted"
                      }`}
                    >
                      <Icon name={v.icon} className="w-3.5 h-3.5" />
                      {v.label}
                    </button>
                  ))}
                </div>

                <div className="relative flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-[12px] font-medium text-ink-2 mr-1">
                    <input type="checkbox" checked={selected.size === candidates.length} onChange={toggleSelectAll} />
                    {selected.size > 0 ? `${selected.size} selected` : "Select all"}
                  </label>

                  <button
                    onClick={openAddToProject}
                    className="border border-border text-[12px] font-bold px-3 py-1.5 rounded-sm bg-surface inline-flex items-center gap-1.5"
                  >
                    <Icon name="briefcase" className="w-3.5 h-3.5" />
                    Add to Project
                  </button>
                  <button
                    onClick={() => {
                      setShowAddToProject(false);
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
                      setShowAddToProject(false);
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

                  {showAddToProject && (
                    <div className="absolute right-0 top-[calc(100%+6px)] z-20 bg-surface border border-border rounded-md shadow-soft p-3 flex flex-col gap-2.5 w-[300px]">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Add to Project</span>
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
                          <input className="input" value={newListName} onChange={(e) => setNewListName(e.target.value)} placeholder="e.g. Q3 Sales pipeline" />
                        </label>
                      )}
                      <button
                        onClick={submitAddToProject}
                        disabled={busyAction}
                        className="bg-brand text-white text-[12.5px] font-bold px-3 py-1.5 rounded-sm disabled:opacity-50"
                      >
                        {busyAction ? "Adding…" : `Add ${selectedOrAllCandidates().length} candidate(s)`}
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
                />
              )}
              {view === "cards" && (
                <CardsView rows={pageRows} selected={selected} onToggle={toggleSelected} expanded={expanded} setExpanded={setExpanded} />
              )}
              {view === "compact" && (
                <CompactView rows={pageRows} selected={selected} onToggle={toggleSelected} expanded={expanded} setExpanded={setExpanded} />
              )}
              {view === "split" && (
                <SplitView rows={pageRows} selected={selected} onToggle={toggleSelected} activeId={activeCandidate?.id || null} setActiveId={setActiveId} active={activeCandidate} />
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

function LinksRow({ c, expanded, setExpanded }: { c: Candidate; expanded: string | null; setExpanded: (id: string | null) => void }) {
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
    </div>
  );
}

function EvaluationPanel({ c, cols }: { c: Candidate; cols?: number }) {
  return (
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
  );
}

function TableView({
  rows,
  selected,
  onToggle,
  expanded,
  setExpanded,
}: {
  rows: Candidate[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  expanded: string | null;
  setExpanded: (id: string | null) => void;
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
                  <LinksRow c={c} expanded={expanded} setExpanded={setExpanded} />
                </td>
              </tr>
              {expanded === c.id && (
                <tr className="border-b border-border bg-page/40">
                  <td colSpan={10} className="px-4 py-3.5">
                    <EvaluationPanel c={c} />
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

function CardsView({
  rows,
  selected,
  onToggle,
  expanded,
  setExpanded,
}: {
  rows: Candidate[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  expanded: string | null;
  setExpanded: (id: string | null) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {rows.map((c) => (
        <div key={c.id} className="border border-border rounded-md bg-surface p-3.5 shadow-soft-sm flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <input type="checkbox" checked={selected.has(c.id)} onChange={() => onToggle(c.id)} className="mt-1" />
              <div>
                <div className="font-bold text-ink text-[13.5px]">{c.name || "—"}</div>
                <div className="text-ink-muted text-[12px]">{c.designation || "—"}</div>
              </div>
            </div>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${scoreClass(c.match_score)}`}>{c.match_score ?? "—"}</span>
          </div>
          <div className="text-[12.5px] text-ink-2">{[c.company, c.location].filter(Boolean).join(" • ") || "—"}</div>
          <div className="text-[12px] text-ink-muted">{c.experience_years != null ? `${c.experience_years} yrs experience` : "Experience unknown"}</div>
          {(c.skills || []).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {(c.skills || []).slice(0, 4).map((s) => (
                <span key={s} className="bg-page text-ink-2 rounded-full px-2 py-0.5 text-[11px]">{s}</span>
              ))}
            </div>
          )}
          <div className="pt-1 border-t border-border">
            <LinksRow c={c} expanded={expanded} setExpanded={setExpanded} />
          </div>
          {expanded === c.id && (
            <div className="pt-2 border-t border-border">
              <EvaluationPanel c={c} cols={1} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function CompactView({
  rows,
  selected,
  onToggle,
  expanded,
  setExpanded,
}: {
  rows: Candidate[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  expanded: string | null;
  setExpanded: (id: string | null) => void;
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
              <LinksRow c={c} expanded={expanded} setExpanded={setExpanded} />
            </div>
          </div>
          {expanded === c.id && (
            <div className="px-4 py-3.5 bg-page/40">
              <EvaluationPanel c={c} />
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
}: {
  rows: Candidate[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  activeId: string | null;
  setActiveId: (id: string) => void;
  active: Candidate | null;
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
            </div>
            <div className="pt-2 border-t border-border">
              <EvaluationPanel c={active} cols={1} />
            </div>
          </div>
        ) : (
          <div className="text-ink-muted text-[13px]">Select a candidate on the left.</div>
        )}
      </div>
    </div>
  );
}
