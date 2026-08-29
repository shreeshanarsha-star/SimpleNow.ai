"use client";

import Logo from "@/components/Logo";
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { org_name: orgName.trim() } },
    });

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
  }

  async function handleGoogleSignIn() {
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page px-4">
        <div className="w-full max-w-sm bg-surface border border-border rounded-lg p-8 text-center">
          <h1 className="text-[18px] font-bold m-0 mb-2">Check your email</h1>
          <p className="text-[13px] text-ink-2 m-0 mb-4">
            We sent a confirmation link to <strong>{email}</strong>. Once you confirm,
            you can sign in. Your organization{orgName.trim() ? ` "${orgName.trim()}"` : ""} is now
            pending approval from the platform owner — you&apos;ll get access to your
            tools once it&apos;s approved.
          </p>
          <Link href="/login" className="text-brand text-[13px] font-bold">
            Go to sign in
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
        <h1 className="text-[19px] font-bold m-0 mb-1">Create an account</h1>
        <p className="text-[12.5px] text-ink-muted m-0 mb-6">
          You&apos;ll set up your own organization. It needs a quick approval from the
          platform owner before your team can use any tools.
        </p>

        {error && (
          <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2 mb-4">
            {error}
          </div>
        )}

        <label className="block text-[12px] font-bold mb-1.5">Organization name</label>
        <input
          type="text"
          required
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          placeholder="Acme Inc."
          className="w-full border border-border rounded-sm px-3 py-2.5 text-[13.5px] mb-4 outline-none focus:border-brand"
        />

        <label className="block text-[12px] font-bold mb-1.5">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-border rounded-sm px-3 py-2.5 text-[13.5px] mb-4 outline-none focus:border-brand"
        />

        <label className="block text-[12px] font-bold mb-1.5">Password</label>
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-border rounded-sm px-3 py-2.5 text-[13.5px] mb-6 outline-none focus:border-brand"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand text-white font-bold text-[13px] rounded-sm py-2.5 disabled:opacity-60 shadow-soft-sm"
        >
          {loading ? "Creating account…" : "Sign up"}
        </button>

        <div className="flex items-center gap-3 my-4">
          <div className="h-px bg-border flex-1" />
          <span className="text-[11px] text-ink-muted">or</span>
          <div className="h-px bg-border flex-1" />
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          className="w-full flex items-center justify-center gap-2 border border-border rounded-sm py-2.5 text-[13px] font-bold text-ink hover:bg-page transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4c-7.5 0-14 4.2-17.7 10.7z"/>
            <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.1-5.1l-6.5-5.5C29.6 35.1 26.9 36 24 36c-5.3 0-9.7-3.1-11.3-7.6l-6.6 5.1C9.9 39.6 16.4 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.5 5.5C39.5 37.6 44 31.5 44 24c0-1.3-.1-2.7-.4-3.5z"/>
          </svg>
          Continue with Google
        </button>

        <p className="text-[11px] text-ink-muted text-center mt-3 mb-0">
          Signing up with Google? You&apos;ll name your organization on the next screen.
        </p>

        <p className="text-[12px] text-ink-muted text-center mt-4 mb-0">
          Already have an account?{" "}
          <Link href="/login" className="text-brand font-bold">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
