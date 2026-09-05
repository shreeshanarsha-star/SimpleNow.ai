"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import AdminNav from "@/components/admin/AdminNav";

interface Entry {
  id: string;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export default function ActivityLogPage() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/activity-log")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Could not load activity log.");
        setEntries(body.entries);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load activity log."));
  }, []);

  return (
    <AppShell title="Admin — Activity Log">
      <AdminNav />
      <div className="mb-6">
        <h2 className="m-0 text-[19px] font-bold">Activity Log</h2>
        <p className="m-0 mt-1 text-[13px] text-ink-muted">
          Every owner-console action, permanently recorded: approvals, suspensions, feature grants,
          kill-switch toggles, and org inspections.
        </p>
      </div>

      {error && (
        <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2 mb-4">{error}</div>
      )}

      {entries === null ? (
        <p className="text-[13px] text-ink-muted">Loading…</p>
      ) : entries.length === 0 ? (
        <div className="border border-dashed border-border rounded-md px-4 py-6 text-center text-[13px] text-ink-muted">
          No activity recorded yet.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {entries.map((e) => (
            <div
              key={e.id}
              className="border border-border rounded-md bg-surface px-3.5 py-2.5 flex items-center justify-between text-[12.5px]"
            >
              <span>
                <strong>{e.actor_email || "owner"}</strong> — {e.action.replace(/_/g, " ")}
                {e.target_label ? (
                  <>
                    {" "}
                    <span className="text-ink-muted">
                      ({e.target_type}: {e.target_label})
                    </span>
                  </>
                ) : null}
              </span>
              <span className="text-ink-muted text-[11px] flex-shrink-0 ml-3">
                {new Date(e.created_at).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
