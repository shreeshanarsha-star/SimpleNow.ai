"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import JobPostingDraftEditor, { type EditableJobPostingDraft } from "./JobPostingDraftEditor";

type Step = "upload" | "analyzing" | "review" | "submitting" | "results";

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

export default function PublicJobPostingForm() {
  const [step, setStep] = useState<Step>("upload");
  const [files, setFiles] = useState<File[]>([]);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<EditableJobPostingDraft[]>([]);
  const [results, setResults] = useState<FileResult[]>([]);

  const [email, setEmail] = useState("");
  const [verifySending, setVerifySending] = useState(false);
  const [verifySent, setVerifySent] = useState(false);
  const [verifyLink, setVerifyLink] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  function onFilesSelected(list: FileList | null) {
    if (!list) return;
    setFiles(Array.from(list).slice(0, MAX_FILES));
  }

  async function handleAnalyze() {
    setError(null);
    if (files.length === 0) {
      setError("Attach at least one job description (PDF or Word).");
      return;
    }
    if (!termsAccepted) {
      setError("Please confirm you're authorized to post this role.");
      return;
    }

    setStep("analyzing");
    try {
      const form = new FormData();
      files.forEach((f) => form.append("files", f));
      const res = await fetch("/api/public/job-postings/analyze", { method: "POST", body: form });
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
      const res = await fetch("/api/public/job-postings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          termsAccepted: true,
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
      if (!res.ok) throw new Error(data.error || "Couldn't submit your postings.");
      setResults(data.results || []);
      setStep("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit your postings.");
      setStep("review");
    }
  }

  async function handleSendVerification() {
    setVerifyError(null);
    const ids = results.filter((r) => r.ok && r.id).map((r) => r.id as string);
    if (ids.length === 0 || !email) return;

    setVerifySending(true);
    try {
      const res = await fetch("/api/public/job-postings/send-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, jobPostingIds: ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't send the verification email.");
      setVerifySent(true);
      if (!data.emailSent) setVerifyLink(data.verifyLink || null);
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : "Couldn't send the verification email.");
    } finally {
      setVerifySending(false);
    }
  }

  function resetAll() {
    setStep("upload");
    setFiles([]);
    setDrafts([]);
    setResults([]);
    setTermsAccepted(false);
    setEmail("");
    setVerifySent(false);
    setVerifyLink(null);
  }

  if (step === "results") {
    const succeeded = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);

    return (
      <div className="max-w-2xl">
        <div className="border border-border rounded-md bg-surface p-5 shadow-soft-sm">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-full bg-good-wash text-good-text flex items-center justify-center shrink-0">
              <Icon name="check" className="w-4 h-4" />
            </div>
            <div className="text-[15px] font-bold">
              {succeeded.length} posting{succeeded.length === 1 ? "" : "s"} sent for approval
            </div>
          </div>
          <p className="text-[12.5px] text-ink-muted mb-4">
            Nothing goes live on the job board until an admin reviews and approves each one.
          </p>

          <ul className="flex flex-col gap-2 mb-4">
            {succeeded.map((r) => (
              <li key={r.fileName} className="text-[13px]">
                <span className="font-bold">{r.title}</span>
                {r.company && <span className="text-ink-muted"> — {r.company}</span>}
              </li>
            ))}
          </ul>

          {failed.length > 0 && (
            <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2 mb-4">
              {failed.map((r) => (
                <div key={r.fileName}>
                  {r.fileName}: {r.error}
                </div>
              ))}
            </div>
          )}

          {succeeded.length > 0 && !verifySent && (
            <div className="border-t border-border pt-4 mt-2">
              <div className="text-[12px] font-bold mb-1.5">Confirm your email (recommended)</div>
              <p className="text-[12px] text-ink-muted mb-2.5">
                Verifying your work email helps these postings get reviewed faster.
              </p>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="input flex-1"
                />
                <button
                  onClick={handleSendVerification}
                  disabled={verifySending || !email}
                  className="bg-brand text-white text-[12.5px] font-bold px-3.5 py-2 rounded-sm disabled:opacity-50 shrink-0"
                >
                  {verifySending ? "Sending…" : "Send verification"}
                </button>
              </div>
              {verifyError && <p className="text-[12px] text-critical mt-2">{verifyError}</p>}
            </div>
          )}

          {verifySent && (
            <div className="border-t border-border pt-4 mt-2 text-[12.5px]">
              <p className="text-good-text font-bold">Verification email sent.</p>
              {verifyLink && (
                <p className="text-ink-muted mt-1">
                  Email delivery isn&rsquo;t configured yet — use this link directly:{" "}
                  <a href={verifyLink} className="underline">
                    {verifyLink}
                  </a>
                </p>
              )}
            </div>
          )}

          <button
            onClick={resetAll}
            className="border border-border text-[12.5px] font-bold px-3.5 py-2 rounded-sm bg-surface mt-4"
          >
            Post more roles
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
            {isSubmitting ? "Posting…" : "Post for free"}
          </button>
          <button
            onClick={resetAll}
            className="border border-border text-[13px] font-bold px-4 py-2.5 rounded-sm bg-surface"
          >
            Start over
          </button>
        </div>
      </div>
    );
  }

  const isAnalyzing = step === "analyzing";

  return (
    <div className="max-w-2xl">
      <p className="text-[13px] text-ink-2 mb-5">
        Upload up to {MAX_FILES} job descriptions (PDF or Word) — AI structures each into a listing
        you can review and edit before posting. No account needed for your first 3 postings; sign in
        for unlimited posting.
      </p>

      {error && (
        <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2 mb-4">{error}</div>
      )}

      <div className="border border-dashed border-border rounded-md px-4 py-8 text-center bg-surface">
        <Icon name="upload" className="w-6 h-6 mx-auto mb-2 text-ink-muted" />
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

      <label className="flex items-start gap-2 mt-4 text-[12.5px] text-ink-2">
        <input
          type="checkbox"
          checked={termsAccepted}
          onChange={(e) => setTermsAccepted(e.target.checked)}
          className="mt-0.5"
        />
        <span>I confirm I&rsquo;m authorized to post this role and the information provided is accurate.</span>
      </label>

      <div className="flex gap-2 pt-4">
        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing}
          className="bg-brand text-white text-[13px] font-bold px-4 py-2.5 rounded-sm disabled:opacity-50 shadow-soft-sm"
        >
          {isAnalyzing ? "Analyzing with AI…" : "Analyze with AI"}
        </button>
      </div>
    </div>
  );
}
