"use client";

import { useEffect, useState, use } from "react";
import Logo from "@/components/Logo";
import SignaturePad from "@/components/tools/SignaturePad";

type FieldRow = { id: string; field_type: "signature" | "date" | "name" | "location"; page: number };

interface SignerData {
  role: "signer";
  envelopeName: string;
  senderName: string;
  recipientName: string;
  documentUrl: string | null;
  pageCount: number | null;
  fields: FieldRow[];
}
interface SignerUnavailable {
  role: "signer";
  unavailable?: true;
  alreadySigned?: true;
  reason?: string;
  envelopeName: string;
}
interface CcData {
  role: "cc";
  ready: boolean;
  envelopeName: string;
  senderName?: string;
  documentUrl?: string | null;
}

type ApiResult = SignerData | SignerUnavailable | CcData;

// Public -- no AskShree account, no AppShell/sidebar. Same "unique
// unguessable token" access model as the Assessment.ai candidate flow.
export default function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [data, setData] = useState<ApiResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [signature, setSignature] = useState<{ type: "typed" | "drawn" | "uploaded"; value: string } | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ isFinal: boolean } | null>(null);

  useEffect(() => {
    fetch(`/api/contracts/sign/${token}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) {
          setNotFound(true);
          return;
        }
        setData(d);
        if (d.role === "signer" && d.fields) {
          const today = new Date().toISOString().slice(0, 10);
          const initial: Record<string, string> = {};
          for (const f of d.fields as FieldRow[]) {
            if (f.field_type === "date") initial[f.id] = today;
            if (f.field_type === "name") initial[f.id] = d.recipientName || "";
          }
          setFieldValues(initial);
        }
      })
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit() {
    if (!data || data.role !== "signer") return;
    setError(null);
    if (!signature) {
      setError("Add your signature before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/contracts/sign/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureType: signature.type, signatureValue: signature.value, fieldValues }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not submit your signature.");
      setResult({ isFinal: json.isFinal });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit your signature.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return null;

  return (
    <div className="min-h-screen bg-page">
      <header className="border-b border-border bg-surface">
        <div className="max-w-[860px] mx-auto px-6 py-4 flex items-center">
          <Logo height={28} />
        </div>
      </header>

      <main className="max-w-[860px] mx-auto px-6 py-10">
        {notFound && <Centered>This link isn&rsquo;t valid.</Centered>}

        {!notFound && data?.role === "signer" && "alreadySigned" in data && data.alreadySigned && (
          <Centered>Thanks &mdash; you&rsquo;ve already signed &ldquo;{data.envelopeName}&rdquo;.</Centered>
        )}

        {!notFound && data?.role === "signer" && "unavailable" in data && data.unavailable && (
          <Centered>
            {data.reason === "expired" && "This signing link has expired. Ask the sender to resend it."}
            {data.reason === "not_ready" && "It's not your turn to sign yet -- you'll be emailed when it is."}
            {data.reason === "declined" && "This document was declined."}
            {!data.reason && "This document is no longer available to sign."}
          </Centered>
        )}

        {!notFound && data?.role === "signer" && !("unavailable" in data) && !("alreadySigned" in data) && result && (
          <Centered>
            <div className="text-[16px] font-bold mb-1">Signed successfully.</div>
            <div>{result.isFinal ? "All signatures are complete." : "Your signature is complete. The document has been sent to the next signer."}</div>
          </Centered>
        )}

        {!notFound && data?.role === "signer" && !("unavailable" in data) && !("alreadySigned" in data) && !result && (
          <SignerFlow
            data={data as SignerData}
            fieldValues={fieldValues}
            setFieldValues={setFieldValues}
            signature={signature}
            setSignature={setSignature}
            error={error}
            submitting={submitting}
            onSubmit={handleSubmit}
          />
        )}

        {!notFound && data?.role === "cc" && <CcFlow data={data} />}
      </main>
    </div>
  );
}

function SignerFlow({
  data,
  fieldValues,
  setFieldValues,
  signature,
  setSignature,
  error,
  submitting,
  onSubmit,
}: {
  data: SignerData;
  fieldValues: Record<string, string>;
  setFieldValues: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  signature: { type: "typed" | "drawn" | "uploaded"; value: string } | null;
  setSignature: (v: { type: "typed" | "drawn" | "uploaded"; value: string } | null) => void;
  error: string | null;
  submitting: boolean;
  onSubmit: () => void;
}) {
  const otherFields = data.fields.filter((f) => f.field_type !== "signature");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="m-0 text-[20px] font-bold">{data.envelopeName}</h1>
        <p className="m-0 mt-1.5 text-[13px] text-ink-muted">
          {data.senderName} sent you this document to review and sign, {data.recipientName}.
        </p>
      </div>

      {data.documentUrl && (
        <div className="border border-border rounded-md overflow-hidden bg-white" style={{ height: 480 }}>
          <iframe src={data.documentUrl} title="Document" className="w-full h-full" />
        </div>
      )}

      {error && <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2">{error}</div>}

      <div className="border border-border rounded-md bg-surface px-4 py-4 flex flex-col gap-4">
        <div className="text-[12px] font-bold uppercase tracking-wider text-ink-muted">Your signature</div>
        <SignaturePad onChange={setSignature} />

        {otherFields.length > 0 && (
          <div className="flex flex-col gap-3 pt-1">
            {otherFields.map((f) => (
              <div key={f.id}>
                <label className="block text-[11.5px] font-semibold text-ink-2 mb-1 capitalize">{f.field_type}</label>
                <input
                  type={f.field_type === "date" ? "date" : "text"}
                  value={fieldValues[f.id] || ""}
                  onChange={(e) => setFieldValues((prev) => ({ ...prev, [f.id]: e.target.value }))}
                  className="w-full border border-border rounded-sm px-3 py-2 text-[13px] bg-surface"
                />
              </div>
            ))}
          </div>
        )}

        <button
          onClick={onSubmit}
          disabled={submitting || !signature}
          className="bg-brand text-white text-[13px] font-bold px-4 py-2.5 rounded-sm disabled:opacity-50 self-start"
        >
          {submitting ? "Submitting…" : "Submit & Sign"}
        </button>
      </div>
    </div>
  );
}

function CcFlow({ data }: { data: CcData }) {
  if (!data.ready) {
    return <Centered>&ldquo;{data.envelopeName}&rdquo; isn&rsquo;t fully signed yet. You&rsquo;ll get an email when it&rsquo;s complete.</Centered>;
  }
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="m-0 text-[20px] font-bold">{data.envelopeName}</h1>
        <p className="m-0 mt-1.5 text-[13px] text-ink-muted">All signatures are complete.</p>
      </div>
      {data.documentUrl && (
        <>
          <div className="border border-border rounded-md overflow-hidden bg-white" style={{ height: 480 }}>
            <iframe src={data.documentUrl} title="Completed document" className="w-full h-full" />
          </div>
          <a
            href={data.documentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-brand text-white text-[13px] font-bold px-4 py-2.5 rounded-sm self-start no-underline"
          >
            Download
          </a>
        </>
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[50vh] flex items-center justify-center text-center text-[14px] text-ink-2 max-w-sm mx-auto">{children}</div>;
}
