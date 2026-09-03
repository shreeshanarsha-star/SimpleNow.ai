"use client";

import { useEffect, useState, use } from "react";
import type { JdQuestion, JdDraft, BiasFlag } from "@/lib/jdstudio/types";

interface TokenData {
  id: string;
  status: string;
  recipient_name: string | null;
  recipient_email: string;
  department: string;
  job_title: string | null;
  questions_snapshot: JdQuestion[] | null;
  answers: Record<string, string> | null;
  approver_mode: "self" | "route";
  ai_draft_json: JdDraft | null;
  bias_flags: BiasFlag[] | null;
}

const SECTION_LABEL: Record<string, string> = {
  role_context: "Role & context",
  must_have: "Must-have skills",
  good_to_have: "Good-to-have skills",
};

export default function JdIntakePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TokenData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [decided, setDecided] = useState<"approve" | "changes" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/jdstudio/intake/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error || !d.request) {
          setNotFound(true);
        } else {
          setData(d.request);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [token]);

  async function submitAnswers() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/jdstudio/intake/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit_answers", answers: values }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Couldn't submit.");
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit.");
    } finally {
      setSubmitting(false);
    }
  }

  async function decide(approve: boolean) {
    setDeciding(true);
    setError(null);
    try {
      const res = await fetch(`/api/jdstudio/intake/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: approve ? "approve" : "request_changes" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Couldn't record your decision.");
      setDecided(approve ? "approve" : "changes");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't record your decision.");
    } finally {
      setDeciding(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f4ec] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl bg-white rounded-2xl border border-[#e9e3d3] shadow-sm p-8">
        <div className="text-[12px] font-bold tracking-wide text-[#8a6a10] uppercase mb-4">JD Studio.ai</div>

        {loading && <p className="text-[13px] text-[#8c8776]">Loading…</p>}

        {!loading && notFound && (
          <p className="text-[14px] text-[#211f1a]">This link isn&rsquo;t valid or has expired.</p>
        )}

        {!loading && data && (
          <>
            {["sent", "opened"].includes(data.status) && !submitted && (
              <IntakeForm data={data} values={values} setValues={setValues} onSubmit={submitAnswers} submitting={submitting} error={error} />
            )}

            {(submitted || ["responded", "drafting"].includes(data.status)) && (
              <div className="text-[14px] text-[#211f1a]">
                <p className="font-bold mb-1">Thanks{data.recipient_name ? `, ${data.recipient_name}` : ""}!</p>
                <p className="text-[#5c584c]">Your answers are in. We&rsquo;re putting the job description together now.</p>
              </div>
            )}

            {data.status === "pending_approval" && data.approver_mode === "route" && !decided && (
              <ApprovalView data={data} onDecide={decide} deciding={deciding} error={error} />
            )}
            {data.status === "pending_approval" && data.approver_mode === "self" && (
              <div className="text-[14px] text-[#211f1a]">
                <p>This job description is drafted and waiting on internal approval.</p>
              </div>
            )}
            {decided === "approve" && <p className="text-[14px] text-[#0ca30c] font-bold">Approved -- thank you.</p>}
            {decided === "changes" && <p className="text-[14px] text-[#211f1a]">Sent back for changes -- thank you.</p>}

            {["approved", "published"].includes(data.status) && !decided && (
              <div className="text-[14px] text-[#211f1a]">
                <p className="font-bold mb-1">{data.job_title || "This role"} -- approved</p>
                <p className="text-[#5c584c]">The final job description has been finalized{data.status === "published" ? " and published." : "."}</p>
              </div>
            )}
            {data.status === "expired" && <p className="text-[14px] text-[#211f1a]">This link has expired.</p>}
          </>
        )}
      </div>
    </div>
  );
}

function IntakeForm({
  data,
  values,
  setValues,
  onSubmit,
  submitting,
  error,
}: {
  data: TokenData;
  values: Record<string, string>;
  setValues: (fn: (v: Record<string, string>) => Record<string, string>) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const questions = data.questions_snapshot || [];
  const bySection = questions.reduce<Record<string, JdQuestion[]>>((acc, q) => {
    (acc[q.section] ||= []).push(q);
    return acc;
  }, {});
  const requiredMissing = questions.some((q) => q.required && !values[q.id]?.trim());

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-[15px] font-bold text-[#211f1a] m-0">
          {data.recipient_name ? `Hi ${data.recipient_name},` : "Hi,"} a few details for {data.job_title || "a new role"}
        </p>
        <p className="text-[12.5px] text-[#8c8776] mt-1">{data.department} · takes about 5 minutes</p>
      </div>
      {Object.entries(bySection).map(([section, qs]) => (
        <div key={section} className="flex flex-col gap-3">
          <div className="text-[12px] font-bold text-[#8a6a10] uppercase tracking-wide">{SECTION_LABEL[section] || section}</div>
          {qs.map((q) => (
            <label key={q.id} className="flex flex-col gap-1 text-[13px]">
              <span className="font-semibold text-[#211f1a]">
                {q.label} {q.required && <span className="text-[#d03b3b]">*</span>}
              </span>
              {q.type === "textarea" ? (
                <textarea
                  className="border border-[#e9e3d3] rounded-md px-3 py-2 min-h-20"
                  value={values[q.id] || ""}
                  onChange={(e) => setValues((v) => ({ ...v, [q.id]: e.target.value }))}
                />
              ) : (
                <input
                  className="border border-[#e9e3d3] rounded-md px-3 py-2"
                  value={values[q.id] || ""}
                  onChange={(e) => setValues((v) => ({ ...v, [q.id]: e.target.value }))}
                />
              )}
            </label>
          ))}
        </div>
      ))}
      {error && <p className="text-[12.5px] text-[#d03b3b]">{error}</p>}
      <button
        disabled={submitting || requiredMissing}
        onClick={onSubmit}
        className="bg-[#b08d57] text-white font-bold text-[13.5px] rounded-lg py-3 disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Submit"}
      </button>
    </div>
  );
}

function ApprovalView({
  data,
  onDecide,
  deciding,
  error,
}: {
  data: TokenData;
  onDecide: (approve: boolean) => void;
  deciding: boolean;
  error: string | null;
}) {
  const draft = data.ai_draft_json;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[15px] font-bold text-[#211f1a] m-0">{data.job_title || "A role"} is ready for your approval</p>
      {data.bias_flags && data.bias_flags.length > 0 && (
        <div className="border border-[#fab219]/40 bg-[#fdf1da] rounded-md px-3 py-2 text-[12.5px] flex flex-col gap-1">
          {data.bias_flags.map((f, i) => (
            <div key={i}>
              <span className="italic">&ldquo;{f.text}&rdquo;</span> — {f.suggestion}
            </div>
          ))}
        </div>
      )}
      {draft && (
        <div className="flex flex-col gap-3 text-[13px] text-[#211f1a]">
          <div>
            <div className="font-bold text-[#8c8776] text-[11.5px] uppercase mb-1">Summary</div>
            <p className="m-0">{draft.summary}</p>
          </div>
          <div>
            <div className="font-bold text-[#8c8776] text-[11.5px] uppercase mb-1">Responsibilities</div>
            <ul className="m-0 pl-4">
              {draft.responsibilities.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="font-bold text-[#8c8776] text-[11.5px] uppercase mb-1">Must-have skills</div>
            <p className="m-0">{draft.must_have_skills.join(", ")}</p>
          </div>
        </div>
      )}
      {error && <p className="text-[12.5px] text-[#d03b3b]">{error}</p>}
      <div className="flex gap-2">
        <button disabled={deciding} onClick={() => onDecide(true)} className="flex-1 bg-[#0ca30c] text-white font-bold text-[13px] rounded-lg py-2.5 disabled:opacity-50">
          Approve
        </button>
        <button disabled={deciding} onClick={() => onDecide(false)} className="flex-1 border border-[#e9e3d3] font-bold text-[13px] rounded-lg py-2.5 disabled:opacity-50">
          Request changes
        </button>
      </div>
    </div>
  );
}
