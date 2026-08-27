"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import JobPostingDraftEditor, { type EditableJobPostingDraft } from "./JobPostingDraftEditor";
import { useRegisterToolHome } from "@/components/ToolHomeContext";

type Step = "upload" | "analyzing" | "review" | "submitting" | "done";

type FileResult = {
  fileName: string;
  ok: boolean;
  id?: string;
  title?: string;
  company?: string;
  error?: string;
};

const MAX_FILES = 10;

function toEditableDraft(raw: Record<string, unknown>): EditableJobPostingDraft {
  return {
    fileName: (raw.fileName as string) || "JD",
    title: (raw.title as string) || "",
    company: (raw.company as string) || "",
    company_url: (raw.company_url as string) || "",
    location: (raw.location as string) || "",
    mustHaveSkillsText: Array.isArray(raw.must_have_skills) ? (raw.must_have_skills as string[]).join(", ") : "",
    goodToHaveSkillsText: Array.isArray(raw.good_to_have_skills) ? (raw.good_to_have_skills as string[]).join(", ") : "",
    qualification: (raw.qualification as string) || "",
    minYearsExperience: raw.min_years_experience != null ? String(raw.min_years_experience) : "",
    industry: (raw.industry as string) || "",
    ctcBudget: (raw.ctc_budget as string) || "",
    rawJdText: (raw.rawJdText as string) || "",
    error: raw.error as string | undefined,
  };
}

export default function JobPostingsAiForm() {
  const [step, setStep] = useState<Step>("upload");

  // Topbar's clickable "Job Postings.ai" title (ToolHomeContext) restarts
  // the wizard from the upload step.
  useRegisterToolHome(useCallback(() => setStep("upload"), []));
  const [dragOver, setDragOver] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<EditableJobPostingDraft[]>([]);
  const [results, setResults] = useState<FileResult[]>([]);

  function onFilesSelected(list: FileList | null) {
    if (!list) return;
    setFiles(Array.from(list).slice(0, MAX_FILES));
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFiles(Array.from(e.dataTransfer.files).slice(0, MAX_FILES));
    }
  }

  async function handleAnalyze() {
    setError(null);
    if (files.length === 0) {
      setError("Drop or choose at least one job description (PDF or Word).");
      return;
    }

    setStep("analyzing");
    try {
      const form = new FormData();
      files.forEach((f) => form.append("files", f));
      const res = await fetch("/api/job-postings/analyze", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't analyze those files.");
      setDrafts((data.drafts || []).map(toEditableDraft));
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't analyze those files.");
      setStep("upload");
    }
  }

  async function handleSubmit() {
    setError(null);
    const validDrafts = drafts.filter((d) => !d.error);
    if (validDrafts.length === 0) {
      setError("Nothing to post.");
      return;
    }

    setStep("submitting");
    try {
      const res = await fetch("/api/job-postings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postings: validDrafts.map((d) => ({
            fileName: d.fileName,
            title: d.title,
            company: d.company,
            company_url: d.company_url,
            location: d.location,
            must_have_skills: d.mustHaveSkillsText.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 3),
            good_to_have_skills: d.goodToHaveSkillsText.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 3),
            qualification: d.qualification,
            min_years_experience: d.minYearsExperience ? Number(d.minYearsExperience) : null,
            industry: d.industry,
            ctc_budget: d.ctcBudget,
            raw_jd_text: d.rawJdText,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the posting(s).");
      setResults(data.results || []);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the posting(s).");
      setStep("review");
    }
  }

  function resetAll() {
    setStep("upload");
    setFiles([]);
    setDrafts([]);
    setResults([]);
    setError(null);
  }

  if (step === "done") {
    const succeeded = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);

    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
        <div className="w-11 h-11 rounded-full bg-good-wash text-good-text flex items-center justify-center">
          <Icon name="check" className="w-5 h-5" />
        </div>
        <h2 className="m-0 text-[18px] font-bold">
          {succeeded.length} posting{succeeded.length === 1 ? "" : "s"} sent for approval
        </h2>
        <p className="m-0 text-[13px] text-ink-muted max-w-sm">
          Waiting in the admin&rsquo;s approval queue — nothing goes live until it&rsquo;s
          approved there.
        </p>
        {failed.length > 0 && (
          <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2 max-w-sm text-left">
            {failed.map((r) => (
              <div key={r.fileName}>
                {r.fileName}: {r.error}
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2 pt-2">
          <Link
            href="/"
            className="bg-brand text-white text-[13px] font-bold px-4 py-2.5 rounded-sm shadow-soft-sm"
          >
            Back to Overview
          </Link>
          <button
            onClick={resetAll}
            className="border border-border text-[13px] font-bold px-4 py-2.5 rounded-sm bg-surface"
          >
            Post another role
          </button>
        </div>
      </div>
    );
  }

  if (step === "review" || step === "submitting") {
    const isSubmitting = step === "submitting";
    return (
      <div className="max-w-2xl">
        <p className="text-[13px] text-ink-2 mb-4">
          AI read your JD{drafts.length > 1 ? "s" : ""} — review and edit anything before posting.
        </p>

        {error && (
          <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2 mb-4">{error}</div>
        )}

        <div className="flex flex-col gap-3">
          {drafts.map((d, i) => (
            <JobPostingDraftEditor
              key={`${d.fileName}-${i}`}
              draft={d}
              onChange={(next) => setDrafts((prev) => prev.map((p, idx) => (idx === i ? next : p)))}
              onRemove={() => setDrafts((prev) => prev.filter((_, idx) => idx !== i))}
            />
          ))}
        </div>

        <div className="flex gap-2 pt-4">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || drafts.every((d) => !!d.error)}
            className="bg-brand text-white text-[13px] font-bold px-4 py-2.5 rounded-sm disabled:opacity-50 shadow-soft-sm"
          >
            {isSubmitting ? "Submitting…" : "Submit for approval"}
          </button>
          <button
            onClick={resetAll}
            className="border border-border text-[13px] font-bold px-4 py-2.5 rounded-sm bg-surface"
          >
            Start over
          </button>
        </div>

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

  const isAnalyzing = step === "analyzing";

  return (
    <div className="max-w-2xl">
      <p className="text-[13px] text-ink-2 mb-5">
        Drop a job description (PDF or Word) — AI structures it into a listing you
        can review and edit before it goes to the admin&rsquo;s approval queue.
      </p>

      {error && (
        <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2 mb-4">{error}</div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border border-dashed rounded-md px-4 py-8 text-center bg-surface transition-colors ${
          dragOver ? "border-brand bg-brand-wash" : "border-border"
        }`}
      >
        <Icon name="upload" className="w-6 h-6 mx-auto mb-2 text-ink-muted" />
        <p className="text-[13px] font-bold m-0">Drag & drop a JD here</p>
        <p className="text-[11.5px] text-ink-muted mt-1 mb-2">or</p>
        <label className="text-[13px] font-bold text-brand cursor-pointer">
          Choose files
          <input
            type="file"
            multiple
            accept=".pdf,.doc,.docx"
            className="hidden"
            onChange={(e) => onFilesSelected(e.target.files)}
          />
        </label>
        <p className="text-[11.5px] text-ink-muted mt-1.5">
          PDF or Word, up to 5MB each, up to {MAX_FILES} files
        </p>

        {files.length > 0 && (
          <ul className="mt-4 text-left text-[12.5px] text-ink-2 flex flex-col gap-1">
            {files.map((f) => (
              <li key={f.name}>{f.name}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex gap-2 pt-4">
        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing}
          className="bg-brand text-white text-[13px] font-bold px-4 py-2.5 rounded-sm disabled:opacity-50 shadow-soft-sm"
        >
          {isAnalyzing ? "Analyzing with AI…" : "Analyze with AI"}
        </button>
      </div>

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
