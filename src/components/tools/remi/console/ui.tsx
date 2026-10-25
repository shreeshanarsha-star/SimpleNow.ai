"use client";

import React from "react";
import Icon from "@/components/Icon";

export type Role = "owner" | "admin" | "rep" | "viewer";
export const canAdmin = (r: Role) => r === "owner" || r === "admin";

export async function api<T = Record<string, unknown>>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.json !== undefined ? { "Content-Type": "application/json" } : {}), ...(init?.headers || {}) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

export function Card({ title, icon, action, children, className = "" }: { title?: React.ReactNode; icon?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-surface border border-border rounded-2xl shadow-soft-sm ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-2">
          <h3 className="text-[13px] font-bold text-ink flex items-center gap-2">
            {icon && <Icon name={icon} className="w-4 h-4 text-brand" />}
            {title}
          </h3>
          {action}
        </div>
      )}
      <div className="px-4 pb-4">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: "brand" | "good" | "warn" }) {
  const c = tone === "good" ? "text-good-text" : tone === "warn" ? "text-critical" : "text-ink";
  return (
    <div className="bg-surface border border-border rounded-2xl p-3.5 shadow-soft-sm">
      <div className="text-[11px] text-ink-muted font-medium">{label}</div>
      <div className={`text-[22px] font-extrabold leading-tight mt-0.5 ${c}`}>{value}</div>
      {hint && <div className="text-[10.5px] text-ink-muted mt-0.5">{hint}</div>}
    </div>
  );
}

export function Btn({
  children,
  onClick,
  variant = "ghost",
  disabled,
  type = "button",
  className = "",
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger" | "soft";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
  title?: string;
}) {
  const v =
    variant === "primary"
      ? "bg-[radial-gradient(circle_at_35%_30%,var(--accent-btn-1),var(--accent-btn-2))] text-white shadow-button hover:brightness-110 border-transparent"
      : variant === "danger"
      ? "bg-surface text-critical border-critical/30 hover:bg-critical-wash"
      : variant === "soft"
      ? "bg-brand-wash text-brand border-brand/20 hover:border-brand/40"
      : "bg-surface text-ink-2 border-border hover:text-brand hover:border-brand/40";
  return (
    <button type={type} title={title} onClick={onClick} disabled={disabled} className={`h-8 px-3 rounded-xl border text-[12px] font-semibold inline-flex items-center gap-1.5 transition-all disabled:opacity-50 ${v} ${className}`}>
      {children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11.5px] font-semibold text-ink-2">{label}</span>
      {children}
      {hint && <span className="block text-[10.5px] text-ink-muted leading-snug">{hint}</span>}
    </label>
  );
}

export const inputCls = "w-full h-9 rounded-xl border border-border bg-page px-3 text-[12.5px] text-ink outline-none focus:border-brand";
export const areaCls = "w-full rounded-xl border border-border bg-page px-3 py-2 text-[12.5px] text-ink outline-none focus:border-brand";

export function TierBadge({ tier, score }: { tier: string; score?: number }) {
  const c =
    tier === "hot" ? "bg-critical-wash text-critical border-critical/30" : tier === "warm" ? "bg-warning-wash text-[#8a5a00] border-warning/40" : "bg-page text-ink-muted border-border";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold border uppercase ${c}`}>
      {tier === "hot" ? "🔥" : tier === "warm" ? "◐" : "○"} {tier}
      {score !== undefined && <span className="font-semibold normal-case">· {score}</span>}
    </span>
  );
}

export const STATUS_LABEL: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  meeting: "Meeting",
  quoted: "Quoted",
  won: "Won",
  lost: "Lost",
};

export function Empty({ icon = "sparkle", title, children }: { icon?: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="text-center py-10 px-6">
      <div className="w-12 h-12 rounded-full bg-brand-wash text-brand mx-auto flex items-center justify-center mb-3">
        <Icon name={icon} className="w-6 h-6" />
      </div>
      <div className="font-bold text-ink text-sm">{title}</div>
      {children && <div className="text-[12px] text-ink-muted mt-1 max-w-md mx-auto">{children}</div>}
    </div>
  );
}

export function Bars({ items, max }: { items: { label: string; count: number }[]; max?: number }) {
  const m = max || Math.max(1, ...items.map((i) => i.count));
  if (!items.length) return <div className="text-[11.5px] text-ink-muted py-2">No data yet.</div>;
  return (
    <ul className="space-y-1.5">
      {items.map((i) => (
        <li key={i.label} className="text-[11.5px]">
          <div className="flex justify-between gap-2">
            <span className="text-ink truncate capitalize">{i.label}</span>
            <span className="text-ink-muted font-semibold">{i.count}</span>
          </div>
          <div className="h-1.5 rounded-full bg-page mt-0.5 overflow-hidden">
            <div className="h-full rounded-full bg-brand/70" style={{ width: `${(i.count / m) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function fmtDate(iso: string | null | undefined, withTime = true) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) });
}
