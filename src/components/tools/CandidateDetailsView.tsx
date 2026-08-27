"use client";

import { useCallback, useEffect, useState } from "react";
import { useRegisterToolHome } from "@/components/ToolHomeContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { VScroller } from "@/components/Scroller";
import Icon from "@/components/Icon";
import CandidateTabs from "@/components/tools/CandidateTabs";
import { STAGE_LABEL } from "@/lib/talentStages";

type StageHistoryEntry = {
  from_stage: string | null;
  to_stage: string;
  note: string | null;
  changed_by: string | null;
  created_at: string;
};

type Candidate = {
  id: string;
  name: string;
  resume_text: string | null;
  resume_file_name: string | null;
  resume_file_path: string | null;
  source: string | null;
  tags: string[] | null;
  rating: number | null;
  created_at: string;
  talent_requisitions: { id: string; req_no: string; title: string; location: string | null; department: string | null } | null;
  talent_stage_history: StageHistoryEntry[] | null;
};

function fmtDateTime(s: string) {
  return new Date(s).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

const SOURCE_LABEL: Record<string, string> = {
  sourced: "Resume upload / sourced",
  internal_application: "Internal application",
  referral: "Employee referral",
  other: "Other",
};

export default function CandidateDetailsView({ candidateId }: { candidateId: string }) {
  const router = useRouter();

  // Topbar's clickable "Talent.ai" title (ToolHomeContext) returns here
  // to the tool's own home tab, from wherever this drill-down view sits.
  useRegisterToolHome(useCallback(() => router.push("/tools/talent-ai"), [router]));
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [resumeFileUrl, setResumeFileUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/talent-ai/candidates/${candidateId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load candidate.");
      setCandidate(data.candidate);
      setResumeFileUrl(data.resumeFileUrl || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load candidate.");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-[13px] text-ink-muted">Loading…</div>;
  }
  if (error || !candidate) {
    return (
      <div className="flex flex-col gap-3">
        <button onClick={() => router.push("/tools/talent-ai")} className="text-[12.5px] font-semibold text-brand self-start">
          ← Back to My requisitions
        </button>
        <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2">{error || "Candidate not found."}</div>
      </div>
    );
  }

  const req = candidate.talent_requisitions;
  const history = [...(candidate.talent_stage_history || [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const isPdf = resumeFileUrl && (candidate.resume_file_name || "").toLowerCase().endsWith(".pdf");

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <div>
        {req && (
          <Link href={`/tools/talent-ai/requisitions/${req.id}`} className="text-[11.5px] font-semibold text-brand">
            ← Back to {req.req_no} {req.title}{req.location ? `-${req.location}` : ""}
          </Link>
        )}
        <h1 className="m-0 text-[19px] font-bold mt-1.5">{candidate.name}</h1>
        <div className="text-[12px] text-ink-muted mt-0.5">Candidate details</div>
      </div>

      <CandidateTabs candidateId={candidateId} active="details" />

      <div className="border border-border rounded-lg p-4 bg-surface">
        <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-2">Original CV</div>
        {resumeFileUrl ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[12.5px] text-ink-2 truncate">{candidate.resume_file_name || "Resume file"}</div>
              <a
                href={resumeFileUrl}
                target="_blank"
                rel="noreferrer"
                download={candidate.resume_file_name || undefined}
                className="text-[11.5px] font-semibold px-3 py-1.5 border border-border rounded-md hover:border-brand flex-shrink-0 flex items-center gap-1.5"
              >
                <Icon name="upload" className="w-3.5 h-3.5 rotate-180" />
                Download
              </a>
            </div>
            {isPdf ? (
              <iframe src={resumeFileUrl} className="w-full h-[520px] border border-border rounded-md" title="Original CV" />
            ) : (
              <div className="text-[12px] text-ink-muted border border-dashed border-border rounded-md px-3 py-6 text-center">
                Preview isn&apos;t available for this file type — use Download to open it.
              </div>
            )}
          </div>
        ) : (
          <div className="text-[12.5px] text-ink-muted border border-dashed border-border rounded-md px-3 py-6 text-center">
            No original file on record for this candidate. This usually means they were added before file storage was
            wired up (only the extracted text below was kept) — re-uploading their resume from the Candidates tab
            will attach the original file going forward.
          </div>
        )}
      </div>

      {candidate.resume_text && (
        <div className="border border-border rounded-lg p-4 bg-surface">
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1.5">Parsed resume text</div>
          <VScroller className="max-h-96">
            <p className="text-[12px] text-ink-2 whitespace-pre-wrap m-0">{candidate.resume_text}</p>
          </VScroller>
        </div>
      )}

      <div className="border border-border rounded-lg p-4 bg-surface">
        <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-2">Application details</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted mb-0.5">Source</div>
            <div className="text-[13px] text-ink">{candidate.source ? SOURCE_LABEL[candidate.source] || candidate.source : "—"}</div>
          </div>
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted mb-0.5">Applied on</div>
            <div className="text-[13px] text-ink">{fmtDateTime(candidate.created_at)}</div>
          </div>
          {candidate.rating != null && (
            <div>
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted mb-0.5">Rating</div>
              <div className="text-[13px] text-ink">{candidate.rating} / 5</div>
            </div>
          )}
          {candidate.tags && candidate.tags.length > 0 && (
            <div className="col-span-2">
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted mb-1">Tags / skills</div>
              <div className="flex flex-wrap gap-1.5">
                {candidate.tags.map((t) => (
                  <span key={t} className="text-[11px] font-semibold px-2 py-0.5 rounded-sm bg-brand-wash text-brand">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border border-border rounded-lg p-4 bg-surface">
        <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-2">Stage history</div>
        {history.length === 0 ? (
          <div className="text-[12.5px] text-ink-muted">No stage changes recorded yet.</div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {history.map((h, i) => (
              <div key={i} className="flex items-start gap-2.5 text-[12.5px]">
                <div className="w-1.5 h-1.5 rounded-full bg-brand mt-1.5 flex-shrink-0" />
                <div>
                  <div className="text-ink">
                    {h.from_stage ? (
                      <>
                        {STAGE_LABEL[h.from_stage] || h.from_stage} <span className="text-ink-muted">→</span>{" "}
                        {STAGE_LABEL[h.to_stage] || h.to_stage}
                      </>
                    ) : (
                      <>Added to pipeline — {STAGE_LABEL[h.to_stage] || h.to_stage}</>
                    )}
                  </div>
                  <div className="text-[11px] text-ink-muted">
                    {fmtDateTime(h.created_at)}
                    {h.note ? ` · ${h.note}` : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
