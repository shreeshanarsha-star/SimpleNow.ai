"use client";
import { useEffect, useState } from "react";

// Vet dashboard — case queue on the left, detail + AI draft + approve/edit/
// reject on the right. Cases from the avatar conversation flow are flagged
// needs_callback and show the farmer's phone prominently. Approving can
// optionally attach a product + price + delivery estimate, which creates a
// delivery order for the paramed team.
//
// Ported verbatim from askshree-app (v1)'s app/gauri/vet/page.js.
const STATUS_LABEL: Record<string, string> = {
  pending_ai: "Awaiting AI draft",
  pending_vet_review: "Needs review",
  approved: "Approved",
  rejected: "Rejected",
};
const STATUS_COLOR: Record<string, React.CSSProperties> = {
  pending_ai: { background: "rgba(232,163,61,0.1)", color: "var(--amber)" },
  pending_vet_review: { background: "rgba(232,163,61,0.18)", color: "var(--amber)" },
  approved: { background: "rgba(120,200,140,0.15)", color: "#7bd08f" },
  rejected: { background: "rgba(220,80,80,0.15)", color: "#e28080" },
};

interface Account { role: string; displayName: string; }
interface GauriCase {
  id: string;
  farmer_name?: string | null;
  farmer_phone?: string | null;
  farmer_address?: string | null;
  cow_details?: string | null;
  issue_text?: string | null;
  ai_draft?: string | null;
  status: string;
  needs_callback?: boolean;
  surface_diagnosis?: string | null;
  conversation_transcript?: { role: string; text: string }[] | null;
}
interface Product { id: string; name: string; category: string; }
interface Draft {
  urgency?: string;
  likely_causes?: string[];
  immediate_care?: string[];
  suggested_direction?: string;
}

export default function GauriVetDashboard() {
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [cases, setCases] = useState<GauriCase[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [finalRec, setFinalRec] = useState("");
  const [vetNotes, setVetNotes] = useState("");
  const [productName, setProductName] = useState("");
  const [price, setPrice] = useState("");
  const [estimatedDelivery, setEstimatedDelivery] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function loadMe() {
    const res = await fetch("/api/gauri/me");
    const data = await res.json();
    setAccount(data.account || null);
    if (!data.account) window.location.href = "/gauri/login";
  }
  async function loadCases() {
    const res = await fetch("/api/gauri/cases");
    if (res.status === 401) { window.location.href = "/gauri/login"; return; }
    const data = await res.json();
    setCases(data.cases || []);
  }
  async function loadProducts() {
    const res = await fetch("/api/gauri/products");
    if (res.ok) {
      const data = await res.json();
      setProducts(data.products || []);
    }
  }

  useEffect(() => { loadMe(); loadCases(); loadProducts(); }, []);

  const selected = cases.find((c) => c.id === selectedId);

  function draftFor(c?: GauriCase | null): Draft | null {
    if (!c?.ai_draft) return null;
    try { return JSON.parse(c.ai_draft); } catch { return null; }
  }

  function openCase(c: GauriCase) {
    setSelectedId(c.id);
    setFinalRec(draftFor(c)?.suggested_direction || "");
    setVetNotes("");
    setProductName("");
    setPrice("");
    setEstimatedDelivery("");
    setNote("");
  }

  async function act(action: "approve" | "reject") {
    if (!selected) return;
    if (action === "approve" && !finalRec.trim()) { setNote("Write a recommendation before approving."); return; }
    setBusy(true);
    const chosenProduct = products.find((p) => p.name === productName);
    const res = await fetch(`/api/gauri/cases/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action, finalRecommendation: finalRec, vetNotes,
        productId: chosenProduct?.id || null,
        productName: productName || null,
        price: price ? Number(price) : null,
        estimatedDelivery: estimatedDelivery || null,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.ok) {
      setSelectedId(null);
      loadCases();
    } else {
      setNote(data.error || "Could not save that.");
    }
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
          <a href="/gauri/vet" className="active">Case queue</a>
          <a onClick={logout} style={{ cursor: "pointer" }}>Sign out ({account?.displayName})</a>
        </div>
      </div>
      <div className="admin-main">
        <div className="admin-header"><h2>Case queue</h2></div>

        {!selected && (
          <div className="panel">
            <div className="panel-head"><h3>{cases.length} case(s)</h3></div>
            <table className="admin-table">
              <thead><tr><th></th><th>Farmer</th><th>Cow</th><th>Issue</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {cases.map((c) => (
                  <tr key={c.id}>
                    <td>
                      {c.needs_callback && c.status === "pending_vet_review" && (
                        <span style={{ color: "var(--amber)", fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 500, fontSize: 10.5, border: "1px solid var(--amber-dim)", borderRadius: 10, padding: "2px 8px" }}>
                          ☎ Call {c.farmer_phone}
                        </span>
                      )}
                    </td>
                    <td className="name-cell">{c.farmer_name || "Not given"}</td>
                    <td>{c.cow_details || "—"}</td>
                    <td style={{ maxWidth: 260 }}>{c.issue_text?.slice(0, 80)}{(c.issue_text?.length || 0) > 80 ? "…" : ""}</td>
                    <td><span className="status-pill" style={STATUS_COLOR[c.status] || {}}>{STATUS_LABEL[c.status] || c.status}</span></td>
                    <td><span className="row-action" onClick={() => openCase(c)}>Open</span></td>
                  </tr>
                ))}
                {cases.length === 0 && <tr><td colSpan={6} style={{ color: "var(--slate)" }}>No cases yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {selected && (
          <div className="panel">
            <div className="panel-head">
              <h3>{selected.farmer_name || "Farmer"} — {selected.cow_details || "cow details not given"}</h3>
              <span className="action" style={{ cursor: "pointer" }} onClick={() => setSelectedId(null)}>← Back to queue</span>
            </div>
            <div style={{ padding: "18px 20px" }}>
              {selected.needs_callback && (
                <div style={{ border: "1px solid var(--amber-dim)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, background: "rgba(232,163,61,0.08)", fontSize: 12.5, color: "var(--amber)" }}>
                  ☎ This farmer confirmed via the Gauri avatar that they want a vet to call them.
                  Number: <b>{selected.farmer_phone || "not given"}</b>
                  {selected.farmer_address && <> · Address: <b>{selected.farmer_address}</b></>}
                </div>
              )}

              {Array.isArray(selected.conversation_transcript) && selected.conversation_transcript.length > 0 ? (
                <div style={{ marginBottom: 16 }}>
                  <div className="file-hint" style={{ marginBottom: 8 }}><b style={{ color: "var(--cream)" }}>Conversation with Gauri:</b></div>
                  <div style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 12, maxHeight: 260, overflowY: "auto" }}>
                    {selected.conversation_transcript.map((t, i) => (
                      <div key={i} style={{ marginBottom: 8, fontSize: 12.5 }}>
                        <span style={{ color: t.role === "farmer" ? "var(--cream)" : "var(--amber)", fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 500, fontSize: 10.5, textTransform: "uppercase" }}>
                          {t.role === "farmer" ? "Farmer" : "Gauri"}
                        </span>
                        <div style={{ color: "var(--cream)" }}>{t.text}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="file-hint" style={{ marginBottom: 14 }}><b style={{ color: "var(--cream)" }}>Farmer&rsquo;s description:</b><br />{selected.issue_text}</div>
              )}

              {draftFor(selected) ? (
                <div style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 14, marginBottom: 16, background: "rgba(255,255,255,0.015)" }}>
                  <div style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 500, fontSize: 11, color: "var(--amber)", marginBottom: 8, textTransform: "uppercase" }}>
                    AI read — urgency: {draftFor(selected)?.urgency}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--cream)", marginBottom: 8 }}>
                    <b>Surface diagnosis Gauri gave the farmer:</b> {selected.surface_diagnosis || (draftFor(selected)?.likely_causes || []).join(", ")}
                  </div>
                  {(draftFor(selected)?.immediate_care?.length || 0) > 0 && (
                    <div style={{ fontSize: 12.5, color: "var(--cream)" }}>
                      <b>Immediate care suggested:</b> {(draftFor(selected)?.immediate_care || []).join("; ")}
                    </div>
                  )}
                </div>
              ) : (
                <div className="file-hint" style={{ marginBottom: 16 }}>No AI draft available — write a recommendation from scratch.</div>
              )}

              <label style={{ fontSize: 11.5, color: "var(--slate)", display: "block", marginBottom: 6 }}>Final recommendation (this is what the farmer sees)</label>
              <textarea className="free-text-input" style={{ minHeight: 90 }} value={finalRec} onChange={(e) => setFinalRec(e.target.value)} />

              <label style={{ fontSize: 11.5, color: "var(--slate)", display: "block", margin: "12px 0 6px" }}>Internal vet notes (not shown to farmer)</label>
              <textarea className="free-text-input" style={{ minHeight: 60 }} value={vetNotes} onChange={(e) => setVetNotes(e.target.value)} />

              <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
                <div style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 8 }}>Recommend a product for delivery (optional — leave blank if the case just needs monitoring at home)</div>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
                  <select className="free-text-input" style={{ padding: 10 }} value={productName} onChange={(e) => setProductName(e.target.value)}>
                    <option value="">No product</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.name}>{p.name} — {p.category}</option>
                    ))}
                  </select>
                  <input className="free-text-input" style={{ padding: 10 }} type="number" placeholder="Price (₹)" value={price} onChange={(e) => setPrice(e.target.value)} />
                  <input className="free-text-input" style={{ padding: 10 }} type="text" placeholder="Delivery est. e.g. within 2 days" value={estimatedDelivery} onChange={(e) => setEstimatedDelivery(e.target.value)} />
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button className="primary-btn" disabled={busy} onClick={() => act("approve")}>Approve &amp; send</button>
                <button className="primary-btn" style={{ borderColor: "rgba(220,80,80,0.4)", color: "#e28080" }} disabled={busy} onClick={() => act("reject")}>Reject</button>
              </div>
              {note && <div className="file-hint" style={{ marginTop: 10 }}>{note}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
