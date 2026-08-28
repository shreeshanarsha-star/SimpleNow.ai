"use client";
import { useEffect, useState } from "react";

// Ported verbatim from askshree-app (v1)'s app/gauri/status/[id]/page.js.
const STATUS_TEXT: Record<string, string> = {
  pending_ai: "Your case has been received and is being looked at.",
  pending_vet_review: "A vet is reviewing your case now.",
  approved: "A vet has reviewed your case.",
  rejected: "A vet has reviewed your case and could not make a recommendation from the details given. Please submit a new case with more detail, or contact a vet directly.",
};
const ORDER_STATUS_TEXT: Record<string, string> = {
  pending_dispatch: "Being arranged for delivery",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

interface CaseData {
  case: {
    id: string;
    status: string;
    final_recommendation?: string | null;
    created_at: string;
    order?: { product_name: string; price?: number | null; status: string; estimated_delivery?: string | null } | null;
  } | null;
}

export default function GauriStatusClient({ id }: { id: string }) {
  const [data, setData] = useState<CaseData | undefined>(undefined);

  useEffect(() => {
    fetch(`/api/gauri/cases/${id}`)
      .then((r) => r.json())
      .then((d) => setData(d));
  }, [id]);

  if (data === undefined) {
    return <div style={{ padding: "60px 24px", maxWidth: 560, margin: "0 auto", textAlign: "center", color: "var(--slate)" }}>Loading…</div>;
  }
  if (!data.case) {
    return (
      <div style={{ padding: "60px 24px", maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
        <h1 className="serif" style={{ fontSize: 22, color: "var(--cream)" }}>Case not found</h1>
        <p style={{ color: "var(--slate)", fontSize: 13.5, marginTop: 10 }}>Check the link, or submit a new case.</p>
      </div>
    );
  }

  const c = data.case;
  const order = c.order;
  return (
    <div style={{ padding: "60px 24px", maxWidth: 560, margin: "0 auto" }}>
      <div className="eyebrow">Gauri.ai</div>
      <h1 className="serif" style={{ fontSize: 24, color: "var(--cream)", margin: "8px 0 16px" }}>Case status</h1>
      <p style={{ color: "var(--cream)", fontSize: 14, lineHeight: 1.7, marginBottom: 20 }}>{STATUS_TEXT[c.status] || "Received."}</p>

      {c.status === "approved" && c.final_recommendation && (
        <div style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 16, background: "rgba(255,255,255,0.015)" }}>
          <div style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 500, fontSize: 11, color: "var(--amber)", marginBottom: 8, textTransform: "uppercase" }}>Vet&rsquo;s recommendation</div>
          <div style={{ fontSize: 13.5, color: "var(--cream)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{c.final_recommendation}</div>
        </div>
      )}

      {order && (
        <div style={{ border: "1px solid var(--amber-dim)", borderRadius: 8, padding: 16, marginTop: 14, background: "rgba(232,163,61,0.06)" }}>
          <div style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 500, fontSize: 11, color: "var(--amber)", marginBottom: 8, textTransform: "uppercase" }}>Product on the way</div>
          <div style={{ fontSize: 14, color: "var(--cream)", marginBottom: 4 }}>{order.product_name}</div>
          {order.price != null && <div style={{ fontSize: 13, color: "var(--slate)" }}>Cost: ₹{order.price} — pay the delivery person in cash or UPI when it arrives</div>}
          {order.estimated_delivery && <div style={{ fontSize: 13, color: "var(--slate)" }}>Expected: {order.estimated_delivery}</div>}
          <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--amber)" }}>{ORDER_STATUS_TEXT[order.status] || order.status}</div>
        </div>
      )}

      <button className="primary-btn" style={{ marginTop: 24 }} onClick={() => { window.location.href = "/gauri"; }}>
        Report another issue
      </button>
    </div>
  );
}
