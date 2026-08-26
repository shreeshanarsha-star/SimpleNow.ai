"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";

type JobInfo = {
  title: string;
  company: string | null;
  mustHaveSkills: string[];
  goodToHaveSkills: string[];
  qualification: string;
  location: string;
};

type Stage = "loading" | "error" | "form" | "submitting" | "done";

export default function QuestionnaireForm({ token }: { token: string }) {
  const [stage, setStage] = useState<Stage>("loading");
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<JobInfo | null>(null);
  const [candidateName, setCandidateName] = useState("");

  const [skillAnswers, setSkillAnswers] = useState<Record<string, boolean>>({});
  const [goodToHaveAnswers, setGoodToHaveAnswers] = useState<Record<string, boolean>>({});
  const [location, setLocation] = useState("");
  const [ctc, setCtc] = useState("");
  const [totalExperience, setTotalExperience] = useState("");
  const [qualification, setQualification] = useState("");
  const [currentIndustry, setCurrentIndustry] = useState("");
  const [openToRelocation, setOpenToRelocation] = useState(false);
  const [passed, setPassed] = useState<boolean | null>(null);

  useEffect(() => {
    fetch(`/api/apply-questionnaire/${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          setStage("error");
          return;
        }
        setJob(data.job);
        setCandidateName(data.candidateName || "");
        setLocation(data.job.location || "");
        setQualification(data.job.qualification || "");
        setStage("form");
      })
      .catch(() => {
        setError("Couldn't load this questionnaire.");
        setStage("error");
      });
  }, [token]);

  async function handleSubmit() {
    setStage("submitting");
    try {
      const res = await fetch(`/api/apply-questionnaire/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          technicalSkillAnswers: (job?.mustHaveSkills || []).map((skill) => ({
            skill,
            has_it: !!skillAnswers[skill],
          })),
          goodToHaveAnswers: (job?.goodToHaveSkills || []).map((skill) => ({
            skill,
            has_it: !!goodToHaveAnswers[skill],
          })),
          location,
          ctc,
          totalExperience: totalExperience ? Number(totalExperience) : null,
          qualification,
          currentIndustry,
          openToRelocation,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't submit your answers.");
      setPassed(!!data.passed);
      setStage("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit your answers.");
      setStage("form");
    }
  }

  if (stage === "loading") return <p className="text-[13px] text-ink-muted">Loading…</p>;

  if (stage === "error") {
    return (
      <div className="bg-critical-wash text-critical text-[13px] rounded-sm px-4 py-3 max-w-lg">
        {error}
      </div>
    );
  }

  if (stage === "done") {
    return (
      <div className="border border-border rounded-md bg-surface p-6 max-w-lg text-center">
        <div
          className={`w-11 h-11 rounded-full flex items-center justify-center mx-auto mb-3 ${
            passed ? "bg-good-wash text-good-text" : "bg-page text-ink-muted"
          }`}
        >
          <Icon name={passed ? "check" : "x"} className="w-5 h-5" />
        </div>
        <h2 className="m-0 text-[17px] font-bold">
          {passed ? "Thanks — you're shortlisted" : "Thanks for confirming"}
        </h2>
        <p className="m-0 mt-2 text-[13px] text-ink-muted">
          {passed
            ? "Your answers matched this role's requirements. The hiring team has been notified."
            : "Your answers didn't fully match this role's stated requirements, so we won't forward this one — but your CV stays in our pool for future matches."}
        </p>
      </div>
    );
  }

  if (!job) return null;

  const isSubmitting = stage === "submitting";

  return (
    <div className="max-w-lg">
      <p className="text-[13px] text-ink-2 mb-1">
        Hi {candidateName || "there"} — quick questions to confirm you meet{" "}
        <b>
          {job.title}
          {job.company ? ` at ${job.company}` : ""}
        </b>
        &rsquo;s actual requirements before we forward your profile.
      </p>

      {error && (
        <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2 my-3">{error}</div>
      )}

      {job.mustHaveSkills.length > 0 && (
        <div className="mt-5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-2">
            Do you have these must-have skills?
          </div>
          <div className="flex flex-col gap-1.5">
            {job.mustHaveSkills.map((skill) => (
              <label key={skill} className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={!!skillAnswers[skill]}
                  onChange={(e) => setSkillAnswers((s) => ({ ...s, [skill]: e.target.checked }))}
                />
                {skill}
              </label>
            ))}
          </div>
        </div>
      )}

      {job.goodToHaveSkills.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-2">
            Good-to-have skills you have (optional)
          </div>
          <div className="flex flex-col gap-1.5">
            {job.goodToHaveSkills.map((skill) => (
              <label key={skill} className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={!!goodToHaveAnswers[skill]}
                  onChange={(e) => setGoodToHaveAnswers((s) => ({ ...s, [skill]: e.target.checked }))}
                />
                {skill}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mt-5">
        <Field label="Your location">
          <input value={location} onChange={(e) => setLocation(e.target.value)} className="input" />
        </Field>
        <Field label="Total experience (years)">
          <input
            type="number"
            value={totalExperience}
            onChange={(e) => setTotalExperience(e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Your qualification">
          <input value={qualification} onChange={(e) => setQualification(e.target.value)} className="input" />
        </Field>
        <Field label="Current industry">
          <input value={currentIndustry} onChange={(e) => setCurrentIndustry(e.target.value)} className="input" />
        </Field>
        <Field label="Current / expected CTC (optional)">
          <input value={ctc} onChange={(e) => setCtc(e.target.value)} className="input" />
        </Field>
      </div>

      <label className="flex items-center gap-2 mt-4 text-[13px]">
        <input type="checkbox" checked={openToRelocation} onChange={(e) => setOpenToRelocation(e.target.checked)} />
        Open to relocating for this role
      </label>

      <button
        onClick={handleSubmit}
        disabled={isSubmitting}
        className="bg-brand text-white text-[13px] font-bold px-4 py-2.5 rounded-sm disabled:opacity-50 shadow-soft-sm mt-6"
      >
        {isSubmitting ? "Submitting…" : "Submit answers"}
      </button>

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
