"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import AdminNav from "@/components/admin/AdminNav";

interface InspectData {
  org: { id: string; name: string; status: string; plan: string; created_at: string };
  members: { id: string; email: string; full_name: string | null; org_role: string | null; created_at: string }[];
  usage: Record<string, Record<string, number>>;
  recentActivity: { id: string; action: string; actor_email: string | null; target_label: string | null; created_at: string }[];
}

export default function InspectOrgPage() {
  const params = useParams();
  const orgId = params?.id as string;
  const [data, setData] = useState<InspectData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/admin/organizations/${orgId}/inspect`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Could not load organization.");
        setData(body);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load organization."));
  }, [orgId]);

  return (
    <AppShell title="Admin — Inspect organization">
      <AdminNav />
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/admin/organizations" className="text-[12px] font-bold text-brand">
            ← Organizations
          </Link>
          <h2 className="m-0 mt-2 text-[19px] font-bold">{data?.org.name || "Loading…"}</h2>
          <p className="m-0 mt-1 text-[12.5px] text-ink-muted">
            Read-only support view. You are not signed in as this organization, nothing here counts against
            their credits or usage, and this look is recorded in the Activity Log.
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2 mb-4">{error}</div>
      )}

      {data && (
        <div className="flex flex-col gap-6">
          <section className="border border-border rounded-md bg-surface px-4 py-3.5">
            <h3 className="m-0 mb-2 text-[13px] font-bold">Organization</h3>
            <div className="text-[12.5px] text-ink-2 flex flex-wrap gap-x-6 gap-y-1">
              <span>Status: <strong className="capitalize">{data.org.status}</strong></span>
              <span>Plan: <strong className="capitalize">{data.org.plan}</strong></span>
              <span>Created: {new Date(data.org.created_at).toLocaleDateString()}</span>
              <span>{data.members.length} member{data.members.length === 1 ? "" : "s"}</span>
            </div>
          </section>

          <section className="border border-border rounded-md bg-surface px-4 py-3.5">
            <h3 className="m-0 mb-3 text-[13px] font-bold">Usage across tools</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {Object.entries(data.usage).map(([tool, counts]) => (
                <div key={tool} className="border border-border rounded-sm px-3 py-2 bg-page">
                  <div className="text-[11.5px] font-bold mb-1">{tool}</div>
                  {Object.entries(counts).map(([k, v]) => (
                    <div key={k} className="text-[11px] text-ink-muted capitalize">
                      {v} {k}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>

          <section className="border border-border rounded-md bg-surface px-4 py-3.5">
            <h3 className="m-0 mb-3 text-[13px] font-bold">Members</h3>
            {data.members.length === 0 ? (
              <p className="text-[12px] text-ink-muted m-0">No members yet.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {data.members.map((m) => (
                  <div key={m.id} className="text-[12.5px] flex items-center justify-between border-b border-border/50 pb-1.5">
                    <span>{m.full_name || m.email}</span>
                    <span className="text-ink-muted text-[11px]">
                      {m.org_role || "member"} · joined {new Date(m.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="border border-border rounded-md bg-surface px-4 py-3.5">
            <h3 className="m-0 mb-3 text-[13px] font-bold">Recent owner activity on this org</h3>
            {data.recentActivity.length === 0 ? (
              <p className="text-[12px] text-ink-muted m-0">No recorded activity yet.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {data.recentActivity.map((a) => (
                  <div key={a.id} className="text-[12px] text-ink-2 flex items-center justify-between">
                    <span>
                      {a.actor_email} — {a.action.replace(/_/g, " ")}
                      {a.target_label ? ` (${a.target_label})` : ""}
                    </span>
                    <span className="text-ink-muted text-[11px]">{new Date(a.created_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}
