"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Posting = {
  id: string;
  title: string;
  location: string | null;
  employment_type: string | null;
  description: string;
  ai_polished_description: string | null;
  status: string;
  rejection_reason: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending_approval: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  published: "Published",
  draft: "Draft",
};

const STATUS_CLASS: Record<string, string> = {
  pending_approval: "bg-warning-wash text-ink",
  approved: "bg-good-wash text-good-text",
  rejected: "bg-critical-wash text-critical",
  published: "bg-brand-wash text-brand",
  draft: "bg-page text-ink-muted",
};

export default function JobPostingApprovalRow({
  posting,
  readOnly = false,
}: {
  posting: Posting;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "approve" | "reject" | "publish", rejectionReason?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/job-postings/${posting.id}`, {
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

  return (
    <div className="border border-border rounded-md bg-surface">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <span className="text-[13.5px] font-medium flex-1">{posting.title}</span>
        {posting.location && (
          <span className="text-[11.5px] text-ink-muted">{posting.location}</span>
        )}
        <span
          className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${STATUS_CLASS[posting.status] || "bg-page text-ink-muted"}`}
        >
          {STATUS_LABEL[posting.status] || posting.status}
        </span>
      </button>

      {open && (
        <div className="border-t border-border px-4 py-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1.5">
            Description
          </div>
          <p className="text-[12.5px] text-ink-2 whitespace-pre-wrap mb-3">
            {posting.ai_polished_description || posting.description}
          </p>

          {posting.rejection_reason && (
            <p className="text-[12.5px] text-critical mb-3">
              Rejected: {posting.rejection_reason}
            </p>
          )}

          {error && (
            <p className="text-[12.5px] text-critical mb-2">{error}</p>
          )}

          {!readOnly && posting.status === "pending_approval" && (
            <div className="flex gap-2">
              <button
                onClick={() => act("approve")}
                disabled={busy}
                className="bg-good text-white text-[12.5px] font-bold px-3 py-1.5 rounded-sm disabled:opacity-50"
              >
                Approve
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

          {!readOnly && posting.status === "approved" && (
            <button
              onClick={() => act("publish")}
              disabled={busy}
              className="bg-brand text-white text-[12.5px] font-bold px-3 py-1.5 rounded-sm disabled:opacity-50"
            >
              Publish
            </button>
          )}
        </div>
      )}
    </div>
  );
}
