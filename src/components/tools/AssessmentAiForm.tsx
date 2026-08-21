"use client";

import { useEffect, useState } from "react";

type Assignment = {
  id: string;
  candidate_name: string;
  candidate_email: string;
  token: string;
  status: string;
  created_at: string;
  assessment_responses?: { scores: Record<string, number>; completed_at: string }[];
};

const DIM_LABEL: Record<string, string> = {
  extraversion: "Extraversion",
  agreeableness: "Agreeableness",
  conscientiousness: "Conscientiousness",
  emotional_stability: "Emotional Stability",
  intellect: "Intellect / Imagination",
};

export default function AssessmentAiForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [lastLink, setLastLink] = useState<string | null>(null);

  async function loadAssignments() {
    const res = await fetch("/api/assessment/assign");
    const data = await res.json();
    if (res.ok) setAssignments(data.assignments || []);
  }

  useEffect(() => {
    loadAssignments();
  }, []);

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/assessment/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateName: name, candidateEmail: email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create the assignment.");
      const link = `${window.location.origin}/assessment/${data.assignment.token}`;
      setLastLink(link);
      setName("");
      setEmail("");
      await loadAssignments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the assignment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <p className="text-[13px] text-ink-2 mb-5">
        Assign a candidate the Big Five (IPIP, 50-item) trait profile — a shareable link, no
        account needed on their end. This is a trait profile, not a pass/fail score.
      </p>

      {error && (
        <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2 mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleAssign} className="flex flex-col gap-4 mb-6">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Candidate name">
            <input value={name} onChange={(e) => setName(e.target.value)} className="input" required />
          </Field>
          <Field label="Candidate email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              required
            />
          </Field>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="bg-brand text-white text-[13px] font-bold px-4 py-2.5 rounded-sm disabled:opacity-50 self-start"
        >
          {busy ? "Creating…" : "Create assessment link"}
        </button>
      </form>

      {lastLink && (
        <div className="bg-good-wash text-good-text text-[12.5px] rounded-sm px-3 py-2.5 mb-6 break-all">
          Link ready: <a href={lastLink} target="_blank" className="underline">{lastLink}</a>
        </div>
      )}

      <div className="text-[12px] font-bold mb-2">Assignments</div>
      <div className="flex flex-col gap-2">
        {assignments.length === 0 && (
          <div className="border border-dashed border-border rounded-md px-4 py-6 text-center text-[13px] text-ink-muted">
            No assignments yet.
          </div>
        )}
        {assignments.map((a) => {
          const response = a.assessment_responses?.[0];
          return (
            <div key={a.id} className="border border-border rounded-md bg-surface px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-[13.5px] font-medium flex-1">{a.candidate_name}</span>
                <span
                  className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${
                    a.status === "completed" ? "bg-good-wash text-good-text" : "bg-warning-wash text-ink"
                  }`}
                >
                  {a.status === "completed" ? "Completed" : "Pending"}
                </span>
              </div>
              <div className="text-[11.5px] text-ink-muted mt-0.5">{a.candidate_email}</div>
              {response && (
                <div className="text-[12px] text-ink-2 mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {Object.entries(response.scores).map(([dim, score]) => (
                    <span key={dim}>
                      <b>{DIM_LABEL[dim] || dim}:</b> {score}/50
                    </span>
                  ))}
                </div>
              )}
              {a.status !== "completed" && (
                <div className="text-[11px] text-ink-muted mt-1.5 break-all">
                  {typeof window !== "undefined" ? `${window.location.origin}/assessment/${a.token}` : ""}
                </div>
              )}
            </div>
          );
        })}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-bold mb-1.5">{label}</span>
      {children}
    </label>
  );
}
