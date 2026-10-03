"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

// Small UI kit shared by the Money and Admin pages (client only).

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** fetch + JSON with the API's {error} message surfaced as an ApiError. */
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : undefined;
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
  } catch {
    throw new ApiError("Network error. Check your connection and try again.", 0);
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : `Request failed (${res.status})`;
    throw new ApiError(msg, res.status);
  }
  return body as T;
}

export function errorText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

/** Fill {placeholders}. */
export function fmt(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Load-on-mount helper with reload(). */
export function useLoad<T>(load: () => Promise<T>, deps: readonly unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);
  loadRef.current = load;
  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await loadRef.current());
    } catch (e) {
      setError(errorText(e, "Something went wrong."));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, setData, error, loading, reload };
}

export const inputCls =
  "w-full min-w-0 rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-ink-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-border bg-surface p-4 shadow-sm ${className}`}>{children}</section>;
}

export function SectionTitle({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
      <div className="min-w-0">
        <h2 className="text-[15px] font-bold text-ink">{title}</h2>
        {body && <p className="text-[12.5px] text-ink-muted mt-0.5 max-w-prose">{body}</p>}
      </div>
      {action}
    </div>
  );
}

type Variant = "primary" | "secondary" | "danger" | "ghost";

export function Button({
  children,
  variant = "secondary",
  busy,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  const v: Record<Variant, string> = {
    primary: "bg-brand text-white border-transparent hover:opacity-90",
    secondary: "bg-surface text-ink border-border hover:bg-page",
    danger: "bg-surface text-red-700 border-red-200 hover:bg-red-50",
    ghost: "bg-transparent text-ink-2 border-transparent hover:bg-page",
  };
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-[12.5px] font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60 disabled:cursor-not-allowed ${v[variant]} ${className}`}
    >
      {busy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: (id: string, describedBy: string | undefined) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={`flex flex-col gap-1 min-w-0 ${className}`}>
      <label htmlFor={id} className="text-[12px] font-bold text-ink-2">
        {label}
      </label>
      {children(id, hintId)}
      {hint && (
        <p id={hintId} className="text-[11.5px] text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center gap-2 py-8 justify-center text-[12.5px] text-ink-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" aria-hidden />
      {label}
    </div>
  );
}

export function ErrorBox({ message, onRetry, retryLabel }: { message: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-800">
      <span className="min-w-0">{message}</span>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          {retryLabel ?? "Try again"}
        </Button>
      )}
    </div>
  );
}

export function Notice({ message, tone = "ok" }: { message: string; tone?: "ok" | "warn" }) {
  return (
    <p
      role="status"
      className={`rounded-md px-3 py-2 text-[12.5px] ${tone === "ok" ? "bg-brand-wash text-brand-dark" : "bg-amber-50 text-amber-900 border border-amber-200"}`}
    >
      {message}
    </p>
  );
}

export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <div className="flex flex-col items-center text-center gap-1 py-10 px-4">
      <p className="text-[14px] font-bold text-ink">{title}</p>
      {body && <p className="text-[12.5px] text-ink-muted max-w-[360px]">{body}</p>}
    </div>
  );
}

const BADGE_TONES: Record<string, string> = {
  draft: "bg-page text-ink-2",
  submitted: "bg-blue-50 text-blue-800",
  pending: "bg-blue-50 text-blue-800",
  extracting: "bg-blue-50 text-blue-800",
  uploaded: "bg-blue-50 text-blue-800",
  review: "bg-amber-50 text-amber-900",
  manager_approved: "bg-blue-50 text-blue-800",
  hr_approved: "bg-blue-50 text-blue-800",
  approved: "bg-emerald-50 text-emerald-800",
  finance_approved: "bg-emerald-50 text-emerald-800",
  verified: "bg-emerald-50 text-emerald-800",
  invoiced: "bg-emerald-50 text-emerald-800",
  reimbursed: "bg-emerald-100 text-emerald-900",
  paid: "bg-emerald-100 text-emerald-900",
  rejected: "bg-red-50 text-red-800",
  failed: "bg-red-50 text-red-800",
  sent_back: "bg-amber-50 text-amber-900",
  cancelled: "bg-page text-ink-muted",
  superseded: "bg-page text-ink-muted",
  warn: "bg-amber-50 text-amber-900",
};

export function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${BADGE_TONES[tone] ?? "bg-page text-ink-2"}`}>
      {children}
    </span>
  );
}

/** Accessible tab strip (buttons with aria-selected; arrow keys move focus). */
export function Tabs<K extends string>({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: { key: K; label: string }[];
  active: K;
  onChange: (k: K) => void;
  label: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
    refs.current[next]?.focus();
    onChange(tabs[next].key);
  };
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto [scrollbar-width:none] border-b border-border">
      {tabs.map((t, i) => {
        const sel = t.key === active;
        return (
          <button
            key={t.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            aria-selected={sel}
            tabIndex={sel ? 0 : -1}
            onClick={() => onChange(t.key)}
            onKeyDown={(e) => onKey(e, i)}
            className={`shrink-0 whitespace-nowrap px-3 py-2 text-[12.5px] font-bold border-b-2 -mb-px focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
              sel ? "border-brand text-brand-dark" : "border-transparent text-ink-2 hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/** Modal dialog on top of the native <dialog> (focus trap + Esc for free). */
export function Dialog({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="w-[min(92vw,440px)] rounded-lg border border-border bg-surface p-0 text-ink shadow-xl backdrop:bg-black/40"
    >
      {open && (
        <div className="p-4 flex flex-col gap-3">
          <h2 id={titleId} className="text-[15px] font-bold">
            {title}
          </h2>
          {children}
        </div>
      )}
    </dialog>
  );
}

/** Confirm dialog; resolves through onConfirm. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger,
  busy,
  onConfirm,
  onClose,
  requireText,
  requireLabel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  requireText?: string;
  requireLabel?: string;
}) {
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);
  const blocked = !!requireText && typed.trim() !== requireText;
  return (
    <Dialog open={open} title={title} onClose={onClose}>
      <p className="text-[12.5px] text-ink-2">{body}</p>
      {requireText && (
        <Field label={requireLabel ?? requireText}>
          {(id) => <input id={id} className={inputCls} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />}
        </Field>
      )}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>{cancelLabel}</Button>
        <Button variant={danger ? "danger" : "primary"} busy={busy} disabled={blocked} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}

export const COMMON_CURRENCIES = ["USD", "EUR", "MXN", "BRL", "INR", "GBP", "CAD", "CHF", "AED", "SGD"] as const;

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Open a signed URL from an API route that returns {url}. */
export async function openSignedUrl(endpoint: string): Promise<void> {
  const win = window.open("", "_blank");
  if (win) win.opener = null;
  try {
    const { url } = await api<{ url: string }>(endpoint);
    if (win) win.location.href = url;
    else window.location.href = url;
  } catch (e) {
    win?.close();
    throw e;
  }
}
