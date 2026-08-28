"use client";
import { useEffect, useState } from "react";

// Admin account management for Gauri.ai staff — add/deactivate vet, agent,
// stockist, paramed, admin accounts. Farmers never appear here.
// Ported verbatim from askshree-app (v1)'s app/gauri/admin/page.js.
const ROLES = ["vet", "paramed", "agent", "stockist", "admin"];

interface Account { role: string; displayName: string; }
interface StaffAccount { id: string; username: string; role: string; display_name: string; active: boolean; }

export default function GauriAdminPage() {
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [accounts, setAccounts] = useState<StaffAccount[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("vet");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadMe() {
    const res = await fetch("/api/gauri/me");
    const data = await res.json();
    setAccount(data.account || null);
    if (!data.account || data.account.role !== "admin") window.location.href = "/gauri/login";
  }
  async function loadAccounts() {
    const res = await fetch("/api/gauri/admin/accounts");
    if (res.status === 401) { window.location.href = "/gauri/login"; return; }
    const data = await res.json();
    setAccounts(data.accounts || []);
  }
  useEffect(() => { loadMe(); loadAccounts(); }, []);

  async function createAccount() {
    if (!username || !password || !displayName) { setError("Fill in every field."); return; }
    setBusy(true);
    setError("");
    const res = await fetch("/api/gauri/admin/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, role, displayName }),
    });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) { setError(data.error || "Could not create that account."); return; }
    setUsername(""); setPassword(""); setDisplayName("");
    loadAccounts();
  }

  async function deactivate(id: string) {
    await fetch(`/api/gauri/admin/accounts/${id}`, { method: "DELETE" });
    loadAccounts();
  }

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
          <a href="/gauri/admin" className="active">Accounts</a>
          <a onClick={logout} style={{ cursor: "pointer" }}>Sign out ({account?.displayName})</a>
        </div>
      </div>
      <div className="admin-main">
        <div className="admin-header"><h2>Staff accounts</h2></div>

        <div className="panel">
          <div className="panel-head"><h3>Add account</h3></div>
          <div style={{ padding: "18px 20px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
            <div>
              <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 5 }}>Display name</label>
              <input className="free-text-input" style={{ padding: 10 }} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 5 }}>Username</label>
              <input className="free-text-input" style={{ padding: 10 }} value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 5 }}>Password</label>
              <input className="free-text-input" style={{ padding: 10 }} type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 5 }}>Role</label>
              <select className="free-text-input" style={{ padding: 10 }} value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <button className="primary-btn" style={{ marginTop: 0 }} disabled={busy} onClick={createAccount}>Add</button>
          </div>
          {error && <div className="file-hint" style={{ padding: "0 20px 14px", color: "#e28080" }}>{error}</div>}
        </div>

        <div className="panel">
          <div className="panel-head"><h3>{accounts.length} account(s)</h3></div>
          <table className="admin-table">
            <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td className="name-cell">{a.display_name}</td>
                  <td>{a.username}</td>
                  <td>{a.role}</td>
                  <td>
                    <span className="status-pill" style={a.active ? { background: "rgba(120,200,140,0.15)", color: "#7bd08f" } : { background: "rgba(220,80,80,0.15)", color: "#e28080" }}>
                      {a.active ? "Active" : "Deactivated"}
                    </span>
                  </td>
                  <td>{a.active && <span className="row-action" onClick={() => deactivate(a.id)}>Deactivate</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
