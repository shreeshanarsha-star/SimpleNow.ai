"use client";

import { useState } from "react";
import Icon from "@/components/Icon";

type Criteria = {
  role_title: string;
  min_years_experience: number | null;
  ctc_budget: string | null;
  must_have_skills: string[];
  good_to_have_skills: string[];
  other_notes: string | null;
};

type CandidateDraft = { name: string; resumeText: string };

type ScoredCandidate = {
  candidate_name: string | null;
  fit_score?: number;
  met_skills?: string[];
  missing_skills?: string[];
  justification?: string;
  red_flags?: string[];
  achievement?: string | null;
  interview_questions?: string[];
  next_action?: { label: string; tier: "go" | "screen" | "hold" | "pass" };
  error?: string;
};

type Step = "jd" | "criteria" | "running" | "results";

const TIER_CLASS: Record<string, string> = {
  go: "bg-good-wash text-good-text",
  screen: "bg-warning-wash text-ink",
  hold: "bg-page text-ink-muted",
  pass: "bg-critical-wash text-critical",
};

const MAX_CANDIDATES = 8;

export default function SmartScreenAiForm() {
  const [step, setStep] = useState<Step>("jd");
  const [jdText, setJdText] = useState("");
  const [criteria, setCriteria] = useState<Criteria | null>(null);
  const [candidates, setCandidates] = useState<CandidateDraft[]>([{ name: "", resumeText: "" }]);
  const [results, setResults] = useState<ScoredCandidate[]>([]);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleStructure() {
    setError(null);
    if (!jdText.trim()) {
      setError("Paste a job description first.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/smart-screen/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jdText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not structure criteria.");
      setCriteria(data.criteria);
      setStep("criteria");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not structure criteria.");
    } finally {
      setBusy(false);
    }
  }

  function updateCandidate(idx: number, field: keyof CandidateDraft, value: string) {
    setCandidates((prev) => prev.map((c, i) => (i === idx ? { ...c, [field]: value } : c)));
  }

  function addCandidate() {
    if (candidates.length >= MAX_CANDIDATES) return;
    setCandidates((prev) => [...prev, { name: "", resumeText: "" }]);
  }

  function removeCandidate(idx: number) {
    setCandidates((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleRun() {
    setError(null);
    if (!criteria) return;
    const nonEmpty = candidates.filter((c) => c.resumeText.trim().length > 0);
    if (nonEmpty.length === 0) {
      setError("Add at least one candidate's resume text.");
      return;
    }
    setStep("running");
    setBusy(true);
    try {
      const res = await fetch("/api/smart-screen/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleTitle: criteria.role_title, criteria, candidates: nonEmpty }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Screening failed.");
      const sorted = [...data.results].sort(
        (a, b) => (b.fit_score ?? -1) - (a.fit_score ?? -1)
      );
      setResults(sorted);
      setStep("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Screening failed.");
      setStep("criteria");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep("jd");
    setJdText("");
    setCriteria(null);
    setCandidates([{ name: "", resumeText: "" }]);
    setResults([]);
    setError(null);
  }

  return (
    <div className="max-w-2xl">
      <p className="text-[13px] text-ink-2 mb-5">
        Paste a JD, let AI turn it into screening criteria, add up to {MAX_CANDIDATES} candidates&rsquo;
        resume text, then run — each gets an honest fit score, red flags, and tailored interview
        questions.
      </p>

      {error && (
        <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2 mb-4">
          {error}
        </div>
      )}

      {step === "jd" && (
        <div className="flex flex-col gap-4">
          <Field label="Job description">
            <textarea
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              className="input min-h-[220px]"
              placeholder="Paste the JD text — AI will extract must-have skills, experience, CTC budget, etc."
            />
          </Field>
          <button
            onClick={handleStructure}
            disabled={busy}
            className="bg-brand text-white text-[13px] font-bold px-4 py-2.5 rounded-sm disabled:opacity-50 self-start shadow-soft-sm"
          >
            {busy ? "Structuring…" : "Structure with AI"}
          </button>
        </div>
      )}

      {step === "criteria" && criteria && (
        <div className="flex flex-col gap-5">
          <div className="border border-border rounded-md bg-surface p-4">
            <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-2">
              Criteria — {criteria.role_title || "Untitled role"}
            </div>
            <div className="text-[12.5px] text-ink-2 flex flex-col gap-1">
              <div>Min. experience: {criteria.min_years_experience ?? "not specified"} yrs</div>
              <div>CTC budget: {criteria.ctc_budget || "not specified"}</div>
              <div>Must-have: {(criteria.must_have_skills || []).join(", ") || "none"}</div>
              <div>Good-to-have: {(criteria.good_to_have_skills || []).join(", ") || "none"}</div>
              {criteria.other_notes && <div>Notes: {criteria.other_notes}</div>}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="text-[12px] font-bold">Candidates</div>
            {candidates.map((c, idx) => (
              <div key={idx} className="border border-border rounded-md bg-surface p-3.5">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    value={c.name}
                    onChange={(e) => updateCandidate(idx, "name", e.target.value)}
                    className="input flex-1"
                    placeholder={`Candidate ${idx + 1} name (optional)`}
                  />
                  {candidates.length > 1 && (
                    <button
                      onClick={() => removeCandidate(idx)}
                      className="text-ink-muted p-1"
                      aria-label="Remove candidate"
                    >
                      <Icon name="x" className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <textarea
                  value={c.resumeText}
                  onChange={(e) => updateCandidate(idx, "resumeText", e.target.value)}
                  className="input min-h-[90px]"
                  placeholder="Paste this candidate's resume text…"
                />
              </div>
            ))}
            {candidates.length < MAX_CANDIDATES && (
              <button
                onClick={addCandidate}
                className="border border-dashed border-border text-[12.5px] font-bold text-ink-muted rounded-sm px-3 py-2 self-start"
              >
                + Add another candidate
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleRun}
              disabled={busy}
              className="bg-brand text-white text-[13px] font-bold px-4 py-2.5 rounded-sm disabled:opacity-50 shadow-soft-sm"
            >
              Run screening
            </button>
            <button
              onClick={() => setStep("jd")}
              className="border border-border text-[13px] font-bold px-4 py-2.5 rounded-sm bg-surface"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {step === "running" && (
        <div className="flex flex-col items-center justify-center text-center gap-2.5 py-10">
          <div className="text-[13px] text-ink-muted">
            Screening {candidates.filter((c) => c.resumeText.trim()).length} candidate(s)… this can
            take a minute.
          </div>
        </div>
      )}

      {step === "results" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-bold">
              {results.length} candidate{results.length !== 1 ? "s" : ""} screened
            </div>
            <button
              onClick={reset}
              className="border border-border text-[12.5px] font-bold px-3 py-1.5 rounded-sm bg-surface"
            >
              New batch
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {results.map((r, idx) => {
              const open = openIdx === idx;
              if (r.error) {
                return (
                  <div key={idx} className="border border-border rounded-md bg-surface px-4 py-3">
                    <div className="text-[13.5px] font-medium">{r.candidate_name || `Candidate ${idx + 1}`}</div>
                    <div className="text-[12.5px] text-critical mt-1">{r.error}</div>
                  </div>
                );
              }
              const tier = r.next_action?.tier || "screen";
              return (
                <div key={idx} className="border border-border rounded-md bg-surface shadow-soft-sm">
                  <button
                    onClick={() => setOpenIdx(open ? null : idx)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left"
                  >
                    <span className="text-[13.5px] font-medium flex-1">
                      {r.candidate_name || `Candidate ${idx + 1}`}
                    </span>
                    <span className="text-[12.5px] font-bold text-ink">{r.fit_score?.toFixed(1)}/10</span>
                    <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${TIER_CLASS[tier]}`}>
                      {r.next_action?.label || tier}
                    </span>
                  </button>
                  {open && (
                    <div className="border-t border-border px-4 py-3 flex flex-col gap-2.5">
                      <p className="text-[12.5px] text-ink-2">{r.justification}</p>
                      {r.met_skills && r.met_skills.length > 0 && (
                        <div className="text-[12px]">
                          <b>Met:</b> {r.met_skills.join(", ")}
                        </div>
                      )}
                      {r.missing_skills && r.missing_skills.length > 0 && (
                        <div className="text-[12px]">
                          <b>Missing:</b> {r.missing_skills.join(", ")}
                        </div>
                      )}
                      {r.red_flags && r.red_flags.length > 0 && (
                        <div className="text-[12px] text-critical">
                          <b>Red flags:</b> {r.red_flags.join("; ")}
                        </div>
                      )}
                      {r.achievement && (
                        <div className="text-[12px]">
                          <b>Notable:</b> {r.achievement}
                        </div>
                      )}
                      {r.interview_questions && r.interview_questions.length > 0 && (
                        <div className="text-[12px]">
                          <b>Ask them:</b>
                          <ul className="list-disc pl-5 mt-1">
                            {r.interview_questions.map((q, i) => (
                              <li key={i}>{q}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
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
