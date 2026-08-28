"use client";
import { useState } from "react";

// Shared login for every Gauri.ai staff role — vet, agent, stockist,
// paramed, admin. Farmers never see this page; they only ever get the
// intake page and a status link. Ported verbatim from askshree-app (v1)'s
// app/gauri/login/page.js.
export default function GauriLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signIn() {
    if (!username || !password) { setError("Enter your username and password."); return; }
    setLoading(true);
    setError(null);
    const res = await fetch("/api/gauri/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    setLoading(false);
    if (!data.ok) { setError(data.error || "Could not sign in."); return; }
    const role = data.account.role;
    window.location.href = role === "admin" ? "/gauri/admin" : `/gauri/${role}`;
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="mark">G</div>
        <div className="logo">Gauri<span>.ai</span> staff</div>
        <div className="sub">Vet · Agent · Stockist · Admin</div>
        <label>Username</label>
        <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === "Enter" && signIn()} />
        <label>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && signIn()} />
        <button onClick={signIn} disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
        {error && <div style={{ color: "#e28080", fontSize: 12, marginTop: 10 }}>{error}</div>}
      </div>
    </div>
  );
}
