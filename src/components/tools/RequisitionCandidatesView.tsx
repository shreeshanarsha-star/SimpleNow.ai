"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Icon from "@/components/Icon";
import { HScroller } from "@/components/Scroller";
import { STAGES, STAGE_LABEL } from "@/lib/talentStages";
import { rejectionReasonLabel } from "@/lib/talentRejectionReasons";
import RejectionReasonModal from "@/components/tools/RejectionReasonModal";
import RequisitionTabs from "@/components/tools/RequisitionTabs";
import { daysSince, isStale } from "@/lib/talentSla";

type Candidate = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  stage: string;
  tags: string[] | null;
  current_company: string | null;
  current_location: string | null;
  current_ctc: number | null;
  expected_ctc: number | null;
  qualification: string | null;
  notice_period: string | null;
  linkedin_url: string | null;
  experience_years: number | null;
  resume_text: string | null;
  match_score: number | null;
  match_score_note: string | null;
  rejection_reason: string | null;
  stage_entered_at: string | null;
  linked_offer: { id: string; status: string } | null;
  created_at: string;
};

type Requisition = {
  id: string;
  req_no: string;
  title: string;
  location: string | null;
  department: string | null;
  talent_candidates: Candidate[];
};

function reqLabel(r: { req_no?: string; title: string; location?: string | null }) {
  const suffix = r.location ? `${r.title}-${r.location}` : r.title;
  return r.req_no ? `${r.req_no} ${suffix}` : suffix;
}

function fmtCtc(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString("en-IN");
}

export default function RequisitionCandidatesView({ requisitionId }: { requisitionId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialStage = searchParams.get("stage") || "all";

  const [requisition, setRequisition] = useState<Requisition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [ctcMin, setCtcMin] = useState("");
  const [ctcMax, setCtcMax] = useState("");
  const [stageFilter, setStageFilter] = useState(initialStage);
  const [staleOnly, setStaleOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [movingId, setMovingId] = useState<string | null>(null);
  const [rejectModalFor, setRejectModalFor] = useState<{ id: string; name: string } | null>(null);
  const [bulkStage, setBulkStage] = useState("");
  const [bulkMoving, setBulkMoving] = useState(false);
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState<string | null>(null);

  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [uploadFailures, setUploadFailures] = useState<{ name: string; message: string }[]>([]);
  const [exporting, setExporting] = useState<string | null>(null);
  const [scoring, setScoring] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);

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

  const candidates = useMemo(() => requisition?.talent_candidates || [], [requisition]);

  const filtered = useMemo(() => {
    return candidates.filter((c) => {
      if (stageFilter !== "all" && c.stage !== stageFilter) return false;
      if (staleOnly && !isStale(c.stage, daysSince(c.stage_entered_at))) return false;
      if (q) {
        const hay = [
          c.name,
          c.email,
          c.phone,
          c.current_company,
          c.current_location,
          c.notice_period,
          c.qualification,
          c.resume_text,
          ...(c.tags || []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      if (ctcMin && (c.expected_ctc == null || c.expected_ctc < Number(ctcMin))) return false;
      if (ctcMax && (c.expected_ctc == null || c.expected_ctc > Number(ctcMax))) return false;
      return true;
    });
  }, [candidates, q, ctcMin, ctcMax, stageFilter, staleOnly]);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      if (filtered.every((c) => prev.has(c.id)) && filtered.length > 0) return new Set();
      return new Set(filtered.map((c) => c.id));
    });
  }

  // Adds one resume: parse it, then create the candidate record. Throws on
  // failure so the batch runner below can attribute the error to this file
  // by name instead of losing track of which upload failed.
  async function addOneResume(file: File) {
    const form = new FormData();
    form.append("file", file);
    const parseRes = await fetch("/api/talent-ai/candidates/parse-resume", { method: "POST", body: form });
    const parseData = await parseRes.json();
    if (!parseRes.ok) throw new Error(parseData.error || "Could not read that resume.");

    const addRes = await fetch("/api/talent-ai/candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requisitionId,
        resumeText: parseData.text,
        resumeFilePath: parseData.filePath || null,
        resumeFileName: parseData.fileName || null,
        autoParse: true,
        source: "sourced",
      }),
    });
    const addData = await addRes.json();
    if (!addRes.ok) throw new Error(addData.error || "Could not add candidate.");
  }

  // Handles both a single drag-and-drop resume and a bulk drop of many at
  // once (e.g. sourcing 100 resumes for a requisition in one go). Files are
  // processed one at a time -- not Promise.all -- so a batch of 100 doesn't
  // fire 100 concurrent parse+create requests and get rate-limited or time
  // out; each file's success/failure is tracked independently so one bad
  // resume (corrupt PDF, unsupported format) doesn't lose the other 99.
  async function handleResumeFiles(fileList: FileList | File[] | null) {
    const files = fileList ? Array.from(fileList) : [];
    if (files.length === 0) return;
    setUploading(true);
    setUploadError(null);
    setUploadFailures([]);
    setUploadProgress({ done: 0, total: files.length });

    const failures: { name: string; message: string }[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        await addOneResume(file);
      } catch (err) {
        failures.push({ name: file.name, message: err instanceof Error ? err.message : "Could not add candidate." });
      }
      setUploadProgress({ done: i + 1, total: files.length });
    }

    await load();
    setUploading(false);
    setUploadFailures(failures);
    if (failures.length > 0) {
      setUploadError(
        files.length === 1
          ? failures[0].message
          : `Added ${files.length - failures.length} of ${files.length}. ${failures.length} failed -- see details below.`
      );
    }
  }

  async function moveStage(id: string, stage: string, rejectionReason?: string) {
    setMovingId(id);
    try {
      const res = await fetch(`/api/talent-ai/candidates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rejectionReason ? { stage, rejectionReason } : { stage }),
      });
      if (res.ok) await load();
    } finally {
      setMovingId(null);
    }
  }

  async function bulkMoveStage(stage: string, rejectionReason?: string) {
    setBulkMoving(true);
    try {
      const ids = Array.from(selectedIds);
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/talent-ai/candidates/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(rejectionReason ? { stage, rejectionReason } : { stage }),
          })
        )
      );
      await load();
      setSelectedIds(new Set());
      setBulkStage("");
    } finally {
      setBulkMoving(false);
    }
  }

  async function sendBulkEmailToSelected() {
    setEmailSending(true);
    setEmailResult(null);
    try {
      const res = await fetch("/api/talent-ai/mass-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateIds: Array.from(selectedIds),
          subject: emailSubject,
          html: emailBody.replace(/\n/g, "<br/>"),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not send email.");
      setEmailResult(`Sent to ${data.sent?.length || 0} of ${selectedIds.size} selected${data.skippedNoEmail ? ` (${data.skippedNoEmail} had no email on file)` : ""}.`);
    } catch (err) {
      setEmailResult(err instanceof Error ? err.message : "Could not send email.");
    } finally {
      setEmailSending(false);
    }
  }

  function exportRows() {
    return selectedIds.size > 0 ? filtered.filter((c) => selectedIds.has(c.id)) : filtered;
  }

  const EXPORT_COLUMNS = [
    "Name",
    "Matching score",
    "Experience",
    "Qualification",
    "Current company",
    "Current location",
    "Current CTC",
    "Expected CTC",
    "Notice period",
    "Stage",
    "Email",
    "Phone",
    "LinkedIn",
  ];
  function rowToArray(c: Candidate) {
    return [
      c.name,
      c.match_score != null ? `${c.match_score}%` : "",
      c.experience_years != null ? `${c.experience_years} yrs` : "",
      c.qualification || "",
      c.current_company || "",
      c.current_location || "",
      fmtCtc(c.current_ctc),
      fmtCtc(c.expected_ctc),
      c.notice_period || "",
      STAGE_LABEL[c.stage] || c.stage,
      c.email || "",
      c.phone || "",
      c.linkedin_url || "",
    ];
  }

  function exportCsv() {
    const rows = exportRows();
    const csv = [EXPORT_COLUMNS, ...rows.map(rowToArray)]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    downloadBlob(csv, `${requisition?.req_no || "candidates"}.csv`, "text/csv");
  }

  async function exportExcel() {
    setExporting("xlsx");
    try {
      const XLSX = await import("xlsx");
      const rows = exportRows();
      const ws = XLSX.utils.aoa_to_sheet([EXPORT_COLUMNS, ...rows.map(rowToArray)]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Candidates");
      XLSX.writeFile(wb, `${requisition?.req_no || "candidates"}.xlsx`);
    } finally {
      setExporting(null);
    }
  }

  async function exportPdf() {
    setExporting("pdf");
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const rows = exportRows();
      const doc = new jsPDF({ orientation: "landscape" });
      doc.setFontSize(12);
      doc.text(requisition ? reqLabel(requisition) : "Candidates", 14, 12);
      autoTable(doc, {
        head: [EXPORT_COLUMNS],
        body: rows.map(rowToArray),
        startY: 18,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 30, 30] },
      });
      doc.save(`${requisition?.req_no || "candidates"}.pdf`);
    } finally {
      setExporting(null);
    }
  }

  async function scoreCandidates() {
    setScoring(true);
    setScoreError(null);
    try {
      const res = await fetch(`/api/talent-ai/requisitions/${requisitionId}/score-candidates`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not score candidates.");
      await load();
    } catch (err) {
      setScoreError(err instanceof Error ? err.message : "Could not score candidates.");
    } finally {
      setScoring(false);
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

  const allSelected = filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));
  const unscoredCount = candidates.filter((c) => c.resume_text && c.match_score == null).length;

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
        <div className="flex items-center gap-3">
          <button
            onClick={exportCsv}
            title="Export CSV"
            aria-label="Export CSV"
            className="p-2.5 border border-border rounded-md hover:border-brand hover:text-brand text-ink-2"
          >
            <Icon name="grid" className="w-4 h-4" />
          </button>
          <button
            onClick={exportExcel}
            disabled={exporting === "xlsx"}
            title="Export Excel"
            aria-label="Export Excel"
            className="p-2.5 border border-border rounded-md hover:border-brand hover:text-brand text-ink-2 disabled:opacity-50"
          >
            <Icon name="chart" className={`w-4 h-4 ${exporting === "xlsx" ? "animate-pulse" : ""}`} />
          </button>
          <button
            onClick={exportPdf}
            disabled={exporting === "pdf"}
            title="Export PDF"
            aria-label="Export PDF"
            className="p-2.5 border border-border rounded-md hover:border-brand hover:text-brand text-ink-2 disabled:opacity-50"
          >
            <Icon name="book" className={`w-4 h-4 ${exporting === "pdf" ? "animate-pulse" : ""}`} />
          </button>
          {unscoredCount > 0 && (
            <button
              onClick={scoreCandidates}
              disabled={scoring}
              className="text-[11.5px] font-semibold px-3 py-2 border border-border rounded-md hover:border-brand hover:text-brand text-ink-2 disabled:opacity-50 flex items-center gap-1.5"
            >
              <Icon name="sparkle" className={`w-3.5 h-3.5 ${scoring ? "animate-pulse" : ""}`} />
              {scoring ? "Scoring…" : `Score ${unscoredCount} candidate${unscoredCount === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
      </div>

      {scoreError && <div className="bg-critical-wash text-critical text-[12px] rounded-sm px-3 py-2">{scoreError}</div>}

      <RequisitionTabs requisitionId={requisitionId} active="candidates" />

      <div className="flex gap-3 flex-wrap items-stretch">
        <div className="flex-1 min-w-[280px] border border-border rounded-lg bg-surface flex flex-col">
          <div className="flex items-center gap-2 px-3 py-2">
            <Icon name="search" className="w-4 h-4 text-ink-muted flex-shrink-0" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, email, phone, company, location, skills…"
              className="flex-1 bg-transparent outline-none text-[13px] text-ink placeholder:text-ink-muted"
            />
            {q && (
              <button onClick={() => setQ("")} className="text-ink-muted hover:text-ink flex-shrink-0" aria-label="Clear search">
                <Icon name="x" className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 px-3 py-2 border-t border-border flex-wrap">
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="bg-transparent outline-none text-[12px] font-semibold text-ink-2 border border-border rounded-sm px-2 py-1"
            >
              <option value="all">All stages</option>
              {STAGES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>

            <label className="flex items-center gap-1.5 text-[12px] text-ink-2">
              <input type="checkbox" checked={staleOnly} onChange={(e) => setStaleOnly(e.target.checked)} />
              Stale only
            </label>

            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`flex items-center gap-1 text-[12px] font-semibold px-2 py-1 rounded-sm ${
                showFilters || ctcMin || ctcMax ? "text-brand bg-brand-wash" : "text-ink-2 hover:text-brand"
              }`}
            >
              CTC range
              <Icon name="chevronLeft" className={`w-3 h-3 transition-transform ${showFilters ? "-rotate-90" : "rotate-180"}`} />
            </button>

            {(q || ctcMin || ctcMax || stageFilter !== "all" || staleOnly) && (
              <button
                onClick={() => {
                  setQ(""); setCtcMin(""); setCtcMax(""); setStageFilter("all"); setStaleOnly(false);
                }}
                className="text-[11.5px] font-semibold text-ink-muted hover:text-brand ml-auto"
              >
                Clear all
              </button>
            )}
          </div>

          {showFilters && (
            <div className="flex items-center gap-2 px-3 py-2 border-t border-border">
              <span className="text-[11.5px] font-semibold text-ink-muted">Expected CTC</span>
              <input
                value={ctcMin}
                onChange={(e) => setCtcMin(e.target.value)}
                placeholder="Min"
                type="number"
                className="input py-1 text-[12px] w-[100px]"
              />
              <span className="text-ink-muted text-[12px]">–</span>
              <input
                value={ctcMax}
                onChange={(e) => setCtcMax(e.target.value)}
                placeholder="Max"
                type="number"
                className="input py-1 text-[12px] w-[100px]"
              />
            </div>
          )}
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleResumeFiles(e.dataTransfer.files);
          }}
          onClick={() => document.getElementById("req-candidate-resume-input")?.click()}
          className={`w-full sm:w-[210px] flex-shrink-0 border rounded-lg px-4 py-3 text-center cursor-pointer transition-colors flex flex-col items-center justify-center gap-1.5 ${
            dragOver ? "border-brand bg-brand-wash" : "border-border bg-surface hover:border-brand/60"
          }`}
        >
          <input
            id="req-candidate-resume-input"
            type="file"
            accept=".pdf,.docx,.txt"
            multiple
            className="hidden"
            onChange={(e) => handleResumeFiles(e.target.files)}
          />
          {uploading && uploadProgress ? (
            <p className="m-0 text-[12px] text-ink-muted">
              Adding {uploadProgress.done} of {uploadProgress.total}…
            </p>
          ) : (
            <>
              <Icon name="upload" className="w-4 h-4 text-brand" />
              <p className="m-0 text-[12px] leading-snug">
                <span className="text-brand font-bold">Add candidates</span>
                <br />
                <span className="text-ink-muted">Drag & drop one or many resumes</span>
              </p>
            </>
          )}
        </div>
      </div>
      {uploadError && (
        <div className="bg-critical-wash text-critical text-[12px] rounded-sm px-3 py-2 flex flex-col gap-1">
          <span>{uploadError}</span>
          {uploadFailures.length > 0 && (
            <ul className="m-0 pl-4 list-disc">
              {uploadFailures.map((f, i) => (
                <li key={i}>
                  <span className="font-semibold">{f.name}</span>: {f.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="text-[11.5px] text-ink-muted">
        {filtered.length} of {candidates.length} candidate{candidates.length === 1 ? "" : "s"}
        {selectedIds.size > 0 && ` · ${selectedIds.size} selected`}
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap border border-border rounded-lg p-2.5 bg-surface">
          <span className="text-[11.5px] font-semibold text-ink">{selectedIds.size} selected —</span>
          <select
            value={bulkStage}
            disabled={bulkMoving}
            onChange={(e) => {
              const v = e.target.value;
              setBulkStage(v);
              if (!v) return;
              if (v === "rejected") setBulkRejectOpen(true);
              else bulkMoveStage(v);
            }}
            className="input py-1 text-[11.5px] w-auto"
          >
            <option value="">Move to stage…</option>
            {STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              setEmailSubject("");
              setEmailBody("");
              setEmailResult(null);
              setEmailModalOpen(true);
            }}
            className="text-[11.5px] font-semibold px-3 py-1.5 border border-border rounded-md hover:border-brand"
          >
            Email selected
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="text-[11.5px] font-semibold text-ink-muted ml-auto">
            Clear selection
          </button>
        </div>
      )}

      <HScroller>
        <table className="w-full border-collapse text-[12px] min-w-[1200px]">
          <thead>
            <tr className="text-left text-ink-muted border-b border-border">
              <th className="px-2 py-2 w-8">
                <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
              </th>
              <th className="px-2 py-2 font-semibold">Candidate name</th>
              <th className="px-2 py-2 font-semibold">Matching score</th>
              <th className="px-2 py-2 font-semibold">Experience</th>
              <th className="px-2 py-2 font-semibold">Qualification</th>
              <th className="px-2 py-2 font-semibold">Current company</th>
              <th className="px-2 py-2 font-semibold">Current location</th>
              <th className="px-2 py-2 font-semibold">Current CTC</th>
              <th className="px-2 py-2 font-semibold">Expected CTC</th>
              <th className="px-2 py-2 font-semibold">Notice period</th>
              <th className="px-2 py-2 font-semibold">LinkedIn</th>
              <th className="px-2 py-2 font-semibold">Days in stage</th>
              <th className="px-2 py-2 font-semibold">Action</th>
              <th className="px-2 py-2 font-semibold">Offer.ai</th>
              <th className="px-2 py-2 font-semibold">Rejection reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={15} className="px-2 py-8 text-center text-ink-muted">
                  No candidates match these filters.
                </td>
              </tr>
            )}
            {filtered.map((c) => (
              <tr key={c.id}>
                <td className="px-2 py-2">
                  <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelected(c.id)} />
                </td>
                <td className="px-2 py-2">
                  <Link href={`/tools/talent-ai/candidates/${c.id}`} className="font-bold text-ink hover:text-brand hover:underline">
                    {c.name}
                  </Link>
                  <div className="text-[10.5px] text-ink-muted">{c.email || c.phone || ""}</div>
                </td>
                <td className="px-2 py-2">
                  {c.match_score != null ? (
                    <span
                      title={c.match_score_note || undefined}
                      className={`inline-flex items-center gap-1 font-bold rounded-sm px-1.5 py-0.5 text-[11px] tabular-nums ${
                        c.match_score >= 70
                          ? "bg-good-wash text-good"
                          : c.match_score >= 40
                          ? "bg-warning-wash text-warning"
                          : "bg-critical-wash text-critical"
                      }`}
                    >
                      {c.match_score}%
                    </span>
                  ) : c.resume_text ? (
                    <span className="text-ink-muted text-[11px]">Not scored</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-2 py-2 tabular-nums">{c.experience_years != null ? `${c.experience_years} yrs` : "—"}</td>
                <td className="px-2 py-2">{c.qualification || "—"}</td>
                <td className="px-2 py-2">{c.current_company || "—"}</td>
                <td className="px-2 py-2">{c.current_location || "—"}</td>
                <td className="px-2 py-2 tabular-nums">{fmtCtc(c.current_ctc)}</td>
                <td className="px-2 py-2 tabular-nums">{fmtCtc(c.expected_ctc)}</td>
                <td className="px-2 py-2">{c.notice_period || "—"}</td>
                <td className="px-2 py-2">
                  {c.linkedin_url ? (
                    <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="text-brand font-semibold hover:underline">
                      Profile
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-2 py-2">
                  {(() => {
                    const days = daysSince(c.stage_entered_at);
                    const stale = isStale(c.stage, days);
                    if (days == null) return <span className="text-ink-muted">—</span>;
                    if (!stale) return <span className="text-ink-muted">{days}d</span>;
                    return (
                      <span className="inline-flex items-center gap-1 bg-critical-wash text-critical font-semibold rounded-sm px-1.5 py-0.5 text-[10.5px]">
                        {days}d stale
                      </span>
                    );
                  })()}
                </td>
                <td className="px-2 py-2">
                  <select
                    value={c.stage}
                    disabled={movingId === c.id}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "rejected") setRejectModalFor({ id: c.id, name: c.name });
                      else moveStage(c.id, v);
                    }}
                    className="input py-1 text-[11.5px]"
                  >
                    {STAGES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-2">
                  {c.stage !== "offer" ? (
                    <span className="text-ink-muted">—</span>
                  ) : c.linked_offer ? (
                    <Link href="/tools/offer-ai" className="text-brand font-semibold hover:underline">
                      {c.linked_offer.status.replace(/_/g, " ")}
                    </Link>
                  ) : (
                    <Link
                      href={`/tools/offer-ai?candidateName=${encodeURIComponent(c.name)}&candidateEmail=${encodeURIComponent(c.email || "")}&roleTitle=${encodeURIComponent(requisition.title)}&proposedCtc=${encodeURIComponent(c.expected_ctc != null ? String(c.expected_ctc) : "")}&talentCandidateId=${encodeURIComponent(c.id)}`}
                      className="text-brand font-semibold hover:underline"
                    >
                      Create offer
                    </Link>
                  )}
                </td>
                <td className="px-2 py-2 text-[11.5px] text-ink-muted">
                  {c.stage === "rejected" ? rejectionReasonLabel(c.rejection_reason) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </HScroller>

      {rejectModalFor && (
        <RejectionReasonModal
          candidateName={rejectModalFor.name}
          onCancel={() => setRejectModalFor(null)}
          onConfirm={async (reasonId) => {
            await moveStage(rejectModalFor.id, "rejected", reasonId);
            setRejectModalFor(null);
          }}
        />
      )}

      {bulkRejectOpen && (
        <RejectionReasonModal
          candidateName={`${selectedIds.size} candidates`}
          onCancel={() => {
            setBulkRejectOpen(false);
            setBulkStage("");
          }}
          onConfirm={async (reasonId) => {
            await bulkMoveStage("rejected", reasonId);
            setBulkRejectOpen(false);
          }}
        />
      )}

      {emailModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setEmailModalOpen(false)}>
          <div
            className="bg-surface border border-border rounded-lg p-4 w-full max-w-md shadow-soft flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[13px] font-bold text-ink">Email {selectedIds.size} selected candidate{selectedIds.size === 1 ? "" : "s"}</div>
            <div>
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted mb-1">Subject</div>
              <input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} className="input" />
            </div>
            <div>
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted mb-1">Message</div>
              <textarea
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                rows={6}
                className="input"
              />
            </div>
            {emailResult && <div className="text-[11.5px] text-ink-2">{emailResult}</div>}
            <div className="flex items-center justify-end gap-2 mt-1">
              <button onClick={() => setEmailModalOpen(false)} className="text-[12px] font-semibold text-ink-muted px-3 py-1.5">
                Close
              </button>
              <button
                onClick={sendBulkEmailToSelected}
                disabled={emailSending || !emailSubject.trim() || !emailBody.trim()}
                className="text-[12px] font-bold text-white bg-brand px-3 py-1.5 rounded-sm disabled:opacity-50"
              >
                {emailSending ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
