"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Application = {
  id: string;
  candidate_name: string;
  candidate_email: string;
  candidate_phone: string | null;
  cover_note: string | null;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  job_postings?: { title: string } | null;
};

const STATUS_LABEL: Record<string, string> = {
  pending_approval: "Pending",
  approved: "Shortlisted",
  rejected: "Rejected",
  published: "Moved forward",
};

const STATUS_CLASS: Record<string, string> = {
  pending_approval: "bg-warning-wash text-ink",
  approved: "bg-good-wash text-good-text",
  rejected: "bg-critical-wash text-critical",
  published: "bg-brand-wash text-brand",
};

export default function ApplicationApprovalRow({
  application,
  readOnly = false,
}: {
  application: Application;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);

  async function act(action: "approve" | "reject" | "publish", rejectionReason?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/applications/${application.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, rejectionReason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function loadResume() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/applications/${application.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not open resume.");
      setResumeUrl(data.url);
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open resume.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-border rounded-md bg-surface">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <span className="text-[13.5px] font-medium flex-1">
          {application.candidate_name}
          {application.job_postings?.title && (
            <span className="text-ink-muted font-normal">
              {" "}
              — {application.job_postings.title}
            </span>
          )}
        </span>
        <span
          className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${STATUS_CLASS[application.status] || "bg-page text-ink-muted"}`}
        >
          {STATUS_LABEL[application.status] || application.status}
        </span>
      </button>

      {open && (
        <div className="border-t border-border px-4 py-3">
          <div className="text-[12.5px] text-ink-2 mb-1">{application.candidate_email}</div>
          {application.candidate_phone && (
            <div className="text-[12.5px] text-ink-2 mb-2">{application.candidate_phone}</div>
          )}
          {application.cover_note && (
            <p className="text-[12.5px] text-ink-2 whitespace-pre-wrap mb-3">
              {application.cover_note}
            </p>
          )}

          <button
            onClick={loadResume}
            disabled={busy}
            className="border border-border text-[12px] font-bold px-3 py-1.5 rounded-sm bg-page mb-3 disabled:opacity-50"
          >
            {resumeUrl ? "Open resume again" : "View resume"}
          </button>

          {application.rejection_reason && (
            <p className="text-[12.5px] text-critical mb-3">
              Rejected: {application.rejection_reason}
            </p>
          )}

          {error && <p className="text-[12.5px] text-critical mb-2">{error}</p>}

          {!readOnly && application.status === "pending_approval" && (
            <div className="flex gap-2">
              <button
                onClick={() => act("approve")}
                disabled={busy}
                className="bg-good text-white text-[12.5px] font-bold px-3 py-1.5 rounded-sm disabled:opacity-50"
              >
                Shortlist
              </button>
              <button
                onClick={() => {
                  const reason = window.prompt("Reason for rejecting (optional):") || undefined;
                  act("reject", reason);
                }}
                disabled={busy}
                className="border border-border text-[12.5px] font-bold px-3 py-1.5 rounded-sm bg-surface disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          )}

          {!readOnly && application.status === "approved" && (
            <button
              onClick={() => act("publish")}
              disabled={busy}
              className="bg-brand text-white text-[12.5px] font-bold px-3 py-1.5 rounded-sm disabled:opacity-50"
            >
              Move forward
            </button>
          )}
        </div>
      )}
    </div>
  );
}
