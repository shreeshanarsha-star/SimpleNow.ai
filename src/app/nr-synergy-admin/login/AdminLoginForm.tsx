"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import Icon from "@/components/Icon";
import { createClient } from "@/lib/supabase/client";
import { admin as s } from "@/lib/nrs/i18n/en/admin";
import { fillSearch } from "@/lib/nrs/i18n/en/search";
import { NRS_BASE } from "@/lib/nrs/tabs";
import ConsoleMark from "../_components/ConsoleMark";

const L = s.console.login;

const inputCls =
  "w-full rounded-sm border border-border bg-surface px-3 py-2.5 text-[13.5px] text-ink placeholder:text-ink-muted outline-none transition-colors focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/30";

export default function AdminLoginForm({ next, signedInNonAdmin }: { next: string; signedInNonAdmin: string | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error: err } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
    if (err) {
      setLoading(false);
      setError(err.message);
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    // Full navigation so the server layout re-reads the fresh session cookie
    // and applies the HR check.
    window.location.href = next;
  }

  return (
    <main className="min-h-screen grid lg:grid-cols-[1.05fr_1fr] bg-page">
      {/* Brand panel (desktop) */}
      <section
        aria-hidden="true"
        className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-brand-dark p-12 text-white"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 15%, rgba(255,255,255,0.35), transparent 45%), radial-gradient(circle at 85% 80%, rgba(255,255,255,0.25), transparent 50%)",
          }}
        />
        <div className="relative flex items-center gap-3">
          <span className="w-10 h-10 rounded-md bg-white/15 ring-1 ring-white/30 flex items-center justify-center text-[14px] font-bold">
            NR
          </span>
          <span className="text-[15px] font-bold tracking-tight">{s.console.product}</span>
        </div>
        <div className="relative max-w-md">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">{s.console.name}</p>
          <h2 className="mt-3 text-[30px] font-bold leading-tight">{L.headline}</h2>
          <ul className="mt-8 flex flex-col gap-3 text-[13px] text-white/85">
            {(["users", "countries", "approvals", "content"] as const).map((k) => (
              <li key={k} className="flex items-start gap-2.5">
                <span className="mt-0.5 w-5 h-5 shrink-0 rounded-full bg-white/15 flex items-center justify-center">
                  <Icon name="check" className="w-3 h-3" />
                </span>
                <span>{s.console.overview.sectionHint[k]}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-[11.5px] text-white/60">{L.restricted}</p>
      </section>

      {/* Form */}
      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-[400px]">
          <div className="mb-8">
            <ConsoleMark size="lg" />
          </div>

          <form
            onSubmit={handleSubmit}
            className="rounded-lg border border-border bg-surface p-6 sm:p-8 shadow-soft"
            aria-describedby="nrs-admin-login-sub"
          >
            <h1 className="text-[20px] font-bold text-ink">{L.title}</h1>
            <p id="nrs-admin-login-sub" className="mt-1 mb-6 text-[12.5px] text-ink-muted">
              {L.subtitle}
            </p>

            {signedInNonAdmin && !error && (
              <div className="mb-4 rounded-sm bg-warning-wash px-3 py-2 text-[12.5px] text-ink" role="status">
                {fillSearch(L.notAdmin, { email: signedInNonAdmin })}
              </div>
            )}

            {error && (
              <div
                ref={errorRef}
                tabIndex={-1}
                role="alert"
                className="mb-4 flex items-start gap-2 rounded-sm bg-critical-wash px-3 py-2 text-[12.5px] text-critical focus:outline-none"
              >
                <Icon name="x" className="mt-px w-3.5 h-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <label htmlFor="nrs-admin-email" className="mb-1.5 block text-[12px] font-bold text-ink">
              {L.email}
            </label>
            <input
              id="nrs-admin-email"
              name="email"
              type="email"
              autoComplete="username"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`${inputCls} mb-4`}
            />

            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="nrs-admin-password" className="block text-[12px] font-bold text-ink">
                {L.password}
              </label>
              <Link
                href="/forgot-password"
                className="rounded-sm text-[11.5px] font-bold text-brand-dark hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                {L.forgot}
              </Link>
            </div>
            <div className="relative mb-6">
              <input
                id="nrs-admin-password"
                name="password"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputCls} pr-16`}
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                aria-pressed={show}
                aria-controls="nrs-admin-password"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm px-2 py-1 text-[11px] font-bold text-ink-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                {show ? L.hide : L.show}
                <span className="sr-only"> {L.password.toLowerCase()}</span>
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-sm bg-brand py-2.5 text-[13px] font-bold text-white shadow-soft-sm transition-opacity hover:opacity-95 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              {loading ? L.submitting : L.submit}
            </button>

            <p className="mt-4 flex items-center justify-center gap-1.5 text-[11.5px] text-ink-muted lg:hidden">
              <Icon name="gear" className="w-3.5 h-3.5" />
              {L.restricted}
            </p>
          </form>

          <p className="mt-5 text-center text-[12px] text-ink-muted">
            {L.employeeLink}{" "}
            <Link
              href={NRS_BASE}
              className="rounded-sm font-bold text-brand-dark hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {L.employeeLinkCta}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
