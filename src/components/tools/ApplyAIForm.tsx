"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";

type Job = {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  must_have_skills: string[] | null;
};

type SubMode = "auto" | "search";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

type ApplyResult = { jobId: string; jobTitle: string; company: string | null; matchScore: number };

// Apply.ai -- job-seeker-only, CV-first: upload your CV once, then either
// auto-apply (AI matches it against open listings and applies on your
// behalf) or search and pick specific ones. Recreated from the old
// askshree-app repo, connected to Job Postings.ai's AI-structured
// criteria via /api/apply's screenCandidate() call.
export default function ApplyAIForm({ jobs }: { jobs: Job[] }) {
  const [subMode, setSubMode] = useState<SubMode>("auto");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ApplyResult[]>([]);

  useEffect(() => {
    const jobId = new URLSearchParams(window.location.search).get("job");
    if (jobId && jobs.some((j) => j.id === jobId)) {
      setSubMode("search");
      setSelected([jobId]);
    }
  }, [jobs]);

  const filtered = jobs.filter((j) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      j.title.toLowerCase().includes(q) ||
      (j.location || "").toLowerCase().includes(q) ||
      (j.must_have_skills || []).some((s) => s.toLowerCase().includes(q))
    );
  });

  const canApply = !!resumeFile && termsAccepted;

  async function runApply(mode: "auto_apply" | "search", jobIds: string[]) {
    if (!resumeFile) {
      setStatus("Upload your CV first.");
      return;
    }
    if (!termsAccepted) {
      setStatus("Please accept the Terms & Conditions first.");
      return;
    }
    setBusy(true);
    setStatus("Reading your CV and matching against roles…");
    try {
      const base64 = await fileToBase64(resumeFile);
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeFile: { base64, mimeType: resumeFile.type, fileName: resumeFile.name },
          jobPostingIds: jobIds,
          mode,
          whatsappOptIn,
          termsAccepted,
        }),
      });
      const data = await res.json();
      if (data.locked) {
        setStatus(data.message);
        return;
      }
      if (!res.ok || data.error) {
        setStatus(data.error || "Couldn't submit your application.");
        return;
      }
      setResults(data.applied || []);
      setStatus(null);
    } catch {
      setStatus("Couldn't submit your application.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <p className="text-[13px] text-ink-2 mb-5">
        Upload your CV once — AI matches it against open roles here and applies on your
        behalf, or you can pick specific ones. A quick questionnaire confirms strong
        matches before the hiring team sees them.
      </p>

      <div className="border border-border rounded-md bg-surface p-5 shadow-soft-sm">
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setSubMode("auto")}
            className={`text-[12.5px] font-bold px-3 py-1.5 rounded-sm ${
              subMode === "auto" ? "bg-brand text-white" : "border border-border bg-page text-ink-muted"
            }`}
          >
            Auto-apply
          </button>
          <button
            onClick={() => setSubMode("search")}
            className={`text-[12.5px] font-bold px-3 py-1.5 rounded-sm ${
              subMode === "search" ? "bg-brand text-white" : "border border-border bg-page text-ink-muted"
            }`}
          >
            Search manually
          </button>
        </div>

        <label className="block border border-dashed border-border rounded-md px-4 py-6 text-center cursor-pointer bg-page">
          <Icon name="upload" className="w-5 h-5 mx-auto mb-2 text-ink-muted" />
          <span className="text-[12.5px] text-ink-2">
            {resumeFile ? resumeFile.name : "Drop your CV here, or click to upload (PDF or Word)"}
          </span>
          <input
            type="file"
            accept=".pdf,.doc,.docx"
            className="hidden"
            onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
          />
        </label>
        <p className="text-[11px] text-ink-muted mt-1.5">Your CV also joins our matching pool for future roles.</p>

        <label className="flex items-start gap-2 mt-4 text-[12.5px] text-ink-2">
          <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} className="mt-0.5" />
          <span>I accept the Terms &amp; Conditions.</span>
        </label>
        <label className="flex items-start gap-2 mt-2 text-[12.5px] text-ink-2">
          <input type="checkbox" checked={whatsappOptIn} onChange={(e) => setWhatsappOptIn(e.target.checked)} className="mt-0.5" />
          <span>Send me application updates via WhatsApp, if a number is found on my CV (optional).</span>
        </label>

        {status && (
          <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2 mt-4">{status}</div>
        )}

        {subMode === "auto" && (
          <div className="mt-4">
            <button
              onClick={() => runApply("auto_apply", [])}
              disabled={!canApply || busy}
              className="bg-brand text-white text-[13px] font-bold px-4 py-2.5 rounded-sm disabled:opacity-50 shadow-soft-sm"
            >
              {busy ? "Matching…" : "Find & apply for me"}
            </button>

            {results.length > 0 && (
              <ul className="flex flex-col gap-1.5 mt-4">
                {results.map((r) => (
                  <li
                    key={r.jobId}
                    className="border border-border rounded-md px-3 py-2 flex items-center justify-between text-[13px]"
                  >
                    <span>
                      <b>{r.jobTitle}</b>
                      {r.company && <span className="text-ink-muted"> — {r.company}</span>}
                    </span>
                    <span className="text-[11.5px] font-bold text-brand">Matched {r.matchScore}%</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {subMode === "search" && (
          <div className="mt-4">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, skill, or location"
              className="input"
            />

            {selected.length > 0 && (
              <button
                onClick={() => runApply("search", selected)}
                disabled={!canApply || busy}
                className="bg-brand text-white text-[13px] font-bold px-4 py-2.5 rounded-sm disabled:opacity-50 shadow-soft-sm mt-3"
              >
                {busy ? "Applying…" : `Apply to selected (${selected.length})`}
              </button>
            )}

            {results.length > 0 && (
              <ul className="flex flex-col gap-1.5 mt-3 mb-3">
                {results.map((r) => (
                  <li
                    key={r.jobId}
                    className="border border-border rounded-md px-3 py-2 flex items-center justify-between text-[13px]"
                  >
                    <span>
                      <b>{r.jobTitle}</b>
                      {r.company && <span className="text-ink-muted"> — {r.company}</span>}
                    </span>
                    <span className="text-[11.5px] font-bold text-brand">Matched {r.matchScore}%</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-col gap-2 mt-3">
              {filtered.map((j) => (
                <div key={j.id} className="border border-border rounded-md px-3 py-2.5 flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selected.includes(j.id)}
                    onChange={(e) =>
                      setSelected((s) => (e.target.checked ? [...s, j.id] : s.filter((x) => x !== j.id)))
                    }
                  />
                  <div className="flex-1">
                    <div className="text-[13px] font-bold">{j.title}</div>
                    <div className="text-[11.5px] text-ink-muted">
                      {j.company}
                      {j.location ? ` — ${j.location}` : ""}
                    </div>
                  </div>
                  <button
                    onClick={() => runApply("search", [j.id])}
                    disabled={!canApply || busy}
                    className="text-[12px] font-bold px-3 py-1.5 rounded-sm border border-border disabled:opacity-50"
                  >
                    Apply
                  </button>
                </div>
              ))}
              {filtered.length === 0 && (
                <p className="text-[13px] text-ink-muted mt-3">No open listings match yet.</p>
              )}
            </div>
          </div>
        )}
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
