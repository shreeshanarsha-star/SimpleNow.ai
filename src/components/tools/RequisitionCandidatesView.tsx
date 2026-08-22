"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { HScroller } from "@/components/Scroller";
import { STAGES, STAGE_LABEL } from "@/lib/talentStages";
import { rejectionReasonLabel } from "@/lib/talentRejectionReasons";
import RejectionReasonModal from "@/components/tools/RejectionReasonModal";
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
  rejection_reason: string | null;
  stage_entered_at: string | null;
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
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [noticePeriod, setNoticePeriod] = useState("");
  const [ctcMin, setCtcMin] = useState("");
  const [ctcMax, setCtcMax] = useState("");
  const [stageFilter, setStageFilter] = useState(initialStage);
  const [staleOnly, setStaleOnly] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [movingId, setMovingId] = useState<string | null>(null);
  const [rejectModalFor, setRejectModalFor] = useState<{ id: string; name: string } | null>(null);

  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

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
        const hay = `${c.name} ${c.resume_text || ""} ${(c.tags || []).join(" ")}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      if (phone && !(c.phone || "").toLowerCase().includes(phone.toLowerCase())) return false;
      if (email && !(c.email || "").toLowerCase().includes(email.toLowerCase())) return false;
      if (company && !(c.current_company || "").toLowerCase().includes(company.toLowerCase())) return false;
      if (location && !(c.current_location || "").toLowerCase().includes(location.toLowerCase())) return false;
      if (noticePeriod && !(c.notice_period || "").toLowerCase().includes(noticePeriod.toLowerCase())) return false;
      if (ctcMin && (c.expected_ctc == null || c.expected_ctc < Number(ctcMin))) return false;
      if (ctcMax && (c.expected_ctc == null || c.expected_ctc > Number(ctcMax))) return false;
      return true;
    });
  }, [candidates, q, phone, email, company, location, noticePeriod, ctcMin, ctcMax, stageFilter, staleOnly]);

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

  async function handleResumeFile(file: File | null) {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
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
          autoParse: true,
          source: "sourced",
        }),
      });
      const addData = await addRes.json();
      if (!addRes.ok) throw new Error(addData.error || "Could not add candidate.");
      await load();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Could not add candidate.");
    } finally {
      setUploading(false);
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

  function exportRows() {
    return selectedIds.size > 0 ? filtered.filter((c) => selectedIds.has(c.id)) : filtered;
  }

  const EXPORT_COLUMNS = [
    "Name",
    "Experience",
    "Current company",
    "Current location",
    "Current CTC",
    "Expected CTC",
    "Qualification",
    "Notice period",
    "Stage",
    "Email",
    "Phone",
    "LinkedIn",
  ];
  function rowToArray(c: Candidate) {
    return [
      c.name,
      c.experience_years != null ? `${c.experience_years} yrs` : "",
      c.current_company || "",
      c.current_location || "",
      fmtCtc(c.current_ctc),
      fmtCtc(c.expected_ctc),
      c.qualification || "",
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
        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            className="text-[11.5px] font-semibold px-3 py-1.5 border border-border rounded-md hover:border-brand"
          >
            Export CSV
          </button>
          <button
            onClick={exportExcel}
            disabled={exporting === "xlsx"}
            className="text-[11.5px] font-semibold px-3 py-1.5 border border-border rounded-md hover:border-brand disabled:opacity-50"
          >
            {exporting === "xlsx" ? "Exporting…" : "Export Excel"}
          </button>
          <button
            onClick={exportPdf}
            disabled={exporting === "pdf"}
            className="text-[11.5px] font-semibold px-3 py-1.5 border border-border rounded-md hover:border-brand disabled:opacity-50"
          >
            {exporting === "pdf" ? "Exporting…" : "Export PDF"}
          </button>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap items-stretch border border-border rounded-lg p-3 bg-surface">
        <div className="flex-1 min-w-[300px] grid grid-cols-2 sm:grid-cols-4 gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Keyword / name" className="input" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="input" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="input" />
          <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Current company" className="input" />
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location" className="input" />
          <input value={noticePeriod} onChange={(e) => setNoticePeriod(e.target.value)} placeholder="Notice period" className="input" />
          <input value={ctcMin} onChange={(e) => setCtcMin(e.target.value)} placeholder="Expected CTC min" type="number" className="input" />
          <input value={ctcMax} onChange={(e) => setCtcMax(e.target.value)} placeholder="Expected CTC max" type="number" className="input" />
          <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="input col-span-2">
            <option value="all">All stages</option>
            {STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-[12px] text-ink-2 px-1">
            <input type="checkbox" checked={staleOnly} onChange={(e) => setStaleOnly(e.target.checked)} />
            Stale only
          </label>
          {(q || phone || email || company || location || noticePeriod || ctcMin || ctcMax || stageFilter !== "all" || staleOnly) && (
            <button
              onClick={() => {
                setQ(""); setPhone(""); setEmail(""); setCompany(""); setLocation("");
                setNoticePeriod(""); setCtcMin(""); setCtcMax(""); setStageFilter("all"); setStaleOnly(false);
              }}
              className="text-[11px] font-semibold text-ink-muted hover:text-brand self-center"
            >
              Clear filters
            </button>
          )}
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleResumeFile(file);
          }}
          onClick={() => document.getElementById("req-candidate-resume-input")?.click()}
          className={`w-full sm:w-[220px] flex-shrink-0 border-2 border-dashed rounded-md px-3 py-3 text-center cursor-pointer transition-colors flex items-center justify-center ${
            dragOver ? "border-brand bg-brand-wash" : "border-border bg-page"
          }`}
        >
          <input
            id="req-candidate-resume-input"
            type="file"
            accept=".pdf,.docx,.txt"
            className="hidden"
            onChange={(e) => handleResumeFile(e.target.files?.[0] || null)}
          />
          {uploading ? (
            <p className="m-0 text-[12px] text-ink-muted">Adding candidate…</p>
          ) : (
            <p className="m-0 text-[12px] text-ink-muted">
              Drag &amp; drop a resume to <span className="text-brand font-bold underline">add a candidate</span>
            </p>
          )}
        </div>
      </div>
      {uploadError && <div className="bg-critical-wash text-critical text-[12px] rounded-sm px-3 py-2">{uploadError}</div>}

      <div className="text-[11.5px] text-ink-muted">
        {filtered.length} of {candidates.length} candidate{candidates.length === 1 ? "" : "s"}
        {selectedIds.size > 0 && ` · ${selectedIds.size} selected`}
      </div>

      <HScroller>
        <table className="w-full border-collapse text-[12px] min-w-[1200px]">
          <thead>
            <tr className="text-left text-ink-muted border-b border-border">
              <th className="px-2 py-2 w-8">
                <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
              </th>
              <th className="px-2 py-2 font-semibold">Candidate name</th>
              <th className="px-2 py-2 font-semibold">Experience</th>
              <th className="px-2 py-2 font-semibold">Current company</th>
              <th className="px-2 py-2 font-semibold">Current location</th>
              <th className="px-2 py-2 font-semibold">Current CTC</th>
              <th className="px-2 py-2 font-semibold">Expected CTC</th>
              <th className="px-2 py-2 font-semibold">Qualification</th>
              <th className="px-2 py-2 font-semibold">Notice period</th>
              <th className="px-2 py-2 font-semibold">LinkedIn</th>
              <th className="px-2 py-2 font-semibold">Days in stage</th>
              <th className="px-2 py-2 font-semibold">Action</th>
              <th className="px-2 py-2 font-semibold">Rejection reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={11} className="px-2 py-8 text-center text-ink-muted">
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
                <td className="px-2 py-2 tabular-nums">{c.experience_years != null ? `${c.experience_years} yrs` : "—"}</td>
                <td className="px-2 py-2">{c.current_company || "—"}</td>
                <td className="px-2 py-2">{c.current_location || "—"}</td>
                <td className="px-2 py-2 tabular-nums">{fmtCtc(c.current_ctc)}</td>
                <td className="px-2 py-2 tabular-nums">{fmtCtc(c.expected_ctc)}</td>
                <td className="px-2 py-2">{c.qualification || "—"}</td>
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
