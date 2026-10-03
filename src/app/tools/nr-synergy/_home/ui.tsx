import type { ReactNode } from "react";

// Small presentational helpers shared by the Home, Projects, Knowledge and
// Help modules. Server-safe (no hooks).

/** Fill {placeholders} in a module string. */
export function fill(str: string, vars: Record<string, string | number>): string {
  return str.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** "3 Oct 2026". Date-only strings are formatted in UTC so they never shift a day. */
export function fmtDate(value: string | null | undefined, timeZone?: string): string {
  if (!value) return "";
  const dateOnly = DATE_ONLY.test(value);
  const d = new Date(dateOnly ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: dateOnly ? "UTC" : timeZone,
  }).format(d);
}

/** "Sat 3 Oct, 14:30" in the given timezone (defaults to the runtime's). */
export function fmtDateTime(value: string | null | undefined, timeZone?: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  try {
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

export type Tone = "good" | "warning" | "critical" | "neutral" | "brand";

const TONES: Record<Tone, string> = {
  good: "bg-good-wash text-good-text",
  warning: "bg-warning-wash text-[#7a5200]",
  critical: "bg-critical-wash text-critical",
  neutral: "bg-page text-ink-2",
  brand: "bg-brand-wash text-brand-dark",
};

export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export function Card({
  children,
  className = "",
  as: Tag = "section",
  labelledBy,
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "article" | "div" | "li";
  labelledBy?: string;
}) {
  return (
    <Tag
      aria-labelledby={labelledBy}
      className={`bg-surface border border-border rounded-md p-4 sm:p-5 min-w-0 ${className}`}
    >
      {children}
    </Tag>
  );
}

export function SectionTitle({ id, children, aside }: { id?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-3">
      <h2 id={id} className="text-[14.5px] font-bold text-ink">
        {children}
      </h2>
      {aside}
    </div>
  );
}

export function PageHeader({ title, subtitle, aside }: { title: string; subtitle?: string; aside?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-2 mb-4">
      <div className="min-w-0">
        <h1 className="text-[22px] sm:text-[26px] font-bold text-ink tracking-tight">{title}</h1>
        {subtitle && <p className="text-[13px] text-ink-muted mt-0.5">{subtitle}</p>}
      </div>
      {aside}
    </header>
  );
}

export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="text-[12.5px] text-ink-muted py-2">{children}</p>;
}

export function ErrorLine({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-[12.5px] text-critical bg-critical-wash rounded-sm px-3 py-2">
      {children}
    </p>
  );
}

export function ProgressBar({ pct, label }: { pct: number; label: string }) {
  const v = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div
      role="progressbar"
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="h-2 w-full rounded-full bg-page overflow-hidden"
    >
      <div className="h-full bg-brand rounded-full" style={{ width: `${v}%` }} />
    </div>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="flex flex-col gap-2 animate-pulse" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-4 rounded bg-page" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}

/** Loading placeholder for a whole module page (used by loading.tsx files). */
export function PageSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-4">
      <span className="sr-only">{label}</span>
      <div className="h-7 w-48 rounded bg-page animate-pulse" />
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-surface border border-border rounded-md p-5">
            <Skeleton lines={3} />
          </div>
        ))}
      </div>
    </div>
  );
}

export const inputClass =
  "w-full rounded-sm border border-border bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-ink-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand";
export const labelClass = "block text-[12px] font-bold text-ink-2 mb-1";
export const primaryButtonClass =
  "inline-flex items-center justify-center gap-1.5 bg-brand text-white text-[12.5px] font-bold px-4 py-2 rounded-sm shadow-soft-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2";
export const secondaryButtonClass =
  "inline-flex items-center justify-center gap-1.5 border border-border bg-surface text-ink-2 text-[12.5px] font-bold px-3 py-1.5 rounded-sm hover:bg-page transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand";
export const linkClass =
  "text-brand-dark font-bold hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-sm";
