"use client";

import { useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });

    setLoading(false);
    // Always show the same confirmation, whether or not the email exists --
    // avoids leaking which addresses have accounts.
    if (!error) setSent(true);
    else setError(error.message);
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page px-4">
        <div className="w-full max-w-sm bg-surface border border-border rounded-lg p-8 text-center">
          <h1 className="text-[18px] font-bold m-0 mb-2">Check your email</h1>
          <p className="text-[13px] text-ink-2 m-0 mb-4">
            If an account exists for <strong>{email}</strong>, we&apos;ve sent a link to
            reset your password.
          </p>
          <Link href="/login" className="text-brand text-[13px] font-bold">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-page px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-surface border border-border rounded-lg p-8 shadow-soft"
      >
        <Logo height={32} />
        <div className="mb-4" />
        <h1 className="text-[19px] font-bold m-0 mb-1">Reset your password</h1>
        <p className="text-[12.5px] text-ink-muted m-0 mb-6">
          Enter your email and we&apos;ll send you a link to reset it.
        </p>

        {error && (
          <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2 mb-4">
            {error}
          </div>
        )}

        <label className="block text-[12px] font-bold mb-1.5">Email</label>
        <input
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-border rounded-sm px-3 py-2.5 text-[13.5px] mb-6 outline-none focus:border-brand"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand text-white font-bold text-[13px] rounded-sm py-2.5 disabled:opacity-60 shadow-soft-sm"
        >
          {loading ? "Sending…" : "Send reset link"}
        </button>

        <p className="text-[12px] text-ink-muted text-center mt-4 mb-0">
          <Link href="/login" className="text-brand font-bold">
            Back to sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
