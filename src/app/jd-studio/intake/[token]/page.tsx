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
  // Initialize defaults from data
  useEffect(() => {
    setValues((prev) => ({
      role_title: prev.role_title || data.job_title || "",
      department: prev.department || data.department || "General",
      band_grade: prev.band_grade || "",
      location: prev.location || "Hybrid / Flexible",
      experience_level: prev.experience_level || "2-5 years",
      kra_1: prev.kra_1 || "",
      kra_2: prev.kra_2 || "",
      kra_3: prev.kra_3 || "",
      kra_4: prev.kra_4 || "",
      kra_5: prev.kra_5 || "",
      must_have_1: prev.must_have_1 || "",
      must_have_2: prev.must_have_2 || "",
      must_have_3: prev.must_have_3 || "",
      additional_strengths: prev.additional_strengths || "",
      ...prev,
    }));
  }, [data, setValues]);

  const canSubmit = !!(
    (values.role_title || data.job_title) &&
    values.kra_1?.trim() &&
    values.must_have_1?.trim()
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-[17px] font-bold text-[#211f1a] m-0">
          {data.recipient_name ? `Hi ${data.recipient_name},` : "Hello,"} provide role details
        </h2>
        <p className="text-[12.5px] text-[#8c8776] mt-1">
          Lay the people architecture foundation for <strong>{data.job_title || "this role"}</strong>. Takes ~3 minutes.
        </p>
      </div>

      {/* 1. Basic Metadata */}
      <div className="flex flex-col gap-3 p-4 bg-[#faf8f3] rounded-xl border border-[#ede7d8]">
        <div className="text-[11.5px] font-bold text-[#8a6a10] uppercase tracking-wider">1. Role & Leveling Metadata</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-[12.5px]">
            <span className="font-semibold text-[#211f1a]">Designation / Title <span className="text-[#d03b3b]">*</span></span>
            <input
              className="border border-[#e0d8c3] rounded-md px-3 py-1.5 bg-white"
              value={values.role_title || ""}
              placeholder="e.g. Senior Backend Engineer"
              onChange={(e) => setValues((v) => ({ ...v, role_title: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-[12.5px]">
            <span className="font-semibold text-[#211f1a]">Band / Grade <span className="text-[#d03b3b]">*</span></span>
            <input
              className="border border-[#e0d8c3] rounded-md px-3 py-1.5 bg-white"
              value={values.band_grade || ""}
              placeholder="e.g. L4 / Senior / Lead"
              onChange={(e) => setValues((v) => ({ ...v, band_grade: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-[12.5px]">
            <span className="font-semibold text-[#211f1a]">Department</span>
            <input
              className="border border-[#e0d8c3] rounded-md px-3 py-1.5 bg-white"
              value={values.department || ""}
              placeholder="e.g. Engineering"
              onChange={(e) => setValues((v) => ({ ...v, department: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-[12.5px]">
            <span className="font-semibold text-[#211f1a]">Location & Work Mode</span>
            <input
              className="border border-[#e0d8c3] rounded-md px-3 py-1.5 bg-white"
              value={values.location || ""}
              placeholder="e.g. Bengaluru / Hybrid"
              onChange={(e) => setValues((v) => ({ ...v, location: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-[12.5px] sm:col-span-2">
            <span className="font-semibold text-[#211f1a]">Experience Level</span>
            <input
              className="border border-[#e0d8c3] rounded-md px-3 py-1.5 bg-white"
              value={values.experience_level || ""}
              placeholder="e.g. 2–5 years / 6–9 years"
              onChange={(e) => setValues((v) => ({ ...v, experience_level: e.target.value }))}
            />
          </label>
        </div>
      </div>

      {/* 2. Top 5 KRAs */}
      <div className="flex flex-col gap-3 p-4 bg-[#faf8f3] rounded-xl border border-[#ede7d8]">
        <div>
          <div className="text-[11.5px] font-bold text-[#8a6a10] uppercase tracking-wider">2. Top 5 Key Result Areas (KRAs)</div>
          <p className="text-[12px] text-[#8c8776] m-0 mt-0.5">What is this seat accountable for delivering?</p>
        </div>
        {[1, 2, 3, 4, 5].map((num) => (
          <div key={num} className="flex items-center gap-2">
            <span className="text-[12px] font-bold text-[#8a6a10] w-5 text-right">{num}.</span>
            <input
              className="flex-1 border border-[#e0d8c3] rounded-md px-3 py-1.5 bg-white text-[12.5px]"
              placeholder={
                num === 1 ? "e.g. Own and deliver core backend microservices & APIs" :
                num === 2 ? "e.g. Maintain 99.9% uptime and database query optimization" :
                num === 3 ? "e.g. Mentor 2 junior engineers and lead architectural reviews" :
                num === 4 ? "e.g. Collaborate with product managers on technical roadmaps" :
                "e.g. Establish CI/CD pipelines and security test automation"
              }
              value={values[`kra_${num}`] || ""}
              onChange={(e) => setValues((v) => ({ ...v, [`kra_${num}`]: e.target.value }))}
            />
          </div>
        ))}
      </div>

      {/* 3. Top 3 Non-Negotiable Strengths */}
      <div className="flex flex-col gap-3 p-4 bg-[#faf8f3] rounded-xl border border-[#ede7d8]">
        <div>
          <div className="text-[11.5px] font-bold text-[#b83838] uppercase tracking-wider">3. Top 3 Non-Negotiable Strengths</div>
          <p className="text-[12px] text-[#8c8776] m-0 mt-0.5">Without which we will NOT hire (Degree, Experience, Core Proficiency)</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-bold text-[#b83838] w-5 text-right">1.</span>
          <input
            className="flex-1 border border-[#e0d8c3] rounded-md px-3 py-1.5 bg-white text-[12.5px]"
            placeholder="e.g. Qualification: BCA + MCA or B.Tech in CS/IT"
            value={values.must_have_1 || ""}
            onChange={(e) => setValues((v) => ({ ...v, must_have_1: e.target.value }))}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-bold text-[#b83838] w-5 text-right">2.</span>
          <input
            className="flex-1 border border-[#e0d8c3] rounded-md px-3 py-1.5 bg-white text-[12.5px]"
            placeholder="e.g. Experience: 2–5 years hands-on production experience in Node.js & React"
            value={values.must_have_2 || ""}
            onChange={(e) => setValues((v) => ({ ...v, must_have_2: e.target.value }))}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-bold text-[#b83838] w-5 text-right">3.</span>
          <input
            className="flex-1 border border-[#e0d8c3] rounded-md px-3 py-1.5 bg-white text-[12.5px]"
            placeholder="e.g. Proficiency: Deep query optimization in PostgreSQL or MySQL"
            value={values.must_have_3 || ""}
            onChange={(e) => setValues((v) => ({ ...v, must_have_3: e.target.value }))}
          />
        </div>
      </div>

      {/* 4. Additional Strengths */}
      <div className="flex flex-col gap-2 p-4 bg-[#faf8f3] rounded-xl border border-[#ede7d8]">
        <div className="text-[11.5px] font-bold text-[#8a6a10] uppercase tracking-wider">4. Additional Strengths (Differentiators)</div>
        <p className="text-[12px] text-[#8c8776] m-0">Certifications, specialized skills, or nice-to-haves</p>
        <textarea
          className="border border-[#e0d8c3] rounded-md px-3 py-2 bg-white text-[12.5px] min-h-16"
          placeholder="e.g. AWS Certified Solutions Architect, Docker/Kubernetes, GraphQL experience"
          value={values.additional_strengths || ""}
          onChange={(e) => setValues((v) => ({ ...v, additional_strengths: e.target.value }))}
        />
      </div>

      {error && <p className="text-[12.5px] text-[#d03b3b] font-medium">{error}</p>}

      <button
        disabled={submitting || !canSubmit}
        onClick={onSubmit}
        className="bg-[#b08d57] text-white font-bold text-[14px] rounded-xl py-3 shadow-sm hover:opacity-95 transition-opacity disabled:opacity-50 cursor-pointer"
      >
        {submitting ? "Synthesizing People Architecture…" : "Submit Role Details"}
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
  const [activeTab, setActiveTab] = useState<"internal" | "external">("internal");
  const draft = data.ai_draft_json;
  const internal = draft?.internal;
  const external = draft?.external;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-[16px] font-bold text-[#211f1a] m-0">
          Review & Sign-Off: {data.job_title || "Job Description"}
        </p>
        <p className="text-[12.5px] text-[#8c8776] mt-0.5">
          {data.department} · Review the dual architectural formats before finalizing.
        </p>
      </div>

      {/* Format Switcher */}
      <div className="flex rounded-lg bg-[#ede7d8] p-1 gap-1">
        <button
          onClick={() => setActiveTab("internal")}
          className={`flex-1 py-1.5 text-[12.5px] font-bold rounded-md transition-colors ${
            activeTab === "internal" ? "bg-white text-[#211f1a] shadow-xs" : "text-[#8c8776] hover:text-[#211f1a]"
          }`}
        >
          🏢 Internal Format (People Architecture)
        </button>
        <button
          onClick={() => setActiveTab("external")}
          className={`flex-1 py-1.5 text-[12.5px] font-bold rounded-md transition-colors ${
            activeTab === "external" ? "bg-white text-[#211f1a] shadow-xs" : "text-[#8c8776] hover:text-[#211f1a]"
          }`}
        >
          🌐 External Format (Market JD)
        </button>
      </div>

      {data.bias_flags && data.bias_flags.length > 0 && (
        <div className="border border-[#fab219]/40 bg-[#fdf1da] rounded-md px-3 py-2 text-[12.5px] flex flex-col gap-1">
          <span className="font-bold text-[#8a6a10]">Guardrail Notes:</span>
          {data.bias_flags.map((f, i) => (
            <div key={i}>
              <span className="italic">&ldquo;{f.text}&rdquo;</span> — {f.suggestion}
            </div>
          ))}
        </div>
      )}

      {/* Content Canvas */}
      <div className="border border-[#e9e3d3] rounded-xl p-4 bg-[#faf8f3] text-[13px] text-[#211f1a] flex flex-col gap-4 max-h-[480px] overflow-y-auto">
        {activeTab === "internal" ? (
          <>
            <div className="border-b border-[#e9e3d3] pb-3">
              <div className="text-[11px] font-bold uppercase text-[#8a6a10] tracking-wider">Leveling & Department</div>
              <div className="text-[14px] font-bold mt-1">{internal?.role_title || data.job_title}</div>
              <div className="text-[12px] text-[#8c8776] mt-0.5">
                Band/Grade: <strong>{internal?.band_grade || "Standard"}</strong> · Dept: {internal?.department || data.department} · Location: {internal?.location} · Exp: {internal?.experience_level}
              </div>
            </div>

            <div>
              <div className="font-bold text-[#8a6a10] text-[11.5px] uppercase mb-1">1. Strategic Role Purpose</div>
              <p className="m-0 leading-relaxed text-[#3a3d45]">{internal?.role_purpose || draft?.summary}</p>
            </div>

            <div>
              <div className="font-bold text-[#8a6a10] text-[11.5px] uppercase mb-1">2. Top 5 Key Result Areas (KRAs)</div>
              <ol className="m-0 pl-4 space-y-1">
                {(internal?.kras?.length ? internal.kras : draft?.responsibilities || []).map((k, i) => (
                  <li key={i} className="leading-relaxed">{k}</li>
                ))}
              </ol>
            </div>

            {internal?.performance_metrics && internal.performance_metrics.length > 0 && (
              <div>
                <div className="font-bold text-[#8a6a10] text-[11.5px] uppercase mb-1">3. Performance Evaluation Benchmarks (OKRs / KPIs)</div>
                <ul className="m-0 pl-4 space-y-1">
                  {internal.performance_metrics.map((m, i) => (
                    <li key={i} className="leading-relaxed">{m}</li>
                  ))}
                </ul>
              </div>
            )}

            {internal?.functional_interfaces && internal.functional_interfaces.length > 0 && (
              <div>
                <div className="font-bold text-[#8a6a10] text-[11.5px] uppercase mb-1">4. Functional Interfaces & Cross-Team Boundaries</div>
                <ul className="m-0 pl-4 space-y-1">
                  {internal.functional_interfaces.map((intf, i) => (
                    <li key={i} className="leading-relaxed">{intf}</li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <div className="font-bold text-[#8a6a10] text-[11.5px] uppercase mb-1">5. Core Competencies & Leveling Criteria (Non-Negotiable)</div>
              <ul className="m-0 pl-4 space-y-1">
                {(internal?.core_competencies?.length ? internal.core_competencies : draft?.must_have_skills || []).map((c, i) => (
                  <li key={i} className="leading-relaxed">{c}</li>
                ))}
              </ul>
            </div>

            {internal?.additional_strengths && internal.additional_strengths.length > 0 && (
              <div>
                <div className="font-bold text-[#8a6a10] text-[11.5px] uppercase mb-1">6. Additional Strengths & Certifications</div>
                <ul className="m-0 pl-4 space-y-1">
                  {internal.additional_strengths.map((s, i) => (
                    <li key={i} className="leading-relaxed">{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="border-b border-[#e9e3d3] pb-3">
              <div className="text-[11px] font-bold uppercase text-[#8a6a10] tracking-wider">Candidate-Facing Posting</div>
              <div className="text-[14px] font-bold mt-1">{external?.role_title || data.job_title}</div>
              <div className="text-[12px] text-[#8c8776] mt-0.5">
                {external?.department || data.department} · {external?.employment_type || "Full-time"} · {external?.location_mode || "Hybrid"}
              </div>
            </div>

            <div>
              <div className="font-bold text-[#8a6a10] text-[11.5px] uppercase mb-1">About the Role</div>
              <p className="m-0 leading-relaxed text-[#3a3d45]">{external?.about_role || draft?.summary}</p>
            </div>

            <div>
              <div className="font-bold text-[#8a6a10] text-[11.5px] uppercase mb-1">What You&apos;ll Do</div>
              <ul className="m-0 pl-4 space-y-1">
                {(external?.responsibilities?.length ? external.responsibilities : draft?.responsibilities || []).map((r, i) => (
                  <li key={i} className="leading-relaxed">{r}</li>
                ))}
              </ul>
            </div>

            <div>
              <div className="font-bold text-[#b83838] text-[11.5px] uppercase mb-1">Must-Have Qualifications (Non-Negotiable)</div>
              <ul className="m-0 pl-4 space-y-1">
                {(external?.must_have_qualifications?.length ? external.must_have_qualifications : draft?.must_have_skills || []).map((q, i) => (
                  <li key={i} className="leading-relaxed">{q}</li>
                ))}
              </ul>
            </div>

            <div>
              <div className="font-bold text-[#8a6a10] text-[11.5px] uppercase mb-1">Preferred Qualifications & Bonus Strengths</div>
              <ul className="m-0 pl-4 space-y-1">
                {(external?.preferred_qualifications?.length ? external.preferred_qualifications : draft?.good_to_have_skills || []).map((q, i) => (
                  <li key={i} className="leading-relaxed">{q}</li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>

      {error && <p className="text-[12.5px] text-[#d03b3b]">{error}</p>}

      <div className="flex gap-3">
        <button
          disabled={deciding}
          onClick={() => onDecide(true)}
          className="flex-1 bg-[#107038] text-white font-bold text-[13.5px] rounded-xl py-3 shadow-xs hover:opacity-95 transition-opacity disabled:opacity-50 cursor-pointer"
        >
          {deciding ? "Finalizing…" : "Approve & Finalize Both"}
        </button>
        <button
          disabled={deciding}
          onClick={() => onDecide(false)}
          className="flex-1 border border-[#d8d1c0] bg-white font-bold text-[13.5px] text-[#5c584c] rounded-xl py-3 hover:bg-[#f7f4ec] transition-colors disabled:opacity-50 cursor-pointer"
        >
          Request Changes
        </button>
      </div>
    </div>
  );
}
