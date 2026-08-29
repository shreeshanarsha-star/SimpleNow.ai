"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { useRegisterToolHome } from "@/components/ToolHomeContext";

type Role = "signer" | "cc";

interface RecipientDraft {
  key: string;
  name: string;
  email: string;
  role: Role;
}

interface EnvelopeRow {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  original_file_name: string;
  created_at: string;
  lastActivity: string;
  ai_confidence: "ok" | "needs_review";
  signerProgress: { total: number; signed: number };
}

interface RecipientRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  signing_order: number | null;
  status: string;
  sent_at: string | null;
  opened_at: string | null;
  signed_at: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  processing: "Preparing…",
  waiting_for_signature: "Waiting for Signature",
  in_progress: "In Progress",
  completed: "Completed",
  declined: "Declined",
  expired: "Expired",
  failed: "Failed",
};

const STATUS_CLASS: Record<string, string> = {
  draft: "bg-page text-ink-muted border border-border",
  processing: "bg-brand-wash text-brand",
  waiting_for_signature: "bg-warning-wash text-[#8a5a00]",
  in_progress: "bg-brand-wash text-brand",
  completed: "bg-good-wash text-good-text",
  declined: "bg-critical-wash text-critical",
  expired: "bg-critical-wash text-critical",
  failed: "bg-critical-wash text-critical",
};

const PROCESSING_STAGES = [
  "Reading document",
  "Identifying signing requirements",
  "Preparing signature fields",
  "Setting signing sequence",
  "Preparing secure signing links",
];

function newKey() {
  return Math.random().toString(36).slice(2);
}

export default function ContractsEsignApp() {
  const [view, setView] = useState<"list" | "new" | "processing" | "detail">("list");
  const [envelopes, setEnvelopes] = useState<EnvelopeRow[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Topbar's clickable "Contracts & eSign" title (ToolHomeContext) returns
  // to the document list from the new/processing/detail flow.
  useRegisterToolHome(useCallback(() => setView("list"), []));

  const loadList = useCallback(async () => {
    setListError(null);
    try {
      const res = await fetch("/api/contracts");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load your documents.");
      setEnvelopes(data.envelopes);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Could not load your documents.");
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  function openDetail(id: string) {
    setActiveId(id);
    setView("detail");
  }

  if (view === "new") {
    return (
      <NewDocumentFlow
        onCancel={() => setView("list")}
        onCreated={(id) => {
          setActiveId(id);
          setView("processing");
        }}
      />
    );
  }

  if (view === "processing" && activeId) {
    return (
      <ProcessingView
        envelopeId={activeId}
        onDone={() => {
          loadList();
          setView("list");
        }}
      />
    );
  }

  if (view === "detail" && activeId) {
    return (
      <DetailView
        envelopeId={activeId}
        onBack={() => {
          loadList();
          setView("list");
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-[19px] font-bold">Contracts & eSign</h2>
          <p className="m-0 mt-1 text-[13px] text-ink-2">Upload, send and sign documents with AI.</p>
        </div>
        <button
          onClick={() => setView("new")}
          className="bg-brand text-white text-[12.5px] font-bold px-3.5 py-2 rounded-sm whitespace-nowrap"
        >
          + New Document
        </button>
      </div>

      {listError && <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2">{listError}</div>}

      {envelopes === null ? null : envelopes.length === 0 ? (
        <div className="flex flex-col items-center text-center gap-2 border border-dashed border-border rounded-lg px-8 py-14">
          <Icon name="penSignature" className="w-8 h-8 text-ink-muted mb-1" />
          <p className="m-0 text-[13.5px] font-semibold">No documents yet</p>
          <p className="m-0 text-[12.5px] text-ink-muted max-w-xs">
            Upload a document, add the people who need to sign or receive a copy, and SimpleNow AI prepares the rest.
          </p>
        </div>
      ) : (
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="bg-page text-ink-muted text-left">
                <th className="font-semibold px-3.5 py-2.5">Document</th>
                <th className="font-semibold px-3.5 py-2.5">Status</th>
                <th className="font-semibold px-3.5 py-2.5">Created</th>
                <th className="font-semibold px-3.5 py-2.5">Last activity</th>
                <th className="font-semibold px-3.5 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {envelopes.map((e) => (
                <tr key={e.id} className="border-t border-border hover:bg-page/60">
                  <td className="px-3.5 py-2.5">
                    <button onClick={() => openDetail(e.id)} className="font-semibold text-left hover:text-brand">
                      {e.name}
                    </button>
                    {e.ai_confidence === "needs_review" && (
                      <span className="ml-2 text-[10px] font-bold text-warning bg-warning-wash px-1.5 py-0.5 rounded-full">Review recommended</span>
                    )}
                    {e.signerProgress.total > 0 && (
                      <div className="text-[11px] text-ink-muted mt-0.5">
                        {e.signerProgress.signed} of {e.signerProgress.total} signed
                      </div>
                    )}
                  </td>
                  <td className="px-3.5 py-2.5">
                    <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${STATUS_CLASS[e.effectiveStatus] || STATUS_CLASS.draft}`}>
                      {STATUS_LABEL[e.effectiveStatus] || e.effectiveStatus}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5 text-ink-2">{new Date(e.created_at).toLocaleDateString()}</td>
                  <td className="px-3.5 py-2.5 text-ink-2">{new Date(e.lastActivity).toLocaleDateString()}</td>
                  <td className="px-3.5 py-2.5 text-right">
                    <button onClick={() => openDetail(e.id)} className="text-brand font-semibold">
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- new doc

function NewDocumentFlow({ onCancel, onCreated }: { onCancel: () => void; onCreated: (id: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [recipients, setRecipients] = useState<RecipientDraft[]>([{ key: newKey(), name: "", email: "", role: "signer" }]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function pickFile(f: File | null) {
    if (!f) return;
    const okType =
      f.type === "application/pdf" ||
      f.type === "application/msword" ||
      f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (!okType) {
      setError("Please upload a PDF, DOCX, or DOC file.");
      return;
    }
    if (f.size > 25 * 1024 * 1024) {
      setError("That file is too large (max 25MB).");
      return;
    }
    setError(null);
    setFile(f);
    if (!name) setName(f.name.replace(/\.[^.]+$/, ""));
  }

  function updateRecipient(key: string, patch: Partial<RecipientDraft>) {
    setRecipients((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function removeRecipient(key: string) {
    setRecipients((prev) => prev.filter((r) => r.key !== key));
  }
  function addRecipient() {
    setRecipients((prev) => [...prev, { key: newKey(), name: "", email: "", role: "signer" }]);
  }

  async function handleNext() {
    setError(null);
    if (!file) return setError("Upload a document first.");
    if (!name.trim()) return setError("Give the document a name.");
    const cleaned = recipients.map((r) => ({ name: r.name.trim(), email: r.email.trim(), role: r.role }));
    if (cleaned.some((r) => !r.name || !r.email)) return setError("Every recipient needs a name and email.");
    if (!cleaned.some((r) => r.role === "signer")) return setError('At least one recipient must be marked "Signs".');

    setSubmitting(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("name", name.trim());
      form.set("recipients", JSON.stringify(cleaned));
      const res = await fetch("/api/contracts", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create the document.");
      onCreated(data.envelopeId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the document.");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h2 className="m-0 text-[19px] font-bold">Contracts & eSign</h2>
        <p className="m-0 mt-1 text-[13px] text-ink-2">Upload, send and sign documents with AI.</p>
      </div>

      {error && <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2">{error}</div>}

      <div>
        <div className="text-[12px] font-bold uppercase tracking-wider text-ink-muted mb-2">1. Document</div>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            pickFile(e.dataTransfer.files?.[0] || null);
          }}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-md px-6 py-8 text-center cursor-pointer transition-colors ${
            dragOver ? "border-brand bg-brand-wash" : "border-border"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] || null)}
          />
          {file ? (
            <div className="flex items-center justify-center gap-2 text-[13px]">
              <Icon name="upload" className="w-4 h-4 text-brand" />
              <span className="font-semibold">{file.name}</span>
              <span className="text-ink-muted">({(file.size / 1024 / 1024).toFixed(1)}MB)</span>
            </div>
          ) : (
            <>
              <Icon name="upload" className="w-6 h-6 text-ink-muted mx-auto mb-2" />
              <p className="m-0 text-[13px] font-semibold">Drag & drop your document</p>
              <p className="m-0 mt-1 text-[11.5px] text-ink-muted">Supported: PDF, DOCX, DOC</p>
            </>
          )}
        </div>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Document name"
          className="mt-3 w-full border border-border rounded-sm px-3 py-2 text-[13px] bg-surface"
        />
      </div>

      <div>
        <div className="text-[12px] font-bold uppercase tracking-wider text-ink-muted mb-2">2. Recipients</div>
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="bg-page text-ink-muted text-left">
                <th className="font-semibold px-3 py-2">Name</th>
                <th className="font-semibold px-3 py-2">Email</th>
                <th className="font-semibold px-3 py-2 w-40">Role</th>
                <th className="px-3 py-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {recipients.map((r) => (
                <tr key={r.key} className="border-t border-border">
                  <td className="px-3 py-1.5">
                    <input
                      value={r.name}
                      onChange={(e) => updateRecipient(r.key, { name: e.target.value })}
                      placeholder="Full name"
                      className="w-full border border-border rounded-sm px-2 py-1.5 text-[12.5px] bg-surface"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      value={r.email}
                      onChange={(e) => updateRecipient(r.key, { email: e.target.value })}
                      placeholder="email@company.com"
                      className="w-full border border-border rounded-sm px-2 py-1.5 text-[12.5px] bg-surface"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <select
                      value={r.role}
                      onChange={(e) => updateRecipient(r.key, { role: e.target.value as Role })}
                      className="w-full border border-border rounded-sm px-2 py-1.5 text-[12.5px] bg-surface"
                    >
                      <option value="signer">Signs</option>
                      <option value="cc">Receives a copy</option>
                    </select>
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    {recipients.length > 1 && (
                      <button onClick={() => removeRecipient(r.key)} className="text-ink-muted hover:text-critical" aria-label="Remove recipient">
                        <Icon name="x" className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={addRecipient} className="mt-2 text-[12.5px] font-bold text-brand">
          + Add Recipient
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={onCancel} className="text-[12.5px] font-semibold text-ink-muted">
          Cancel
        </button>
        <button
          onClick={handleNext}
          disabled={submitting}
          className="ml-auto bg-brand text-white text-[13px] font-bold px-5 py-2.5 rounded-sm disabled:opacity-50"
        >
          {submitting ? "Uploading…" : "Next"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- processing

function ProcessingView({ envelopeId, onDone }: { envelopeId: string; onDone: () => void }) {
  const [stageIndex, setStageIndex] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setStageIndex((i) => (i < PROCESSING_STAGES.length - 1 ? i + 1 : i));
    }, 1600);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        const res = await fetch(`/api/contracts/${envelopeId}/process`, { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Something went wrong while preparing the document.");
        setStageIndex(PROCESSING_STAGES.length - 1);
        setDone(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong while preparing the document.");
      }
    })();
  }, [envelopeId]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 py-16">
      {error ? (
        <>
          <Icon name="x" className="w-8 h-8 text-critical" />
          <div className="text-[16px] font-bold">Couldn&rsquo;t prepare this document</div>
          <p className="text-[12.5px] text-ink-muted max-w-sm">{error}</p>
          <button onClick={onDone} className="mt-2 text-[12.5px] font-bold text-brand">
            Back to Contracts & eSign
          </button>
        </>
      ) : done ? (
        <>
          <div className="w-11 h-11 rounded-full bg-good-wash text-good-text flex items-center justify-center">
            <Icon name="check" className="w-5 h-5" />
          </div>
          <div className="text-[16px] font-bold">Your document is ready to send.</div>
          <p className="text-[12.5px] text-ink-muted max-w-sm">The first signer has been emailed a secure link.</p>
          <button onClick={onDone} className="mt-2 bg-brand text-white text-[13px] font-bold px-5 py-2.5 rounded-sm">
            Done
          </button>
        </>
      ) : (
        <>
          <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          <div className="text-[16px] font-bold">SimpleNow is preparing your document</div>
          <ul className="text-[12.5px] text-ink-2 flex flex-col gap-1.5 mt-1">
            {PROCESSING_STAGES.map((stage, i) => (
              <li key={stage} className={i <= stageIndex ? "text-brand font-semibold" : "text-ink-muted"}>
                {i < stageIndex ? "✓ " : i === stageIndex ? "… " : ""}
                {stage}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- detail

function DetailView({ envelopeId, onBack }: { envelopeId: string; onBack: () => void }) {
  const [envelope, setEnvelope] = useState<EnvelopeRow | (EnvelopeRow & { final_file_path?: string | null }) | null>(null);
  const [recipients, setRecipients] = useState<RecipientRow[]>([]);
  const [needsReviewCount, setNeedsReviewCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [shareEmail, setShareEmail] = useState("");
  const [shareName, setShareName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/contracts/${envelopeId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load this document.");
      setEnvelope(data.envelope);
      setRecipients(data.recipients);
      setNeedsReviewCount(data.needsReviewCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this document.");
    }
  }, [envelopeId]);

  useEffect(() => {
    load();
  }, [load]);

  async function openLink(variant: "final" | "original") {
    setBusy(variant);
    try {
      const res = await fetch(`/api/contracts/${envelopeId}/download?variant=${variant}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not open the document.");
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not open the document.");
    } finally {
      setBusy(null);
    }
  }

  async function resendTo(recipientId: string) {
    setBusy(recipientId);
    try {
      const res = await fetch(`/api/contracts/${envelopeId}/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not resend.");
      setNotice("Sent.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not resend.");
    } finally {
      setBusy(null);
    }
  }

  async function sendCopy() {
    if (!shareEmail.trim() || !shareName.trim()) return;
    setBusy("share");
    try {
      const res = await fetch(`/api/contracts/${envelopeId}/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: shareName.trim(), email: shareEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not send.");
      setShareEmail("");
      setShareName("");
      setNotice("Copy sent.");
      load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not send.");
    } finally {
      setBusy(null);
    }
  }

  if (error) {
    return (
      <div className="flex flex-col gap-3">
        <button onClick={onBack} className="text-[12.5px] font-semibold text-ink-muted self-start">
          &larr; Back
        </button>
        <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2">{error}</div>
      </div>
    );
  }
  if (!envelope) return null;

  const isCompleted = envelope.status === "completed";

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <button onClick={onBack} className="text-[12.5px] font-semibold text-ink-muted self-start">
        &larr; Back to Contracts & eSign
      </button>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-[18px] font-bold">{envelope.name}</h2>
          <span className={`inline-block mt-1.5 text-[10.5px] font-bold px-2 py-0.5 rounded-full ${STATUS_CLASS[envelope.status] || STATUS_CLASS.draft}`}>
            {STATUS_LABEL[envelope.status] || envelope.status}
          </span>
        </div>
        {isCompleted && (
          <div className="flex gap-2">
            <button onClick={() => openLink("final")} disabled={busy === "final"} className="text-[12px] font-bold text-brand">
              View
            </button>
            <button onClick={() => openLink("final")} disabled={busy === "final"} className="text-[12px] font-bold text-brand">
              Download
            </button>
          </div>
        )}
      </div>

      {needsReviewCount > 0 && (
        <div className="bg-warning-wash text-[#8a5a00] text-[12px] rounded-sm px-3 py-2">
          SimpleNow flagged {needsReviewCount} signing field{needsReviewCount > 1 ? "s" : ""} it wasn&rsquo;t fully confident about -- it added a
          clear signature page rather than guess a position on the original document.
        </div>
      )}
      {notice && <div className="bg-page text-ink-2 text-[12px] rounded-sm px-3 py-2 border border-border">{notice}</div>}

      <div>
        <div className="text-[12px] font-bold uppercase tracking-wider text-ink-muted mb-2">Recipients</div>
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="bg-page text-ink-muted text-left">
                <th className="font-semibold px-3 py-2">Name</th>
                <th className="font-semibold px-3 py-2">Role</th>
                <th className="font-semibold px-3 py-2">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {recipients.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-ink-muted text-[11px]">{r.email}</div>
                  </td>
                  <td className="px-3 py-2 text-ink-2">
                    {r.role === "signer" ? `Signs${r.signing_order ? ` (#${r.signing_order})` : ""}` : "Receives a copy"}
                  </td>
                  <td className="px-3 py-2 text-ink-2 capitalize">{r.status.replace(/_/g, " ")}</td>
                  <td className="px-3 py-2 text-right">
                    {((r.role === "signer" && r.status !== "signed" && envelope.status !== "completed") ||
                      (r.role === "cc" && isCompleted)) && (
                      <button onClick={() => resendTo(r.id)} disabled={busy === r.id} className="text-brand font-semibold text-[11.5px]">
                        Resend
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isCompleted && (
        <div>
          <div className="text-[12px] font-bold uppercase tracking-wider text-ink-muted mb-2">Share / Send Copy</div>
          <div className="flex gap-2">
            <input
              value={shareName}
              onChange={(e) => setShareName(e.target.value)}
              placeholder="Name"
              className="flex-1 border border-border rounded-sm px-2.5 py-2 text-[12.5px] bg-surface"
            />
            <input
              value={shareEmail}
              onChange={(e) => setShareEmail(e.target.value)}
              placeholder="Email"
              className="flex-1 border border-border rounded-sm px-2.5 py-2 text-[12.5px] bg-surface"
            />
            <button onClick={sendCopy} disabled={busy === "share"} className="bg-brand text-white text-[12.5px] font-bold px-3.5 py-2 rounded-sm">
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
