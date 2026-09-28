"use client";

import Icon from "@/components/Icon";
import { stageLabel, statusLabel, type StageKey, type StatusKey } from "@/lib/smartSourcePipeline";
import { waDigits } from "./pipelineUi";

export type NotifyPrompt = {
  candidateName: string;
  phone: string | null;
  email: string | null;
  stage: StageKey;
  status: StatusKey;
  message: string;
};

// Offered after a single-candidate Stage/Status change that has a candidate
// message template. Sending is manual (opens WhatsApp / the mail client with
// the message prefilled) -- nothing is sent automatically.
export default function NotifyCandidateBar({ prompt, onClose }: { prompt: NotifyPrompt; onClose: () => void }) {
  const wa = waDigits(prompt.phone);
  const subject = `Update: ${stageLabel(prompt.stage)} — ${statusLabel(prompt.status)}`;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[min(560px,calc(100vw-32px))]">
      <div className="bg-surface border border-border rounded-lg shadow-soft-lg p-3 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="text-[12.5px] text-ink">
            <span className="font-bold">Let {prompt.candidateName} know?</span>
            <p className="text-[12px] text-ink-2 mt-0.5 line-clamp-3">{prompt.message}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Dismiss" className="text-ink-muted hover:text-ink p-1 shrink-0">
            <Icon name="x" className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {wa && (
            <a
              href={`https://wa.me/${wa}?text=${encodeURIComponent(prompt.message)}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 text-[12px] font-bold px-2.5 py-1.5 rounded-sm bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <Icon name="whatsapp" className="w-3.5 h-3.5" /> WhatsApp
            </a>
          )}
          {prompt.email && (
            <a
              href={`mailto:${prompt.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(prompt.message)}`}
              onClick={onClose}
              className="inline-flex items-center gap-1.5 text-[12px] font-bold px-2.5 py-1.5 rounded-sm border border-border bg-page text-ink hover:border-brand/40"
            >
              <Icon name="mail" className="w-3.5 h-3.5" /> Email
            </a>
          )}
          <button type="button" onClick={onClose} className="text-[12px] font-bold px-2 py-1.5 text-ink-muted hover:text-ink">
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
