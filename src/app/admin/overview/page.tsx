"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import AdminNav from "@/components/admin/AdminNav";

interface OverviewData {
  orgs: { total: number; pending: number; approved: number; suspended: number };
  users: { total: number };
  guestFunnel: { started: number; active: number; atLimit: number; converted: number; conversionRate: number };
  toolUsage: Record<string, Record<string, number>>;
  killSwitches: { tools: { name: string; paused: boolean }[]; guestTrialEnabled: boolean };
  alerts: { agingPending: { id: string; name: string; created_at: string }[]; guestsAtLimit: number; emailFailures24h: number };
  recentActivity: { id: string; actor_email: string | null; action: string; target_type: string | null; target_label: string | null; created_at: string }[];
  recentEmailFailures: { id: string; tool: string; to_email: string | null; error: string | null; created_at: string }[];
}

function StatCard({ label, value, tone }: { label: string; value: number | string; tone?: "critical" | "brand" }) {
  return (
    <div className="border border-border rounded-md bg-surface px-4 py-3.5">
      <div className={`text-[24px] font-bold ${tone === "critical" ? "text-critical" : tone === "brand" ? "text-brand" : ""}`}>
        {value}
      </div>
      <div className="text-[11.5px] text-ink-muted mt-0.5">{label}</div>
    </div>
  );
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/overview")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Could not load overview.");
        setData(body);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load overview."));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleTool(name: string, paused: boolean) {
    setBusyKey(`tool:${name}`);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: paused ? "unpause_tool" : "pause_tool", tool: name }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Could not update.");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update.");
    } finally {
      setBusyKey(null);
    }
  }

  async function toggleGuestTrial(enabled: boolean) {
    setBusyKey("guest_trial");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_guest_trial_enabled", enabled }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Could not update.");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <AppShell title="Admin — Overview">
      <AdminNav />
      <div className="mb-6 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="m-0 text-[19px] font-bold">Overview</h2>
          <p className="m-0 mt-1 text-[13px] text-ink-muted">
            The whole platform at a glance -- orgs, the guest-trial funnel, usage across every tool, and
            kill switches you can flip without a redeploy.
          </p>
        </div>
        <div className="flex gap-2">
          <a href="/api/admin/export/organizations" className="text-[12px] font-bold px-3 py-1.5 rounded-sm border border-border bg-surface">
            Export orgs CSV
          </a>
          <a href="/api/admin/export/users" className="text-[12px] font-bold px-3 py-1.5 rounded-sm border border-border bg-surface">
            Export users CSV
          </a>
        </div>
      </div>

      {error && <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2 mb-4">{error}</div>}

      {!data ? (
        <p className="text-[13px] text-ink-muted">Loading…</p>
      ) : (
        <div className="flex flex-col gap-6">
          {(data.alerts.agingPending.length > 0 || data.alerts.emailFailures24h > 0) && (
            <section className="border border-critical/40 bg-critical-wash rounded-md px-4 py-3.5">
              <h3 className="m-0 mb-2 text-[13px] font-bold text-critical-text">Needs attention</h3>
              <div className="flex flex-col gap-1 text-[12.5px] text-critical-text">
                {data.alerts.agingPending.map((o) => (
                  <div key={o.id}>
                    <Link href="/admin/organizations" className="underline font-bold">
                      {o.name}
                    </Link>{" "}
                    has been pending approval since {new Date(o.created_at).toLocaleDateString()}.
                  </div>
                ))}
                {data.alerts.emailFailures24h > 0 && (
                  <div>{data.alerts.emailFailures24h} email send failure(s) in the last 24 hours (see below).</div>
                )}
              </div>
            </section>
          )}

          <section>
            <h3 className="m-0 mb-3 text-[13px] font-bold">Platform</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <StatCard label="Organizations" value={data.orgs.total} />
              <StatCard label="Pending approval" value={data.orgs.pending} tone={data.orgs.pending > 0 ? "brand" : undefined} />
              <StatCard label="Suspended" value={data.orgs.suspended} />
              <StatCard label="Registered users" value={data.users.total} />
            </div>
          </section>

          <section>
            <h3 className="m-0 mb-3 text-[13px] font-bold">Guest-trial funnel (no-signup access)</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <StatCard label="Trials started" value={data.guestFunnel.started} />
              <StatCard label="Currently active" value={data.guestFunnel.active} />
              <StatCard label="At their limit" value={data.guestFunnel.atLimit} tone={data.guestFunnel.atLimit > 0 ? "brand" : undefined} />
              <StatCard label="Converted to signup" value={data.guestFunnel.converted} />
              <StatCard label="Conversion rate" value={`${data.guestFunnel.conversionRate}%`} />
            </div>
          </section>

          <section>
            <h3 className="m-0 mb-3 text-[13px] font-bold">Usage across every tool (all orgs)</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {Object.entries(data.toolUsage).map(([tool, counts]) => (
                <div key={tool} className="border border-border rounded-md bg-surface px-3.5 py-3">
                  <div className="text-[12.5px] font-bold mb-1">{tool}</div>
                  {Object.entries(counts).map(([k, v]) => (
                    <div key={k} className="text-[11.5px] text-ink-muted capitalize">
                      {v} {k}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="m-0 mb-1 text-[13px] font-bold">Kill switches</h3>
            <p className="m-0 mb-3 text-[12px] text-ink-muted">
              Pause a tool or the guest trial for everyone instantly -- no redeploy. The platform owner is
              never affected by either.
            </p>
            <div className="flex flex-col gap-2">
              <div className="border border-border rounded-md bg-surface px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="text-[13px] font-bold">Guest trial (no-signup access)</div>
                  <div className="text-[11.5px] text-ink-muted">
                    {data.killSwitches.guestTrialEnabled ? "New guests can start a free trial." : "Paused -- no new guest sessions are being created."}
                  </div>
                </div>
                <button
                  onClick={() => toggleGuestTrial(!data.killSwitches.guestTrialEnabled)}
                  disabled={busyKey === "guest_trial"}
                  className={`text-[12px] font-bold px-3 py-1.5 rounded-sm disabled:opacity-50 ${
                    data.killSwitches.guestTrialEnabled ? "border border-border bg-page" : "bg-good text-white"
                  }`}
                >
                  {data.killSwitches.guestTrialEnabled ? "Pause" : "Resume"}
                </button>
              </div>
              {data.killSwitches.tools.map((t) => (
                <div key={t.name} className="border border-border rounded-md bg-surface px-4 py-3 flex items-center justify-between">
                  <div>
                    <div className="text-[13px] font-bold">{t.name}</div>
                    <div className="text-[11.5px] text-ink-muted">{t.paused ? "Paused for everyone." : "Live."}</div>
                  </div>
                  <button
                    onClick={() => toggleTool(t.name, t.paused)}
                    disabled={busyKey === `tool:${t.name}`}
                    className={`text-[12px] font-bold px-3 py-1.5 rounded-sm disabled:opacity-50 ${
                      t.paused ? "bg-good text-white" : "border border-border bg-page"
                    }`}
                  >
                    {t.paused ? "Resume" : "Pause"}
                  </button>
                </div>
              ))}
            </div>
          </section>

          {data.recentEmailFailures.length > 0 && (
            <section>
              <h3 className="m-0 mb-3 text-[13px] font-bold">Recent email failures</h3>
              <div className="flex flex-col gap-1.5">
                {data.recentEmailFailures.map((f) => (
                  <div key={f.id} className="text-[12px] border border-border rounded-sm px-3 py-2 bg-surface">
                    <span className="font-bold">{f.tool}</span> → {f.to_email || "unknown"}: {f.error}
                    <span className="text-ink-muted ml-2">{new Date(f.created_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="m-0 text-[13px] font-bold">Recent owner activity</h3>
              <Link href="/admin/activity" className="text-[12px] font-bold text-brand">
                View full log →
              </Link>
            </div>
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
          </section>
        </div>
      )}
    </AppShell>
  );
}
