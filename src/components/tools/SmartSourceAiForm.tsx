"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";

type Mode = "jd" | "describe" | "manual";
type Step = "input" | "running" | "results";

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

const STATUS_STEPS = [
  "Reading the input",
  "Extracting role & skills",
  "Searching LinkedIn",
  "Scoring matches",
  "Checking your database",
];

const PAGE_SIZE = 20;

function scoreClass(score: number | null) {
  if (score == null) return "bg-page text-ink-muted";
  if (score >= 70) return "bg-good-wash text-good-text";
  if (score >= 40) return "bg-warning-wash text-ink";
  return "bg-critical-wash text-critical";
}

export default function SmartSourceAiForm() {
  const [mode, setMode] = useState<Mode>("jd");
  const [jdText, setJdText] = useState("");
  const [describeText, setDescribeText] = useState("");
  const [manualRole, setManualRole] = useState("");
  const [manualCompany, setManualCompany] = useState("");
  const [manualLocation, setManualLocation] = useState("");
  const [manualSkills, setManualSkills] = useState("");
  const [manualExperience, setManualExperience] = useState("");

  const [step, setStep] = useState<Step>("input");
  const [statusIdx, setStatusIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<SearchRow | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const statusTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (statusTimer.current) clearInterval(statusTimer.current);
    };
  }, []);

  async function handleSearch() {
    setError(null);

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
    setExpanded(null);
  }

  const pageCount = Math.max(1, Math.ceil(candidates.length / PAGE_SIZE));
  const pageRows = candidates.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="max-w-5xl">
      <p className="text-[13px] text-ink-2 mb-5 max-w-2xl">
        Drop in a job description, describe who you need in your own words, or set skills manually.
        The AI reads it, builds a search, and finds matching candidates from public LinkedIn profiles
        — cross-checked against your own database.
      </p>

      {error && (
        <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2 mb-4">{error}</div>
      )}

      {step === "input" && (
        <div className="flex flex-col gap-4">
          <div className="inline-flex bg-page rounded-sm p-1 self-start">
            {([
              { key: "jd", label: "Paste a JD" },
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
            <Field label="Job description">
              <textarea
                className="input min-h-[220px]"
                placeholder="Paste the full JD text here…"
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
              />
            </Field>
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
            className="bg-brand text-white text-[13px] font-bold px-4 py-2.5 rounded-sm self-start shadow-soft-sm inline-flex items-center gap-1.5"
          >
            <Icon name="search" className="w-4 h-4" />
            Source candidates
          </button>
        </div>
      )}

      {step === "running" && (
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

      {step === "results" && (
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
              <div className="border border-border rounded-md bg-surface overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-wider text-ink-muted">
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
                    {pageRows.map((c) => (
                      <Fragment key={c.id}>
                        <tr className="border-b border-border last:border-0 hover:bg-page/50">
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
                              <button
                                onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                                className="text-ink-2 font-bold inline-flex items-center gap-0.5"
                              >
                                Evaluation
                                <Icon name={expanded === c.id ? "chevronUp" : "chevronDown"} className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expanded === c.id && (
                          <tr className="border-b border-border bg-page/40">
                            <td colSpan={9} className="px-4 py-3.5">
                              <div className="grid grid-cols-3 gap-4">
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
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

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
