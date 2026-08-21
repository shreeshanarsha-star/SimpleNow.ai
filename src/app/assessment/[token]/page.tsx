"use client";

import LogoMark from "@/components/LogoMark";
import { useEffect, useState, use } from "react";

type Question = { id: string; dimension: string; text: string; reverse: boolean };
type ScaleItem = { value: number; label: string };

export default function TakeAssessmentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [candidateName, setCandidateName] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [scale, setScale] = useState<ScaleItem[]>([]);
  const [stem, setStem] = useState("");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/assessment/${token}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) {
          setNotFound(true);
          return;
        }
        if (d.assignment.status === "completed") {
          setAlreadyDone(true);
          return;
        }
        setCandidateName(d.assignment.candidateName);
        setQuestions(d.questions);
        setScale(d.scale);
        setStem(d.stem);
      })
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit() {
    setError(null);
    const unanswered = questions.filter((q) => !answers[q.id]);
    if (unanswered.length > 0) {
      setError(`Answer all ${questions.length} items — ${unanswered.length} remaining.`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/assessment/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not submit.");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return null;

  if (notFound) {
    return <Centered>This assessment link isn&rsquo;t valid.</Centered>;
  }
  if (alreadyDone || done) {
    return <Centered>Thanks — this assessment has already been submitted.</Centered>;
  }

  const answeredCount = Object.keys(answers).length;

  return (
    <div className="min-h-screen bg-page">
      <header className="border-b border-border bg-surface">
        <div className="max-w-[720px] mx-auto px-6 py-4 flex items-center gap-2.5">
          <LogoMark size={30} />
          <div className="font-bold text-[15.5px]">Askshree</div>
        </div>
      </header>

      <main className="max-w-[720px] mx-auto px-6 py-10">
        <h1 className="text-[22px] font-bold m-0">Big Five trait profile</h1>
        <p className="text-[13px] text-ink-muted mt-2 max-w-lg">
          Hi {candidateName}, {stem}
        </p>
        <p className="text-[12px] text-ink-muted mt-2">
          {answeredCount} of {questions.length} answered
        </p>

        {error && (
          <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2 my-4">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3 mt-5">
          {questions.map((q, idx) => (
            <div key={q.id} className="border border-border rounded-md bg-surface px-4 py-3.5">
              <div className="text-[13px] font-medium mb-2.5">
                {idx + 1}. {q.text}
              </div>
              <div className="flex flex-wrap gap-2">
                {scale.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: s.value }))}
                    className={`text-[11.5px] font-bold px-2.5 py-1.5 rounded-sm border ${
                      answers[q.id] === s.value
                        ? "bg-brand text-white border-brand"
                        : "bg-page text-ink-muted border-border"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="bg-brand text-white text-[13px] font-bold px-4 py-2.5 rounded-sm disabled:opacity-50 mt-6"
        >
          {submitting ? "Submitting…" : "Submit"}
        </button>
      </main>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-page px-6">
      <div className="text-[14px] text-ink-2 text-center max-w-sm">{children}</div>
    </div>
  );
}
