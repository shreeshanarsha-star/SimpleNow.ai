"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import RequisitionTabs from "@/components/tools/RequisitionTabs";

type EligibilityCriteria = {
  role_title: string | null;
  min_years_experience: number | null;
  qualification: string | null;
  must_have_skills: string[];
  good_to_have_skills: string[];
  other_notes: string | null;
};

type Requisition = {
  id: string;
  req_no: string;
  title: string;
  location: string | null;
  department: string | null;
  jd_source_text: string | null;
  description: string | null;
  eligibility_criteria: EligibilityCriteria | null;
  eligibility_criteria_updated_at: string | null;
};

function reqLabel(r: { req_no?: string; title: string; location?: string | null }) {
  const suffix = r.location ? `${r.title}-${r.location}` : r.title;
  return r.req_no ? `${r.req_no} ${suffix}` : suffix;
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

const EMPTY_CRITERIA: EligibilityCriteria = {
  role_title: null,
  min_years_experience: null,
  qualification: null,
  must_have_skills: [],
  good_to_have_skills: [],
  other_notes: null,
};

function SkillChips({
  skills,
  tone,
  onRemove,
}: {
  skills: string[];
  tone: "must" | "good";
  onRemove: (skill: string) => void;
}) {
  if (skills.length === 0) {
    return <div className="text-[12px] text-ink-muted">None added yet.</div>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {skills.map((s) => (
        <span
          key={s}
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${
            tone === "must" ? "bg-brand-wash text-brand" : "border border-border text-ink-2"
          }`}
        >
          {s}
          <button
            type="button"
            onClick={() => onRemove(s)}
            className="opacity-60 hover:opacity-100"
            aria-label={`Remove ${s}`}
            title={`Remove ${s}`}
          >
            <Icon name="x" className="w-3 h-3" />
          </button>
        </span>
      ))}
    </div>
  );
}

function SkillInput({ placeholder, onAdd }: { placeholder: string; onAdd: (skill: string) => void }) {
  const [value, setValue] = useState("");
  function submit() {
    const v = value.trim();
    if (!v) return;
    onAdd(v);
    setValue("");
  }
  return (
    <div className="flex items-center gap-1.5">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        className="flex-1 text-[12.5px] border border-border rounded-md px-2.5 py-1.5 bg-page focus:outline-none focus:border-brand"
      />
      <button
        type="button"
        onClick={submit}
        className="text-[11.5px] font-semibold px-2.5 py-1.5 rounded-md border border-border text-ink-2 hover:border-brand hover:text-brand"
      >
        Add
      </button>
    </div>
  );
}

export default function EligibilityCriteriaView({ requisitionId }: { requisitionId: string }) {
  const router = useRouter();
  const [requisition, setRequisition] = useState<Requisition | null>(null);
  const [criteria, setCriteria] = useState<EligibilityCriteria>(EMPTY_CRITERIA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pulling, setPulling] = useState(false);
  const [pullError, setPullError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requisitionId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/talent-ai/requisitions/${requisitionId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load requisition.");
      setRequisition(data.requisition);
      setCriteria({ ...EMPTY_CRITERIA, ...(data.requisition.eligibility_criteria || {}) });
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load requisition.");
    } finally {
      setLoading(false);
    }
  }

  function update(patch: Partial<EligibilityCriteria>) {
    setCriteria((c) => ({ ...c, ...patch }));
    setDirty(true);
    setSaveStatus(null);
  }

  async function handleAutoPull() {
    setPulling(true);
    setPullError(null);
    try {
      const res = await fetch(`/api/talent-ai/requisitions/${requisitionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "structure_eligibility_criteria" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not pull criteria from the JD.");
      // Merge in — never silently drop skills the recruiter already typed
      // in by hand before clicking Auto-pull.
      setCriteria((c) => ({
        role_title: data.criteria.role_title || c.role_title,
        min_years_experience: data.criteria.min_years_experience ?? c.min_years_experience,
        qualification: data.criteria.qualification || c.qualification,
        must_have_skills: Array.from(new Set([...(c.must_have_skills || []), ...(data.criteria.must_have_skills || [])])),
        good_to_have_skills: Array.from(new Set([...(c.good_to_have_skills || []), ...(data.criteria.good_to_have_skills || [])])),
        other_notes: c.other_notes || data.criteria.other_notes,
      }));
      setDirty(true);
    } catch (err) {
      setPullError(err instanceof Error ? err.message : "Could not pull criteria from the JD.");
    } finally {
      setPulling(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaveStatus("Saving…");
    try {
      const res = await fetch(`/api/talent-ai/requisitions/${requisitionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eligibilityCriteria: criteria }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save eligibility criteria.");
      setDirty(false);
      setSaveStatus("Saved. Re-scoring existing candidates against the updated criteria…");
      const scoreRes = await fetch(`/api/talent-ai/requisitions/${requisitionId}/score-candidates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const scoreData = await scoreRes.json();
      if (scoreRes.ok) {
        setSaveStatus(
          scoreData.total > 0
            ? `Saved. Re-scored ${scoreData.scored} of ${scoreData.total} existing candidate${scoreData.total === 1 ? "" : "s"} against the new criteria.`
            : "Saved."
        );
      } else {
        setSaveStatus("Saved, but re-scoring existing candidates failed — you can retry from the Candidates tab.");
      }
      await load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save eligibility criteria.");
      setSaveStatus(null);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-[13px] text-ink-muted">Loading…</div>;
  }
  if (error || !requisition) {
    return (
      <div className="flex flex-col gap-3">
        <button onClick={() => router.push("/tools/talent-ai")} className="text-[12.5px] font-semibold text-brand self-start">
          ← Back to My requisitions
        </button>
        <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2">{error || "Requisition not found."}</div>
      </div>
    );
  }

  const hasJd = !!(requisition.jd_source_text || requisition.description);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <button onClick={() => router.push("/tools/talent-ai")} className="text-[11.5px] font-semibold text-brand mb-1">
            ← Back to My requisitions
          </button>
          <h1 className="m-0 text-[19px] font-bold">{reqLabel(requisition)}</h1>
          <div className="text-[12px] text-ink-muted mt-0.5">{requisition.department || "No department"}</div>
        </div>
      </div>

      <RequisitionTabs requisitionId={requisitionId} active="eligibility" />

      <div className="max-w-[720px] flex flex-col gap-4">
        <div className="border border-border rounded-lg bg-surface p-4 flex flex-col gap-1">
          <div className="text-[13px] font-bold text-ink">How matching works</div>
          <p className="text-[12.5px] text-ink-muted leading-relaxed m-0">
            Set what this role actually requires and the AI match % on the Candidates tab is scored against
            it — must-have skills carry most of the weight. A candidate missing a must-have still shows up
            and scores lower rather than being hidden, so you always see the full picture.
          </p>
        </div>

        <div className="border border-border rounded-lg bg-surface p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[13px] font-bold text-ink">Auto-pull from job description</div>
            <button
              onClick={handleAutoPull}
              disabled={pulling || !hasJd}
              title={hasJd ? undefined : "This requisition has no JD text — add criteria manually below."}
              className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-2.5 py-1.5 rounded-md bg-brand text-white disabled:opacity-50"
            >
              <Icon name="sparkle" className="w-3.5 h-3.5" />
              {pulling ? "Pulling…" : "Auto-pull from JD"}
            </button>
          </div>
          <p className="text-[12px] text-ink-muted m-0">
            AI reads this requisition&apos;s job description and drafts must-have skills, good-to-have skills,
            minimum experience, and qualification. Review and edit everything below before saving — nothing
            is final until you save.
          </p>
          {pullError && <div className="bg-critical-wash text-critical text-[12px] rounded-sm px-2.5 py-1.5">{pullError}</div>}
        </div>

        <div className="border border-border rounded-lg bg-surface p-4 flex flex-col gap-3">
          <div className="text-[13px] font-bold text-ink">Must-have skills</div>
          <p className="text-[11.5px] text-ink-muted -mt-2 m-0">Non-negotiable. Weighted heaviest in the match score.</p>
          <SkillChips
            skills={criteria.must_have_skills}
            tone="must"
            onRemove={(s) => update({ must_have_skills: criteria.must_have_skills.filter((x) => x !== s) })}
          />
          <SkillInput
            placeholder="e.g. React, 5+ years B2B SaaS sales, CPA"
            onAdd={(s) => update({ must_have_skills: Array.from(new Set([...criteria.must_have_skills, s])) })}
          />
        </div>

        <div className="border border-border rounded-lg bg-surface p-4 flex flex-col gap-3">
          <div className="text-[13px] font-bold text-ink">Good-to-have skills</div>
          <p className="text-[11.5px] text-ink-muted -mt-2 m-0">A plus, not required. Weighted lightly.</p>
          <SkillChips
            skills={criteria.good_to_have_skills}
            tone="good"
            onRemove={(s) => update({ good_to_have_skills: criteria.good_to_have_skills.filter((x) => x !== s) })}
          />
          <SkillInput
            placeholder="e.g. GraphQL, prior agency experience"
            onAdd={(s) => update({ good_to_have_skills: Array.from(new Set([...criteria.good_to_have_skills, s])) })}
          />
        </div>

        <div className="border border-border rounded-lg bg-surface p-4 grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted mb-1">Minimum years of experience</div>
            <input
              type="number"
              min={0}
              value={criteria.min_years_experience ?? ""}
              onChange={(e) => update({ min_years_experience: e.target.value === "" ? null : Number(e.target.value) })}
              placeholder="e.g. 5"
              className="w-full text-[12.5px] border border-border rounded-md px-2.5 py-1.5 bg-page focus:outline-none focus:border-brand"
            />
          </div>
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted mb-1">Required qualification</div>
            <input
              value={criteria.qualification ?? ""}
              onChange={(e) => update({ qualification: e.target.value || null })}
              placeholder="e.g. B.Tech or equivalent"
              className="w-full text-[12.5px] border border-border rounded-md px-2.5 py-1.5 bg-page focus:outline-none focus:border-brand"
            />
          </div>
          <div className="col-span-2">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted mb-1">Other non-negotiables</div>
            <textarea
              value={criteria.other_notes ?? ""}
              onChange={(e) => update({ other_notes: e.target.value || null })}
              placeholder="e.g. Must be willing to work from the Bangalore office 3 days/week"
              rows={2}
              className="w-full text-[12.5px] border border-border rounded-md px-2.5 py-1.5 bg-page focus:outline-none focus:border-brand resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="text-[11.5px] text-ink-muted">
            {requisition.eligibility_criteria_updated_at
              ? `Last saved ${fmtDate(requisition.eligibility_criteria_updated_at)}`
              : "Not set up yet — the Candidates tab falls back to plain JD matching until you save criteria here."}
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="text-[12px] font-semibold px-3.5 py-2 rounded-md bg-brand text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save criteria"}
          </button>
        </div>

        {saveStatus && <div className="bg-good-wash text-good-text text-[12px] rounded-sm px-2.5 py-2">{saveStatus}</div>}
        {saveError && <div className="bg-critical-wash text-critical text-[12px] rounded-sm px-2.5 py-2">{saveError}</div>}
      </div>
    </div>
  );
}
