"use client";

import { useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";

type Step = "draft" | "polishing" | "review" | "submitting" | "done";

export default function JobPostingsAiForm() {
  const [step, setStep] = useState<Step>("draft");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [requirements, setRequirements] = useState("");
  const [location, setLocation] = useState("");
  const [employmentType, setEmploymentType] = useState("Full-time");
  const [polished, setPolished] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isSubmitting: boolean = step === "submitting";

  async function handlePolish() {
    setError(null);
    setStep("polishing");
    try {
      const res = await fetch("/api/job-postings/polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, requirements }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI polish failed.");
      setPolished(data.polished);
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI polish failed.");
      setStep("draft");
    }
  }

  async function handleSubmit() {
    setError(null);
    setStep("submitting");
    try {
      const res = await fetch("/api/job-postings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          requirements,
          location,
          employmentType,
          aiPolishedDescription: polished || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the posting.");
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the posting.");
      setStep("review");
    }
  }

  if (step === "done") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
        <div className="w-11 h-11 rounded-full bg-good-wash text-good-text flex items-center justify-center">
          <Icon name="check" className="w-5 h-5" />
        </div>
        <h2 className="m-0 text-[18px] font-bold">Sent for approval</h2>
        <p className="m-0 text-[13px] text-ink-muted max-w-sm">
          This posting is waiting in the admin&rsquo;s approval queue — nothing goes
          live until it&rsquo;s approved there.
        </p>
        <div className="flex gap-2 pt-2">
          <Link
            href="/"
            className="bg-brand text-white text-[13px] font-bold px-4 py-2.5 rounded-sm"
          >
            Back to Overview
          </Link>
          <button
            onClick={() => {
              setStep("draft");
              setTitle("");
              setDescription("");
              setRequirements("");
              setLocation("");
              setPolished("");
            }}
            className="border border-border text-[13px] font-bold px-4 py-2.5 rounded-sm bg-surface"
          >
            Post another role
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <p className="text-[13px] text-ink-2 mb-5">
        Draft a role, let AI polish the description, then submit it — it goes to
        the admin&rsquo;s approval queue before it&rsquo;s published.
      </p>

      {error && (
        <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2 mb-4">
          {error}
        </div>
      )}

      {step !== "review" && (
        <div className="flex flex-col gap-4">
          <Field label="Job title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input"
              placeholder="e.g. Senior Backend Engineer"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Location">
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="input"
                placeholder="e.g. Remote / Bengaluru"
              />
            </Field>
            <Field label="Employment type">
              <select
                value={employmentType}
                onChange={(e) => setEmploymentType(e.target.value)}
                className="input"
              >
                <option>Full-time</option>
                <option>Part-time</option>
                <option>Contract</option>
                <option>Internship</option>
              </select>
            </Field>
          </div>
          <Field label="Draft description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input min-h-[110px]"
              placeholder="Rough notes are fine — AI will turn this into a proper description."
            />
          </Field>
          <Field label="Requirements (optional)">
            <textarea
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
              className="input min-h-[80px]"
              placeholder="Skills, experience, must-haves…"
            />
          </Field>

          <div className="flex gap-2 pt-1">
            <button
              onClick={handlePolish}
              disabled={!title || !description || step === "polishing"}
              className="bg-brand text-white text-[13px] font-bold px-4 py-2.5 rounded-sm disabled:opacity-50"
            >
              {step === "polishing" ? "Polishing…" : "Polish with AI"}
            </button>
          </div>
        </div>
      )}

      {step === "review" && (
        <div className="flex flex-col gap-4">
          <div className="bg-surface border border-border rounded-md p-4">
            <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-2">
              AI-polished description
            </div>
            <textarea
              value={polished}
              onChange={(e) => setPolished(e.target.value)}
              className="input min-h-[220px]"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="bg-brand text-white text-[13px] font-bold px-4 py-2.5 rounded-sm disabled:opacity-50"
            >
              {isSubmitting ? "Submitting…" : "Submit for approval"}
            </button>
            <button
              onClick={() => setStep("draft")}
              className="border border-border text-[13px] font-bold px-4 py-2.5 rounded-sm bg-surface"
            >
              Back to draft
            </button>
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
