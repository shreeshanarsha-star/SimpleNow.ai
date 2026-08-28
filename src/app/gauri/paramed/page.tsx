"use client";
import { useEffect, useState } from "react";

// Paramed (delivery) dashboard — an open pool of unassigned orders anyone on
// the paramed team can claim, plus "my deliveries" once claimed. No online
// payment: the paramed collects cash/UPI in person and logs a note when
// marking delivered. Ported verbatim from askshree-app (v1)'s
// app/gauri/paramed/page.js.
interface Account { role: string; displayName: string; }
interface OrderCase { farmer_name?: string | null; farmer_phone?: string | null; farmer_address?: string | null; }
interface Order {
  id: string;
  product_name: string;
  price?: number | null;
  estimated_delivery?: string | null;
  status: string;
  paramed_id?: string | null;
  case?: OrderCase | null;
}

export default function GauriParamedDashboard() {
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [unassigned, setUnassigned] = useState<Order[]>([]);
  const [mine, setMine] = useState<Order[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [paymentNotes, setPaymentNotes] = useState<Record<string, string>>({});

  async function loadMe() {
    const res = await fetch("/api/gauri/me");
    const data = await res.json();
    setAccount(data.account || null);
    if (!data.account || data.account.role !== "paramed") window.location.href = "/gauri/login";
  }
  async function loadOrders() {
    const res = await fetch("/api/gauri/orders");
    if (res.status === 401) { window.location.href = "/gauri/login"; return; }
    const data = await res.json();
    setUnassigned(data.unassigned || []);
    setMine(data.mine || []);
  }
  useEffect(() => { loadMe(); loadOrders(); }, []);

  async function act(orderId: string, action: string, extra: Record<string, unknown> = {}) {
    setBusyId(orderId);
    await fetch(`/api/gauri/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    setBusyId(null);
    loadOrders();
  }

  async function logout() {
    await fetch("/api/gauri/logout", { method: "POST" });
    window.location.href = "/gauri/login";
  }

  if (account === undefined) return <div className="admin-main">Loading…</div>;

  function OrderCard({ o, mineList }: { o: Order; mineList: boolean }) {
    return (
      <div style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 14, marginBottom: 10, background: "rgba(255,255,255,0.015)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontFamily: "Fraunces, serif", fontSize: 15, color: "var(--cream)" }}>{o.product_name}</div>
            <div className="file-hint" style={{ marginTop: 4 }}>
              {o.case?.farmer_name || "Farmer"} · {o.case?.farmer_phone || "no phone"}
              {o.case?.farmer_address && <> · {o.case.farmer_address}</>}
            </div>
            {o.price != null && <div className="file-hint">Price: ₹{o.price}</div>}
            {o.estimated_delivery && <div className="file-hint">ETA: {o.estimated_delivery}</div>}
          </div>
          <span className="status-pill" style={{ background: "rgba(232,163,61,0.15)", color: "var(--amber)" }}>{o.status.replace("_", " ")}</span>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {!mineList && (
            <button className="primary-btn" style={{ marginTop: 0 }} disabled={busyId === o.id} onClick={() => act(o.id, "claim")}>Claim delivery</button>
          )}
          {mineList && o.status === "pending_dispatch" && (
            <button className="primary-btn" style={{ marginTop: 0 }} disabled={busyId === o.id} onClick={() => act(o.id, "mark_dispatched")}>Mark out for delivery</button>
          )}
          {mineList && o.status === "out_for_delivery" && (
            <>
              <input
                className="free-text-input"
                style={{ padding: 8, width: 220 }}
                placeholder="Payment note e.g. Collected ₹250 cash"
                value={paymentNotes[o.id] || ""}
                onChange={(e) => setPaymentNotes({ ...paymentNotes, [o.id]: e.target.value })}
              />
              <button
                className="primary-btn"
                style={{ marginTop: 0 }}
                disabled={busyId === o.id}
                onClick={() => act(o.id, "mark_delivered", { paymentNote: paymentNotes[o.id] || "" })}
              >
                Mark delivered
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <div className="admin-side">
        <div className="logo">Gauri<span>.ai</span></div>
        <div className="admin-nav">
          <a href="/gauri/paramed" className="active">Deliveries</a>
          <a onClick={logout} style={{ cursor: "pointer" }}>Sign out ({account?.displayName})</a>
        </div>
      </div>
      <div className="admin-main">
        <div className="admin-header"><h2>Deliveries</h2></div>

        <div className="panel">
          <div className="panel-head"><h3>My deliveries ({mine.length})</h3></div>
          <div style={{ padding: "16px 20px" }}>
            {mine.length === 0 && <div className="file-hint">Nothing claimed yet — pick one up from the pool below.</div>}
            {mine.map((o) => <OrderCard key={o.id} o={o} mineList />)}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><h3>Unassigned pool ({unassigned.length})</h3></div>
          <div style={{ padding: "16px 20px" }}>
            {unassigned.length === 0 && <div className="file-hint">No pending deliveries right now.</div>}
            {unassigned.map((o) => <OrderCard key={o.id} o={o} mineList={false} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
