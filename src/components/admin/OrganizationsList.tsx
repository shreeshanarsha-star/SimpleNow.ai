"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import OrgAccessRow from "./OrgAccessRow";

interface Org {
  id: string;
  name: string;
  status: "pending" | "approved" | "suspended";
  plan: "individual" | "bulk";
  created_at: string;
  memberCount: number;
  features: string[];
  talentRequisitions: number;
  talentCandidates: number;
}

export default function OrganizationsList({ orgs, allFeatures }: { orgs: Org[]; allFeatures: string[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkFeature, setBulkFeature] = useState(allFeatures[0] || "");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return orgs.filter((o) => {
      if (needle && !o.name.toLowerCase().includes(needle)) return false;
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      return true;
    });
  }, [orgs, q, statusFilter]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runBulk(action: "grant" | "revoke") {
    if (!selected.size || !bulkFeature) return;
    setBulkBusy(true);
    setBulkError(null);
    try {
      const res = await fetch("/api/admin/organizations/bulk-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgIds: Array.from(selected), featureKey: bulkFeature, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bulk action failed.");
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Bulk action failed.");
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search organizations…"
          className="input flex-1 max-w-[280px] text-[13px]"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input max-w-[160px] text-[13px]">
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {selected.size > 0 && (
        <div className="border border-brand/40 bg-brand-wash rounded-md px-3.5 py-2.5 mb-3 flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] font-bold">{selected.size} selected</span>
          <select value={bulkFeature} onChange={(e) => setBulkFeature(e.target.value)} className="input max-w-[180px] text-[12px]">
            {allFeatures.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <button
            onClick={() => runBulk("grant")}
            disabled={bulkBusy}
            className="text-[12px] font-bold px-3 py-1.5 rounded-sm bg-good text-white disabled:opacity-50"
          >
            Grant to all
          </button>
          <button
            onClick={() => runBulk("revoke")}
            disabled={bulkBusy}
            className="text-[12px] font-bold px-3 py-1.5 rounded-sm border border-border bg-surface disabled:opacity-50"
          >
            Revoke from all
          </button>
          <button onClick={() => setSelected(new Set())} className="text-[12px] text-ink-muted">
            Clear
          </button>
          {bulkError && <span className="text-[12px] text-critical">{bulkError}</span>}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="border border-dashed border-border rounded-md px-4 py-6 text-center text-[13px] text-ink-muted">
          No organizations match that search.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((org) => (
            <div key={org.id} className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={selected.has(org.id)}
                onChange={() => toggleSelect(org.id)}
                className="mt-4"
                aria-label={`Select ${org.name}`}
              />
              <div className="flex-1 min-w-0">
                <OrgAccessRow org={org} allFeatures={allFeatures} />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
