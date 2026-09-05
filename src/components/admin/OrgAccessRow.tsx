"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Org = {
  id: string;
  name: string;
  status: "pending" | "approved" | "suspended";
  plan: "individual" | "bulk";
  created_at: string;
  memberCount: number;
  features: string[];
  talentRequisitions: number;
  talentCandidates: number;
};

export default function OrgAccessRow({ org, allFeatures }: { org: Org; allFeatures: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const granted = new Set(org.features);
  const hasTalentAccess = org.plan === "bulk" || granted.has("Talent.ai") || org.talentRequisitions > 0;

  async function patchOrg(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/admin/organizations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: org.id, action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "That action failed.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That action failed.");
    } finally {
      setBusy(null);
    }
  }

  async function toggleFeature(feature: string, isGranted: boolean) {
    setBusy(feature);
    setError(null);
    try {
      const res = await fetch(`/api/admin/organizations/${org.id}/access`, {
        method: isGranted ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featureKey: feature }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update access.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update access.");
    } finally {
      setBusy(null);
    }
  }

  const statusStyle =
    org.status === "approved"
      ? "bg-good-wash text-good-text"
      : org.status === "pending"
      ? "bg-brand-wash text-brand"
      : "bg-critical-wash text-critical";

  return (
    <div className="border border-border rounded-md bg-surface px-4 py-3.5 flex flex-col gap-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-9 h-9 rounded-full bg-ink text-white text-[12px] font-bold flex items-center justify-center flex-shrink-0">
          {org.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-bold truncate">{org.name}</div>
          <div className="text-[11px] text-ink-muted">
            {org.memberCount} member{org.memberCount === 1 ? "" : "s"} · Created{" "}
            {new Date(org.created_at).toLocaleDateString()}
          </div>
        </div>
        <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full capitalize ${statusStyle}`}>
          {org.status}
        </span>
        <select
          value={org.plan}
          onChange={(e) => patchOrg("set_plan", { plan: e.target.value })}
          disabled={busy === "set_plan"}
          className="input max-w-[130px] text-[12px]"
        >
          <option value="individual">Individual</option>
          <option value="bulk">Bulk (all tools)</option>
        </select>
        {org.status === "pending" && (
          <button
            onClick={() => patchOrg("approve")}
            disabled={busy === "approve"}
            className="bg-good text-white text-[12px] font-bold px-3 py-1.5 rounded-sm disabled:opacity-50"
          >
            {busy === "approve" ? "Approving…" : "Approve"}
          </button>
        )}
        {org.status === "approved" && (
          <button
            onClick={() => patchOrg("suspend")}
            disabled={busy === "suspend"}
            className="border border-border text-[12px] font-bold px-3 py-1.5 rounded-sm bg-surface disabled:opacity-50"
          >
            Suspend
          </button>
        )}
        {org.status === "suspended" && (
          <button
            onClick={() => patchOrg("reactivate")}
            disabled={busy === "reactivate"}
            className="bg-good text-white text-[12px] font-bold px-3 py-1.5 rounded-sm disabled:opacity-50"
          >
            Reactivate
          </button>
        )}
        <Link
          href={`/admin/organizations/${org.id}`}
          className="text-[12px] font-bold px-3 py-1.5 rounded-sm border border-border bg-surface text-ink-2"
        >
          Inspect →
        </Link>
      </div>

      {error && <p className="text-[12px] text-critical m-0">{error}</p>}

      {org.plan === "bulk" ? (
        <p className="text-[11.5px] text-ink-muted m-0">Bulk plan — every live tool is included automatically.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {allFeatures.map((feature) => {
            const isGranted = granted.has(feature);
            return (
              <button
                key={feature}
                onClick={() => toggleFeature(feature, isGranted)}
                disabled={busy === feature}
                className={`text-[12px] font-bold px-3 py-1.5 rounded-sm border disabled:opacity-50 ${
                  isGranted
                    ? "bg-good-wash text-good-text border-transparent"
                    : "bg-page text-ink-muted border-border"
                }`}
              >
                {isGranted ? "✓ " : ""}
                {feature}
              </button>
            );
          })}
        </div>
      )}

      {hasTalentAccess && (
        <p className="text-[11.5px] text-ink-muted m-0 pt-1 border-t border-border/60">
          Talent.ai: {org.talentRequisitions} requisition{org.talentRequisitions === 1 ? "" : "s"} ·{" "}
          {org.talentCandidates} candidate{org.talentCandidates === 1 ? "" : "s"} in pipeline
        </p>
      )}
    </div>
  );
}
