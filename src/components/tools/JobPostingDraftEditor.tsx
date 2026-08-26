"use client";

export type EditableJobPostingDraft = {
  fileName: string;
  title: string;
  company: string;
  company_url: string;
  location: string;
  mustHaveSkillsText: string; // comma-separated, edited as plain text
  goodToHaveSkillsText: string;
  qualification: string;
  minYearsExperience: string; // kept as string for input binding
  industry: string;
  ctcBudget: string;
  rawJdText: string;
  error?: string;
};

// One editable card for an AI-structured JD draft -- shared by the public
// /jobs/post flow and the org-gated /tools/job-postings-ai form. AI fills
// every field in from the uploaded JD; nothing here is required to have
// come from AI untouched -- every field is a plain input the user can
// correct before posting.
export default function JobPostingDraftEditor({
  draft,
  onChange,
  onRemove,
}: {
  draft: EditableJobPostingDraft;
  onChange: (next: EditableJobPostingDraft) => void;
  onRemove?: () => void;
}) {
  function set<K extends keyof EditableJobPostingDraft>(key: K, value: EditableJobPostingDraft[K]) {
    onChange({ ...draft, [key]: value });
  }

  if (draft.error) {
    return (
      <div className="border border-critical rounded-md bg-critical-wash px-4 py-3">
        <div className="text-[12.5px] font-bold text-critical">{draft.fileName}</div>
        <div className="text-[12px] text-critical mt-0.5">{draft.error}</div>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-md bg-surface p-4 shadow-soft-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">{draft.fileName}</div>
        {onRemove && (
          <button onClick={onRemove} className="text-[11px] font-bold text-critical">
            Remove
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <Field label="Job title">
          <input value={draft.title} onChange={(e) => set("title", e.target.value)} className="input" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Company">
            <input value={draft.company} onChange={(e) => set("company", e.target.value)} className="input" />
          </Field>
          <Field label="Company URL (optional)">
            <input
              value={draft.company_url}
              onChange={(e) => set("company_url", e.target.value)}
              className="input"
              placeholder="https://…"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Location">
            <input value={draft.location} onChange={(e) => set("location", e.target.value)} className="input" />
          </Field>
          <Field label="Min. years experience">
            <input
              type="number"
              value={draft.minYearsExperience}
              onChange={(e) => set("minYearsExperience", e.target.value)}
              className="input"
            />
          </Field>
        </div>

        <Field label="Must-have skills (comma-separated)">
          <input
            value={draft.mustHaveSkillsText}
            onChange={(e) => set("mustHaveSkillsText", e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Good-to-have skills (comma-separated)">
          <input
            value={draft.goodToHaveSkillsText}
            onChange={(e) => set("goodToHaveSkillsText", e.target.value)}
            className="input"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Qualification">
            <input
              value={draft.qualification}
              onChange={(e) => set("qualification", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Industry">
            <input value={draft.industry} onChange={(e) => set("industry", e.target.value)} className="input" />
          </Field>
        </div>

        <Field label="Compensation / budget (optional)">
          <input value={draft.ctcBudget} onChange={(e) => set("ctcBudget", e.target.value)} className="input" />
        </Field>
      </div>

      <style jsx global>{`
        .input {
          width: 100%;
          border: 1px solid #e1e0d9;
          border-radius: 7px;
          padding: 8px 10px;
          font-size: 13px;
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
      <span className="block text-[11px] font-bold mb-1">{label}</span>
      {children}
    </label>
  );
}
