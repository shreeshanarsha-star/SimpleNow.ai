"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import { admin as s } from "@/lib/nrs/i18n/en/admin";
import { api, errorText } from "@/app/tools/nr-synergy/money/_components/ui";

export type InviteStatus = "invited" | "linked" | "already_linked" | "resent";

export interface InviteButtonProps {
  /** nrs_members.id */
  memberId: string;
  /** True when the member already has a sign-in (nrs_members.user_id set). */
  linked: boolean;
  /** Member's email, shown in the tooltip / accessible description. */
  email: string;
  /** Optional: the member is linked but hasn't accepted the invite yet (shows Resend). */
  pending?: boolean;
  /** Called after a successful invite, link or resend (e.g. to reload the Users table). */
  onDone?: (status: InviteStatus) => void;
  className?: string;
}

type Phase = "invite" | "resend" | "linked";

const btn =
  "inline-flex min-h-[32px] items-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-surface px-2.5 py-1 text-[12px] font-bold text-brand-dark transition-colors hover:bg-brand-wash focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60";

// Invite an NR Synergy member to sign in, link their existing SimpleNow
// account, or resend an unanswered invite. POST /api/nr-synergy/admin/invite.
//   <InviteButton memberId={m.id} linked={!!m.user_id} email={m.email} onDone={reload} />
// States: Invite (no sign-in) -> Resend (invite sent, not yet accepted) -> Linked.
export default function InviteButton({ memberId, linked, email, pending, onDone, className = "" }: InviteButtonProps) {
  const initial: Phase = !linked ? "invite" : pending ? "resend" : "linked";
  const [phase, setPhase] = useState<Phase>(initial);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      const r = await api<{ status: InviteStatus; pending?: boolean }>("/api/nr-synergy/admin/invite", {
        method: "POST",
        body: JSON.stringify({ memberId, resend: phase === "resend" }),
      });
      const next: Phase = r.status === "invited" || r.status === "resent" || r.pending ? "resend" : "linked";
      setPhase(next);
      setFlash(r.status === "invited" ? s.invite.invited : r.status === "resent" ? s.invite.resent : null);
      onDone?.(r.status);
    } catch (e) {
      setError(errorText(e, s.common.error));
    } finally {
      setBusy(false);
    }
  };

  if (phase === "linked") {
    return (
      <span
        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800 ${className}`}
        title={email}
      >
        <Icon name="check" className="w-3.5 h-3.5" />
        {s.invite.linked}
      </span>
    );
  }

  const isResend = phase === "resend";
  const hint = (isResend ? s.invite.hintResend : s.invite.hintInvite).replace("{email}", email);
  const label = isResend ? s.invite.resend : s.invite.send;
  return (
    <span className={`inline-flex flex-col items-start gap-1 ${className}`}>
      <span className="inline-flex flex-wrap items-center gap-1.5">
        {isResend && (
          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800">
            <Icon name="mail" className="w-3.5 h-3.5" />
            {s.invite.pending}
          </span>
        )}
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy}
          aria-busy={busy || undefined}
          title={hint}
          aria-label={`${label}. ${hint}`}
          className={btn}
        >
          {busy ? (
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
          ) : (
            <Icon name="mail" className="w-3.5 h-3.5" />
          )}
          {busy ? s.invite.sending : label}
        </button>
      </span>
      <span role="status" aria-live="polite" className="text-[11.5px] leading-snug text-emerald-800 empty:hidden">
        {flash}
      </span>
      {error && (
        <span role="alert" className="max-w-[260px] text-[11.5px] leading-snug text-red-700">
          {error}
        </span>
      )}
    </span>
  );
}
