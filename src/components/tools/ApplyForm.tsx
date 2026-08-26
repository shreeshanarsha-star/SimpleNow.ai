"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Icon from "@/components/Icon";

type Job = {
  id: string;
  title: string;
  location: string | null;
  employment_type: string | null;
  description: string;
  ai_polished_description: string | null;
};

type Step = "browse" | "form" | "submitting" | "done";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export default function ApplyForm({ jobs }: { jobs: Job[] }) {
  const [step, setStep] = useState<Step>("browse");
  const [openId, setOpenId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  // Deep-link support: /apply?job=<id> (used by /jobs/[id]'s "Apply now"
  // button) jumps straight to the application form for that role.
  useEffect(() => {
    const jobId = new URLSearchParams(window.location.search).get("job");
    if (!jobId) return;
    const match = jobs.find((j) => j.id === jobId);
    if (match) {
      setSelectedJob(match);
      setStep("form");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [coverNote, setCoverNote] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  function startApply(job: Job) {
    setSelectedJob(job);
    setStep("form");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedJob) return;
    setError(null);

    if (!resumeFile) {
      setError("Attach your resume (PDF or Word, up to 5MB).");
      return;
    }
    if (!ALLOWED_TYPES.includes(resumeFile.type)) {
      setError("Resume must be a PDF or Word document.");
      return;
    }
    if (resumeFile.size > MAX_FILE_BYTES) {
      setError("Resume must be under 5MB.");
      return;
    }

    setStep("submitting");
    try {
      const supabase = createClient();
      const safeName = resumeFile.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      const path = `${selectedJob.id}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(path, resumeFile, { contentType: resumeFile.type });
      if (uploadError) throw new Error(`Resume upload failed: ${uploadError.message}`);

      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobPostingId: selectedJob.id,
          candidateName: name,
          candidateEmail: email,
          candidatePhone: phone,
          coverNote,
          resumePath: path,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not submit your application.");

      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit your application.");
      setStep("form");
    }
  }

  if (step === "done") {
    return (
      <div className="border border-border rounded-md bg-surface px-6 py-10 mt-8 max-w-xl text-center">
        <div className="w-11 h-11 rounded-full bg-good-wash text-good-text flex items-center justify-center mx-auto mb-3">
          <Icon name="check" className="w-5 h-5" />
        </div>
        <h2 className="m-0 text-[17px] font-bold">Application sent</h2>
        <p className="m-0 mt-2 text-[13px] text-ink-muted">
          Thanks for applying to <b>{selectedJob?.title}</b>. The hiring team
          will review it and reach out if there&rsquo;s a fit.
        </p>
      </div>
    );
  }

  if ((step === "form" || step === "submitting") && selectedJob) {
    const isSubmitting: boolean = step === "submitting";
    return (
      <div className="border border-border rounded-md bg-surface p-5 mt-6 max-w-xl">
        <button
          onClick={() => setStep("browse")}
          className="text-[12px] font-bold text-ink-muted flex items-center gap-1 mb-3"
        >
          <Icon name="chevronLeft" className="w-3.5 h-3.5" /> Back to roles
        </button>
        <div className="text-[15px] font-bold mb-0.5">{selectedJob.title}</div>
        {selectedJob.location && (
          <div className="text-[12px] text-ink-muted mb-4">{selectedJob.location}</div>
        )}

        {error && (
          <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2 mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Full name">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="Your name"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Email">
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="you@example.com"
              />
            </Field>
            <Field label="Phone (optional)">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="input"
                placeholder="+91…"
              />
            </Field>
          </div>
          <Field label="Resume (PDF or Word, up to 5MB)">
            <input
              required
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
              className="input"
            />
          </Field>
          <Field label="Cover note (optional)">
            <textarea
              value={coverNote}
              onChange={(e) => setCoverNote(e.target.value)}
              className="input min-h-[90px]"
              placeholder="Anything you'd like the hiring team to know…"
            />
          </Field>

          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-brand text-white text-[13px] font-bold px-4 py-2.5 rounded-sm disabled:opacity-50 self-start shadow-soft-sm"
          >
            {isSubmitting ? "Submitting…" : "Submit application"}
          </button>
        </form>

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

  return (
    <div className="flex flex-col gap-2.5 mt-8">
      {jobs.map((job) => {
        const open = openId === job.id;
        return (
          <div key={job.id} className="border border-border rounded-md bg-surface shadow-soft-sm">
            <button
              onClick={() => setOpenId(open ? null : job.id)}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
            >
              <span className="text-[14px] font-bold flex-1">{job.title}</span>
              {job.location && (
                <span className="text-[11.5px] text-ink-muted">{job.location}</span>
              )}
              {job.employment_type && (
                <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-page text-ink-muted">
                  {job.employment_type}
                </span>
              )}
            </button>
            {open && (
              <div className="border-t border-border px-4 py-3.5">
                <p className="text-[12.5px] text-ink-2 whitespace-pre-wrap mb-3">
                  {job.ai_polished_description || job.description}
                </p>
                <button
                  onClick={() => startApply(job)}
                  className="bg-brand text-white text-[12.5px] font-bold px-3.5 py-1.5 rounded-sm"
                >
                  Apply now
                </button>
              </div>
            )}
          </div>
        );
      })}
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
