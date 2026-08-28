"use client";
import { useEffect, useState } from "react";

// Agent dashboard — placeholder for phase 2 (fulfillment coordination).
// Ported verbatim from askshree-app (v1)'s app/gauri/agent/page.js.
interface Account { role: string; displayName: string; }

export default function GauriAgentPage() {
  const [account, setAccount] = useState<Account | null | undefined>(undefined);

  async function loadMe() {
    const res = await fetch("/api/gauri/me");
    const data = await res.json();
    setAccount(data.account || null);
    if (!data.account || data.account.role !== "agent") window.location.href = "/gauri/login";
  }
  useEffect(() => { loadMe(); }, []);

  async function logout() {
    await fetch("/api/gauri/logout", { method: "POST" });
    window.location.href = "/gauri/login";
  }

  if (account === undefined) return <div className="admin-main">Loading…</div>;

  return (
    <div className="admin-shell">
      <div className="admin-side">
        <div className="logo">Gauri<span>.ai</span></div>
        <div className="admin-nav">
          <a href="/gauri/agent" className="active">Dashboard</a>
          <a onClick={logout} style={{ cursor: "pointer" }}>Sign out ({account?.displayName})</a>
        </div>
      </div>
      <div className="admin-main">
        <div className="admin-header"><h2>Agent dashboard</h2></div>
        <div className="panel">
          <div style={{ padding: "28px 20px", color: "var(--slate)", fontSize: 13, lineHeight: 1.7 }}>
            You&rsquo;re signed in as <b style={{ color: "var(--cream)" }}>{account?.displayName}</b>.
            Fulfillment coordination — matching approved cases to stock and getting product to farmers —
            is phase 2 and isn&rsquo;t live yet. Phase 1 covers farmer intake, AI triage, and vet approval only.
          </div>
        </div>
      </div>
    </div>
  );
}
